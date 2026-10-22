import json
from django.contrib.auth import get_user_model, login as auth_login, update_session_auth_hash
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import Group
from django.contrib.auth.views import LoginView, LogoutView, PasswordChangeView
from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.urls import reverse_lazy
from django.views.decorators.http import require_GET, require_POST

from audit.models import ActivityLog, log_activity
from dining.models import Area
from .models import (
    DEFAULT_EXTRA_OPTIONS,
    DEFAULT_PERMISSION_MATRIX,
    UserProfile,
    UserSystemConfig,
)

User = get_user_model()


def _sync_user_role_groups(user, department):
    """Đồng bộ quyền Django (Group, is_staff, is_superuser) theo Bộ phận."""
    role_map = {
        UserProfile.Department.ADMIN: (['Owner', 'Manager', 'Sales'], True, True),
        UserProfile.Department.MANAGER: (['Manager', 'Sales'], True, False),
        UserProfile.Department.ACCOUNTANT: (['Manager', 'Sales'], False, False),
        UserProfile.Department.CASHIER: (['Sales', 'Cashier'], False, False),
        UserProfile.Department.WAITER: (['Sales', 'Cashier'], False, False),
        UserProfile.Department.KITCHEN: (['Sales', 'Cashier'], False, False),
        UserProfile.Department.WAREHOUSE: (['Manager', 'Sales'], False, False),
        UserProfile.Department.UNDEFINED: (['Sales', 'Cashier'], False, False),
    }
    group_names, is_staff, is_superuser = role_map.get(
        department, (['Sales', 'Cashier'], False, False)
    )
    user.is_staff = is_staff
    user.is_superuser = is_superuser
    user.save(update_fields=['is_staff', 'is_superuser'])

    groups = []
    for gname in group_names:
        grp, _ = Group.objects.get_or_create(name=gname)
        groups.append(grp)
    user.groups.set(groups)


def _ensure_user_profile(user):
    """Đảm bảo mọi User đều có UserProfile hợp lệ."""
    profile, created = UserProfile.objects.get_or_create(user=user)
    if created:
        if user.is_superuser or user.username.lower() == 'admin':
            profile.department = UserProfile.Department.ADMIN
            profile.full_name = user.first_name or 'Admin'
        elif user.groups.filter(name='Manager').exists():
            profile.department = UserProfile.Department.MANAGER
            profile.full_name = user.first_name or user.username
        else:
            profile.department = UserProfile.Department.CASHIER
            profile.full_name = user.first_name or user.username
        profile.area_code = 'ALL'
        profile.save()
        if not user.first_name and profile.full_name:
            user.first_name = profile.full_name
            user.save(update_fields=['first_name'])
    return profile


def _serialize_user(user, current_user_id=None, index=None):
    profile = _ensure_user_profile(user)
    full_name = profile.full_name or user.get_full_name() or user.username
    return {
        'id': user.id,
        'code': index if index is not None else user.id,
        'username': user.username,
        'password_mask': '######',
        'full_name': full_name,
        'phone': profile.phone or '',
        'department': profile.department,
        'department_display': profile.get_department_display(),
        'area_code': profile.area_code or 'ALL',
        'is_current_user': (user.id == current_user_id),
    }


def _serialize_activity(log):
    if not log:
        return None
    return {
        'id': log.id,
        'time': log.formatted_time,
        'action_code': log.action,
        'action_display': log.get_action_display(),
        'action_color': log.action_color,
        'description': log.description,
        'reason': log.reason,
        'actor_name': log.display_actor,
    }


class AccountLoginView(LoginView):
    template_name = 'accounts/pages/login.html'
    redirect_authenticated_user = True

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx['allow_numeric_password_only'] = UserSystemConfig.get_solo().allow_numeric_password_only
        return ctx

    def post(self, request, *args, **kwargs):
        config = UserSystemConfig.get_solo()
        if config.allow_numeric_password_only:
            raw_username = (request.POST.get('username') or '').strip()
            raw_password = (request.POST.get('password') or '').strip()
            pin_candidate = raw_password or raw_username
            # Nếu người dùng chỉ nhập mật khẩu số (hoặc để trống tên đăng nhập)
            if (not raw_username and raw_password) or (not raw_password and raw_username.isdigit()):
                matched_user = None
                for u in User.objects.filter(is_active=True).order_by('id'):
                    if u.check_password(pin_candidate):
                        matched_user = u
                        break
                if matched_user is not None:
                    auth_login(request, matched_user, backend='django.contrib.auth.backends.ModelBackend')
                    log_activity(
                        actor=matched_user,
                        action=ActivityLog.Action.LOGIN,
                        description=f'Đăng nhập nhận ca bằng mật khẩu số ({matched_user.get_full_name() or matched_user.username})',
                        request=request,
                    )
                    return redirect(self.get_success_url())
        return super().post(request, *args, **kwargs)

    def form_valid(self, form):
        response = super().form_valid(form)
        user = self.request.user
        if user and user.is_authenticated:
            log_activity(
                actor=user,
                action=ActivityLog.Action.LOGIN,
                description=f'Đăng nhập nhận ca ({user.get_full_name() or user.username})',
                request=self.request,
            )
        return response


