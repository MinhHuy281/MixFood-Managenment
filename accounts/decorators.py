# File này chịu trách nhiệm cung cấp các decorator kiểm tra quyền truy cập theo vai trò (Role-Based Access Control) cho các view.
from functools import wraps

from django.core.exceptions import PermissionDenied
from django.http import JsonResponse


def role_required(*roles):
    # Hàm này dùng để tạo decorator kiểm tra người dùng đã đăng nhập và có thuộc danh sách vai trò được phép hay không. Input: *roles (các mã vai trò). Output: hàm decorator bảo vệ view.
    allowed_roles = set(roles)
    if 'Sales' in allowed_roles or 'Cashier' in allowed_roles:
        allowed_roles.update({'Sales', 'Cashier'})

    def decorator(view_func):
        # Hàm này dùng để bọc hàm view cần kiểm tra phân quyền vai trò. Input: view_func (hàm view Django). Output: hàm wrapped đã gắn kiểm tra quyền.
        @wraps(view_func)
        def wrapped(request, *args, **kwargs):
            # Hàm này dùng để kiểm tra xác thực và quyền của người dùng trước khi cho phép thực thi view gốc. Input: request, *args, **kwargs. Output: HttpResponse của view hoặc lỗi 403 PermissionDenied.
            if not request.user.is_authenticated:
                if request.headers.get('Content-Type') == 'application/json' or '/api/' in request.path or request.path.startswith('/sales/'):
                    return JsonResponse({'error': 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'}, status=401)
                raise PermissionDenied

            # Nếu đã xác thực tạm thời qua popup "Yêu cầu quyền hạn" trên POS
            if request.session.get('pos_elevated_auth'):
                return view_func(request, *args, **kwargs)

            if request.user.is_superuser or request.user.groups.filter(name__in=allowed_roles).exists():
                return view_func(request, *args, **kwargs)

            # Nếu tài khoản là nhân viên POS có gán role trong hồ sơ UserProfile hoặc chưa có group nào thì kiểm tra thêm
            profile = getattr(request.user, 'profile', None)
            if profile and getattr(profile, 'department', '') in allowed_roles:
                return view_func(request, *args, **kwargs)

            if request.headers.get('Content-Type') == 'application/json' or '/api/' in request.path or request.path.startswith('/sales/'):
                return JsonResponse({'error': 'Tài khoản của bạn chưa được cấp quyền thực hiện thao tác này.', 'require_elevation': True}, status=403)
            raise PermissionDenied

        return wrapped

    return decorator


def inventory_permission_required(view_func):
    # Hàm này dùng để kiểm tra quyền truy cập Mặt hàng, Định lượng nguyên liệu, Quản lý kho hàng và Xuất nhập tồn kho (bắt buộc Thu ngân phải xác thực quyền Admin/Quản lý kho). Input: view_func. Output: hàm wrapped.
    @wraps(view_func)
    def wrapped(request, *args, **kwargs):
        if not request.user.is_authenticated:
            if request.headers.get('Content-Type') == 'application/json' or '/api/' in request.path:
                return JsonResponse({'ok': False, 'error': 'Phiên đăng nhập đã hết hạn.'}, status=401)
            raise PermissionDenied

        if request.session.get('pos_elevated_auth') or request.user.is_superuser:
            return view_func(request, *args, **kwargs)

        user = request.user
        profile = getattr(user, 'profile', None)
        dept = getattr(profile, 'department', '') if profile else ''
        is_restricted_role = (
            dept in ('cashier', 'waiter', 'kitchen')
            or user.username.lower().startswith('thungan')
            or (
                user.groups.filter(name='Cashier').exists()
                and not user.groups.filter(name__in=('Owner', 'Manager', 'Warehouse')).exists()
            )
        )
        if is_restricted_role:
            from accounts.models import UserSystemConfig
            perms = UserSystemConfig.get_solo().get_user_permissions(user)
            if not perms.get('manage_inventory', False):
                if (
                    request.headers.get('Content-Type') == 'application/json'
                    or '/api/' in request.path
                    or request.headers.get('X-Requested-With') == 'XMLHttpRequest'
                ):
                    return JsonResponse({
                        'ok': False,
                        'error': 'Tài khoản Thu ngân cần xác thực quyền hạn (Admin / Quản lý kho) để truy cập chức năng này.',
                        'require_elevation': True,
                    }, status=403)
                raise PermissionDenied

        return view_func(request, *args, **kwargs)

    return wrapped