class AccountLogoutView(LogoutView):
    next_page = 'accounts:login'

    def dispatch(self, request, *args, **kwargs):
        if getattr(request, 'user', None) and request.user.is_authenticated and request.method == 'POST':
            user = request.user
            log_activity(
                actor=user,
                action=ActivityLog.Action.SYSTEM,
                description=f'Đăng xuất / Đổi ca ({user.get_full_name() or user.username})',
                request=request,
            )
        return super().dispatch(request, *args, **kwargs)


class AccountPasswordChangeView(PasswordChangeView):
    template_name = 'accounts/pages/password_change.html'
    success_url = reverse_lazy('dashboard:home')

    def post(self, request, *args, **kwargs):
        is_ajax = (
            request.headers.get('X-Requested-With') == 'XMLHttpRequest'
            or 'application/json' in (request.headers.get('Accept') or '')
        )
        old_password = (request.POST.get('old_password') or '').strip()
        new_password1 = (request.POST.get('new_password1') or '').strip()
        new_password2 = (request.POST.get('new_password2') or '').strip()

        user = request.user
        error_msg = None

        if not old_password:
            error_msg = 'Vui lòng nhập mật khẩu hiện tại.'
        elif not user.check_password(old_password):
            error_msg = 'Mật khẩu hiện tại không chính xác.'
        elif not new_password1:
            error_msg = 'Vui lòng nhập mật khẩu mới.'
        elif new_password1 != new_password2:
            error_msg = 'Mật khẩu xác nhận không khớp với mật khẩu mới.'
        elif old_password == new_password1:
            error_msg = 'Mật khẩu mới phải khác mật khẩu hiện tại.'

        if error_msg:
            if is_ajax:
                return JsonResponse({'ok': False, 'error': error_msg}, status=400)
            return render(request, self.template_name, {
                'form': self.get_form(),
                'custom_error': error_msg,
            })

        user.set_password(new_password1)
        user.save(update_fields=['password'])
        update_session_auth_hash(request, user)

        log_activity(
            actor=user,
            action=ActivityLog.Action.OTHER,
            description=f'Đổi mật khẩu tài khoản ({user.get_full_name() or user.username})',
            request=request,
        )

        if is_ajax:
            return JsonResponse({
                'ok': True,
                'message': 'Đã cập nhật mật khẩu mới thành công!',
            })

        from django.contrib import messages
        messages.success(request, 'Đã cập nhật mật khẩu mới thành công!')
        return redirect(self.success_url)


@login_required
def user_list_view(request):
    """Trang quản lý Người dùng - Admin đồng bộ giao diện POS."""
    users_qs = User.objects.filter(is_active=True).order_by('id')
    users_data = [
        _serialize_user(u, current_user_id=request.user.id, index=idx)
        for idx, u in enumerate(users_qs, start=1)
    ]
    areas = list(Area.objects.filter(is_active=True).values_list('name', flat=True))
    config = UserSystemConfig.get_solo()
    return render(request, 'accounts/pages/user_list.html', {
        'users_data': users_data,
        'departments': UserProfile.Department.choices,
        'areas': areas,
        'allow_numeric_password_only': config.allow_numeric_password_only,
    })


@login_required
@require_GET
def user_api_list(request):
    """API trả về danh sách người dùng và cấu hình cho modal Người dùng - Admin."""
    users_qs = User.objects.filter(is_active=True).order_by('id')
    users_data = [
        _serialize_user(u, current_user_id=request.user.id, index=idx)
        for idx, u in enumerate(users_qs, start=1)
    ]
    areas = list(Area.objects.filter(is_active=True).values_list('name', flat=True))
    config = UserSystemConfig.get_solo()
    return JsonResponse({
        'status': 'success',
        'users': users_data,
        'departments': [
            {'value': val, 'label': label}
            for val, label in UserProfile.Department.choices
        ],
        'areas': areas,
        'allow_numeric_password_only': config.allow_numeric_password_only,
    })


@login_required
@require_POST
def user_api_save(request):
    """API Thêm mới hoặc Cập nhật người dùng."""
    try:
        payload = json.loads(request.body.decode('utf-8'))
    except (ValueError, TypeError):
        return JsonResponse({'error': 'Dữ liệu gửi lên không hợp lệ.'}, status=400)

    user_id = payload.get('id')
    username = (payload.get('username') or '').strip()
    password = (payload.get('password') or '').strip()
    full_name = (payload.get('full_name') or '').strip()
    phone = (payload.get('phone') or '').strip()
    department = (payload.get('department') or UserProfile.Department.UNDEFINED).strip()
    area_code = (payload.get('area_code') or 'ALL').strip() or 'ALL'

    if not username:
        return JsonResponse({'error': 'Vui lòng nhập Tên truy cập.'}, status=400)

    valid_departments = dict(UserProfile.Department.choices)
    if department not in valid_departments:
        department = UserProfile.Department.UNDEFINED

    if user_id:
        try:
            target_user = User.objects.get(pk=int(user_id), is_active=True)
        except (User.DoesNotExist, ValueError):
            return JsonResponse({'error': 'Không tìm thấy người dùng cần sửa.'}, status=404)

        if User.objects.filter(username__iexact=username).exclude(pk=target_user.pk).exists():
            return JsonResponse({'error': f'Tên truy cập "{username}" đã tồn tại.'}, status=400)

        target_user.username = username
        target_user.first_name = full_name or username
        if password and password != '######':
            target_user.set_password(password)
        target_user.save()

        if target_user.pk == request.user.pk and password and password != '######':
            update_session_auth_hash(request, target_user)

        profile = _ensure_user_profile(target_user)
        profile.full_name = full_name or username
        profile.phone = phone
        profile.department = department
        profile.area_code = area_code
        profile.save()

        _sync_user_role_groups(target_user, department)

        log = log_activity(
            actor=request.user,
            action=ActivityLog.Action.SYSTEM,
            description=f'Cập nhật người dùng: {target_user.username} ({profile.full_name} - {profile.get_department_display()})',
            request=request,
            object_type='User',
            object_id=target_user.pk,
        )
        message = f'Đã cập nhật người dùng "{target_user.username}".'
    else:
        if not password or password == '######':
            return JsonResponse({'error': 'Vui lòng nhập Mật khẩu cho người dùng mới.'}, status=400)

        existing_inactive = User.objects.filter(username__iexact=username, is_active=False).first()
        if User.objects.filter(username__iexact=username, is_active=True).exists():
            return JsonResponse({'error': f'Tên truy cập "{username}" đã tồn tại.'}, status=400)

        if existing_inactive:
            target_user = existing_inactive
            target_user.username = username
            target_user.is_active = True
            target_user.first_name = full_name or username
            target_user.set_password(password)
            target_user.save()
        else:
            target_user = User.objects.create_user(
                username=username,
                password=password,
                first_name=full_name or username,
            )

        profile = _ensure_user_profile(target_user)
        profile.full_name = full_name or username
        profile.phone = phone
        profile.department = department
        profile.area_code = area_code
        profile.save()

        _sync_user_role_groups(target_user, department)

        log = log_activity(
            actor=request.user,
            action=ActivityLog.Action.SYSTEM,
            description=f'Thêm người dùng mới: {target_user.username} ({profile.full_name} - {profile.get_department_display()})',
            request=request,
            object_type='User',
            object_id=target_user.pk,
        )
        message = f'Đã thêm người dùng "{target_user.username}".'

    return JsonResponse({
        'status': 'success',
        'message': message,
        'user': _serialize_user(target_user, current_user_id=request.user.id),
        'activity_log': _serialize_activity(log),
    })


@login_required
@require_POST
def user_api_delete(request, user_id):
    """API Xóa người dùng."""
    try:
        target_user = User.objects.get(pk=user_id, is_active=True)
    except User.DoesNotExist:
        return JsonResponse({'error': 'Không tìm thấy người dùng cần xóa.'}, status=404)

    if target_user.pk == request.user.pk:
        return JsonResponse({'error': 'Không thể xóa tài khoản đang đăng nhập hiện tại.'}, status=400)

    if target_user.username.lower() == 'admin':
        return JsonResponse({'error': 'Không thể xóa tài khoản Quản trị viên gốc (admin).'}, status=400)

    profile = _ensure_user_profile(target_user)
    username = target_user.username
    full_name = profile.full_name or target_user.get_full_name() or username

    # Nếu user đã có hóa đơn lịch sử thì đánh dấu ngưng hoạt động để bảo toàn khóa ngoại, ngược lại xóa hẳn
    if hasattr(target_user, 'invoices') and target_user.invoices.exists():
        target_user.is_active = False
        target_user.save(update_fields=['is_active'])
    else:
        target_user.delete()

    log = log_activity(
        actor=request.user,
        action=ActivityLog.Action.SYSTEM,
        description=f'Xóa người dùng: {username} ({full_name})',
        request=request,
        object_type='User',
        object_id=user_id,
    )

    return JsonResponse({
        'status': 'success',
        'message': f'Đã xóa người dùng "{username}".',
        'activity_log': _serialize_activity(log),
    })


@login_required
@require_POST
def user_api_toggle_config(request):
    """API Lưu tùy chọn 'Cho phép chỉ cần nhập mật khẩu (dạng số) để truy cập'."""
    try:
        payload = json.loads(request.body.decode('utf-8'))
    except (ValueError, TypeError):
        return JsonResponse({'error': 'Dữ liệu không hợp lệ.'}, status=400)

    allow_pin = bool(payload.get('allow_numeric_password_only', False))
    config = UserSystemConfig.get_solo()
    config.allow_numeric_password_only = allow_pin
    config.save(update_fields=['allow_numeric_password_only', 'updated_at'])

    state_txt = 'Bật' if allow_pin else 'Tắt'
    log = log_activity(
        actor=request.user,
        action=ActivityLog.Action.SYSTEM,
        description=f'{state_txt} chế độ chỉ cần nhập mật khẩu (dạng số) để truy cập',
        request=request,
    )

    return JsonResponse({
        'status': 'success',
        'allow_numeric_password_only': config.allow_numeric_password_only,
        'message': f'Đã {state_txt.lower()} tùy chọn đăng nhập bằng mật khẩu dạng số.',
        'activity_log': _serialize_activity(log),
    })


@login_required
@require_GET
def permission_api_get(request):
    """API lấy ma trận phân quyền, tùy chọn mở rộng và quyền hạn của tài khoản đang đăng nhập."""
    config = UserSystemConfig.get_solo()
    profile = _ensure_user_profile(request.user)
    user_perms = config.get_user_permissions(request.user)
    is_admin = bool(
        request.user.is_superuser
        or request.user.username.lower() == 'admin'
        or profile.department == UserProfile.Department.ADMIN
    )
    return JsonResponse({
        'status': 'success',
        'permission_matrix': config.permission_matrix,
        'extra_options': config.extra_options,
        'current_user': {
            'id': request.user.id,
            'username': request.user.username,
            'full_name': profile.full_name or request.user.get_full_name() or request.user.username,
            'department': profile.department,
            'department_display': profile.get_department_display(),
            'is_admin': is_admin,
            'permissions': user_perms,
        },
    })


@login_required
@require_POST
def permission_api_save(request):
    """API lưu thiết lập Phân quyền sử dụng - Admin."""
    try:
        payload = json.loads(request.body.decode('utf-8'))
    except (ValueError, TypeError):
        return JsonResponse({'error': 'Dữ liệu gửi lên không hợp lệ.'}, status=400)

    config = UserSystemConfig.get_solo()
    user_perms = config.get_user_permissions(request.user)
    if not (user_perms.get('super_admin') or request.session.get('pos_elevated_auth')):
        return JsonResponse({'error': 'Bạn không có quyền thay đổi thiết lập phân quyền.'}, status=403)

    incoming_matrix = payload.get('permission_matrix') or {}
    incoming_extra = payload.get('extra_options') or {}

    new_matrix = {}
    for role_key, default_perms in DEFAULT_PERMISSION_MATRIX.items():
        role_input = incoming_matrix.get(role_key, {})
        if role_key == 'admin':
            new_matrix['admin'] = {perm_key: True for perm_key in default_perms}
        else:
            new_matrix[role_key] = {
                perm_key: bool(role_input.get(perm_key, default_val))
                for perm_key, default_val in default_perms.items()
            }

    new_extra = {
        opt_key: bool(incoming_extra.get(opt_key, default_val))
        for opt_key, default_val in DEFAULT_EXTRA_OPTIONS.items()
    }

    config.permission_matrix = new_matrix
    config.extra_options = new_extra
    config.save(update_fields=['permission_matrix', 'extra_options', 'updated_at'])

    log = log_activity(
        actor=request.user,
        action=ActivityLog.Action.SYSTEM,
        description='Cập nhật thiết lập Phân quyền sử dụng hệ thống',
        request=request,
    )

    updated_user_perms = config.get_user_permissions(request.user)
    return JsonResponse({
        'status': 'success',
        'message': 'Đã lưu thiết lập phân quyền sử dụng.',
        'permission_matrix': config.permission_matrix,
        'extra_options': config.extra_options,
        'current_user_permissions': updated_user_perms,
        'activity_log': _serialize_activity(log),
    })


@login_required
@require_POST
def permission_api_verify(request):
    """
    API Xác thực quyền hạn tạm thời (Yêu cầu quyền hạn)
    Khi tài khoản hiện tại (VD: thungan1) truy cập chức năng chưa được cấp quyền,
    nhập tài khoản có quyền (VD: admin) để mở chức năng đó mà KHÔNG đổi phiên đăng nhập của thungan1.
    """
    try:
        payload = json.loads(request.body.decode('utf-8'))
    except (ValueError, TypeError):
        return JsonResponse({'error': 'Dữ liệu gửi lên không hợp lệ.'}, status=400)

    username = (payload.get('username') or '').strip()
    password = (payload.get('password') or '').strip()
    required_permission = (payload.get('required_permission') or '').strip()
    feature_label = (payload.get('feature_label') or '').strip()

    if not username or not password:
        return JsonResponse({'error': 'Vui lòng nhập đầy đủ Tên truy cập và Mật khẩu.'}, status=400)

    target_user = User.objects.filter(username__iexact=username, is_active=True).first()
    if not target_user or not target_user.check_password(password):
        return JsonResponse({'error': 'Tên truy cập hoặc mật khẩu không chính xác.'}, status=400)

    config = UserSystemConfig.get_solo()
    target_profile = _ensure_user_profile(target_user)
    target_perms = config.get_user_permissions(target_user)
    is_target_admin = bool(
        target_user.is_superuser
        or target_user.username.lower() == 'admin'
        or target_profile.department == UserProfile.Department.ADMIN
    )

    if required_permission:
        has_perm = is_target_admin or bool(target_perms.get(required_permission, False))
        if not has_perm:
            return JsonResponse({
                'error': f'Tài khoản "{target_user.username}" ({target_profile.get_department_display()}) cũng không được cấp quyền sử dụng chức năng này.'
            }, status=403)
    else:
        if not is_target_admin and target_profile.department not in (UserProfile.Department.ADMIN, UserProfile.Department.MANAGER):
            return JsonResponse({
                'error': f'Tài khoản "{target_user.username}" không có quyền quản trị để cấp phép.'
            }, status=403)

    # Cấp quyền tạm thời trong session cho hành động/modal hiện tại mà không thay đổi request.user
    request.session['pos_elevated_auth'] = True
    request.session['pos_elevated_by'] = target_user.username
    request.session.modified = True

    desc_suffix = f' ({feature_label})' if feature_label else ''
    log = log_activity(
        actor=request.user,
        action=ActivityLog.Action.SYSTEM,
        description=f'Xác thực quyền hạn bởi "{target_user.username}" cho "{request.user.username}"{desc_suffix}',
        request=request,
    )

    return JsonResponse({
        'status': 'success',
        'message': f'Đã xác thực quyền hạn bởi {target_user.username}.',
        'authorized_by': {
            'username': target_user.username,
            'full_name': target_profile.full_name or target_user.username,
            'department_display': target_profile.get_department_display(),
        },
        'activity_log': _serialize_activity(log),
    })


@login_required
@require_POST
def permission_api_clear_elevation(request):
    """Xóa cờ nâng quyền tạm thời sau khi đóng chức năng được cấp quyền."""
    request.session.pop('pos_elevated_auth', None)
    request.session.pop('pos_elevated_by', None)
    request.session.modified = True
    return JsonResponse({'status': 'success'})

