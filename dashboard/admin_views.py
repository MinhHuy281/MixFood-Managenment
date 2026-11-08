# File này chịu trách nhiệm cung cấp giao diện và API cho trang Admin Live Remote Dashboard (/admin/), hỗ trợ giám sát thời gian thực mọi hoạt động của nhân viên và sơ đồ bàn trên thiết bị di động.
import json
from datetime import datetime, time
from decimal import Decimal

from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied
from django.db.models import Count, Prefetch, Q, Sum
from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.utils import timezone
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET, require_POST

from accounts.models import (
    DEFAULT_EXTRA_OPTIONS,
    DEFAULT_PERMISSION_MATRIX,
    UserProfile,
    UserSystemConfig,
)
from accounts.views import _sync_user_role_groups
from audit.models import ActivityLog
from catalog.models import Category, Ingredient, Product
from dining.models import Area, DiningTable
from inventory.models import Recipe, RecipeItem
from sales.models import Invoice, Order, OrderItem, Payment

User = get_user_model()

SENSITIVE_ACTIONS = {
    ActivityLog.Action.CANCEL_ITEM,
    ActivityLog.Action.RETURN_ITEM,
    ActivityLog.Action.EDIT_PRICE,
    ActivityLog.Action.DELETE_INVOICE,
    ActivityLog.Action.EDIT_INVOICE,
    ActivityLog.Action.DELETE_ORDER,
}


def _check_admin_privilege(user):
    # Hàm này dùng để kiểm tra tài khoản người dùng có quyền Quản trị viên (Superuser, Staff, Owner, Manager, Admin) hay không. Input: user. Output: bool.
    if not user.is_authenticated:
        return False
    if user.is_superuser or user.is_staff:
        return True
    if user.groups.filter(name__in=['Owner', 'Manager', 'Admin']).exists():
        return True
    profile = getattr(user, 'profile', None)
    if profile and getattr(profile, 'department', '') in ['Owner', 'Manager', 'Admin']:
        return True
    return False


def _format_money(amount):
    # Hàm này dùng để định dạng số tiền VND có dấu chấm ngăn cách hàng nghìn. Input: amount (Decimal hoặc int/float). Output: chuỗi định dạng (str).
    try:
        val = int(Decimal(str(amount or 0)))
        return f"{val:,.0f}".replace(',', '.') + " đ"
    except Exception:
        return "0 đ"


def _time_ago(dt):
    # Hàm này dùng để tính toán thời gian tương đối so với hiện tại. Input: dt (datetime). Output: chuỗi mô tả (str) ví dụ "5 giây trước", "2 phút trước".
    now = timezone.localtime()
    local_dt = timezone.localtime(dt)
    diff = now - local_dt
    seconds = int(diff.total_seconds())
    if seconds < 5:
        return "vừa xong"
    if seconds < 60:
        return f"{seconds}s trước"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes}p trước"
    hours = minutes // 60
    if hours < 24:
        return f"{hours}h trước"
    return local_dt.strftime('%d/%m %H:%M')


def admin_login_view(request):
    """
    Hàm này dùng để xử lý đăng nhập chuyên biệt cho phân hệ Quản trị Admin (/admin/login/).
    Tự động liên kết phiên đăng nhập vào cookie 'admin_sessionid' mà không ảnh hưởng tới POS.
    Input: HttpRequest (GET hiển thị form, POST xử lý xác thực).
    Output: HttpResponse render HTML hoặc chuyển hướng về /admin/.
    """
    next_url = request.GET.get('next') or request.POST.get('next') or '/admin/'
    error_msg = None
    if request.GET.get('error') == 'not_admin':
        error_msg = "Tài khoản của bạn không có quyền Quản trị viên hệ thống."

    if request.user.is_authenticated and _check_admin_privilege(request.user):
        return redirect(next_url)

    if request.method == 'POST':
        username = request.POST.get('username', '').strip()
        password = request.POST.get('password', '')
        user = authenticate(request, username=username, password=password)
        if user is not None:
            if not _check_admin_privilege(user):
                error_msg = "Tài khoản đăng nhập thành công nhưng không có quyền Quản trị viên (Admin/Manager/Owner)."
            else:
                login(request, user)
                ActivityLog.objects.create(
                    actor=user,
                    action=ActivityLog.Action.LOGIN,
                    description=f"Quản trị viên '{user.username}' đăng nhập phiên Admin thành công từ {request.META.get('REMOTE_ADDR', '127.0.0.1')}."
                )
                return redirect(next_url)
        else:
            error_msg = "Tên đăng nhập hoặc mật khẩu quản trị không chính xác."

    return render(request, 'dashboard/pages/admin_login.html', {
        'error_msg': error_msg,
        'next': next_url,
    })


def admin_logout_view(request):
    """
    Hàm này dùng để đăng xuất phiên Quản trị Admin (/admin/logout/).
    Chỉ xóa cookie admin_sessionid mà bảo lưu hoàn toàn phiên đăng nhập của nhân viên bán hàng trên POS.
    Input: HttpRequest.
    Output: HttpResponseRedirect chuyển hướng về /admin/login/.
    """
    if request.user.is_authenticated:
        ActivityLog.objects.create(
            actor=request.user,
            action=ActivityLog.Action.SYSTEM,
            description=f"Quản trị viên '{request.user.username}' đăng xuất khỏi hệ thống Admin."
        )
    logout(request)
    return redirect('/admin/login/')


def admin_live_dashboard(request):
    """
    Hàm này dùng để render giao diện Admin Live Remote Dashboard (/admin/) trên cả thiết bị di động và máy tính.
    Input: HttpRequest.
    Output: HttpResponse render HTML hoặc chuyển hướng về /admin/login/.
    """
    if not request.user.is_authenticated:
        return redirect(f"/admin/login/?next={request.path}")
    if not _check_admin_privilege(request.user):
        return redirect(f"/admin/login/?next={request.path}&error=not_admin")

    now = timezone.localtime()
    day_started_at = timezone.make_aware(datetime.combine(now.date(), time.min))

    # Thống kê KPI ngày hôm nay
    paid_invoices = Invoice.objects.filter(status=Invoice.Status.PAID, paid_at__gte=day_started_at)
    total_revenue = paid_invoices.aggregate(total=Sum('total_amount'))['total'] or Decimal('0')
    paid_count = paid_invoices.count()

    total_tables = DiningTable.objects.filter(is_active=True).count()
    occupied_tables = DiningTable.objects.filter(is_active=True, status=DiningTable.Status.OCCUPIED).count()

    sensitive_count = ActivityLog.objects.filter(
        created_at__gte=day_started_at,
        action__in=SENSITIVE_ACTIONS
    ).count()

    open_orders = Order.objects.filter(
        status__in=[Order.Status.DRAFT, Order.Status.CONFIRMED],
        table__isnull=False
    )
    accumulated_pending = open_orders.aggregate(total=Sum('total_amount'))['total'] or Decimal('0')

    # Lấy danh sách khu vực và bàn phục vụ
    areas = Area.objects.filter(is_active=True).prefetch_related(
        Prefetch('tables', queryset=DiningTable.objects.filter(is_active=True).select_related('area'))
    )

    # 40 sự kiện mới nhất cho render ban đầu
    recent_logs = ActivityLog.objects.select_related('actor').order_by('-created_at')[:40]

    # Danh sách nhân viên hoạt động trong ngày
    active_staff_users = User.objects.filter(
        is_active=True
    ).order_by('username')

    context = {
        'current_time': now,
        'kpi_revenue_today': _format_money(total_revenue),
        'kpi_paid_count': paid_count,
        'kpi_occupied_count': occupied_tables,
        'kpi_total_tables': total_tables,
        'kpi_pending_amount': _format_money(accumulated_pending),
        'kpi_sensitive_count': sensitive_count,
        'areas': areas,
        'recent_logs': recent_logs,
        'active_staff_users': active_staff_users,
        'user': request.user,
    }
    return render(request, 'dashboard/pages/admin_live_dashboard.html', context)


@never_cache
@require_GET
def admin_live_api(request):
    # Hàm này dùng để trả về dữ liệu cập nhật thời gian thực (Polling JSON) cho Admin Live Dashboard: KPI, sự kiện người dùng mới, trạng thái bàn. Input: HttpRequest (last_id, filter_action, filter_staff). Output: JsonResponse.
    if not request.user.is_authenticated or not _check_admin_privilege(request.user):
        return JsonResponse({'ok': False, 'error': 'Quyền truy cập bị từ chối. Vui lòng đăng nhập Admin.'}, status=401)

    now = timezone.localtime()
    day_started_at = timezone.make_aware(datetime.combine(now.date(), time.min))

    last_id = request.GET.get('last_id')
    try:
        last_id = int(last_id) if last_id else 0
    except (ValueError, TypeError):
        last_id = 0

    filter_mode = request.GET.get('filter_mode', 'all')
    filter_staff = request.GET.get('filter_staff', '')

    # 1. KPIs
    paid_invoices = Invoice.objects.filter(status=Invoice.Status.PAID, paid_at__gte=day_started_at)
    total_revenue = paid_invoices.aggregate(total=Sum('total_amount'))['total'] or Decimal('0')
    paid_count = paid_invoices.count()

    total_tables = DiningTable.objects.filter(is_active=True).count()
    occupied_tables = DiningTable.objects.filter(is_active=True, status=DiningTable.Status.OCCUPIED).count()

    sensitive_count = ActivityLog.objects.filter(
        created_at__gte=day_started_at,
        action__in=SENSITIVE_ACTIONS
    ).count()

    open_orders = Order.objects.filter(
        status__in=[Order.Status.DRAFT, Order.Status.CONFIRMED],
        table__isnull=False
    )
    accumulated_pending = open_orders.aggregate(total=Sum('total_amount'))['total'] or Decimal('0')

    # 2. Activity Logs Query
    log_query = ActivityLog.objects.select_related('actor')
    if last_id > 0:
        log_query = log_query.filter(id__gt=last_id).order_by('created_at')[:50]
    else:
        log_query = log_query.order_by('-created_at')[:40]

    activities_data = []
    max_id = last_id
    for item in log_query:
        if item.id > max_id:
            max_id = item.id
        is_sensitive = item.action in SENSITIVE_ACTIONS
        activities_data.append({
            'id': item.id,
            'actor_name': item.display_actor,
            'action': item.action,
            'action_label': item.get_action_display(),
            'action_color': item.action_color,
            'is_sensitive': is_sensitive,
            'description': item.description,
            'reason': item.reason,
            'full_detail': item.full_detail,
            'time_str': timezone.localtime(item.created_at).strftime('%H:%M:%S'),
            'time_ago': _time_ago(item.created_at),
            'timestamp': item.created_at.timestamp(),
        })

    # Nếu truy vấn ban đầu (last_id == 0), đảo ngược để hiển thị từ mới nhất
    if last_id == 0:
        activities_data.reverse()

    # 3. Sơ đồ bàn & Đơn hàng đang mở
    active_orders_map = {}
    for ord_obj in open_orders.select_related('table', 'created_by').prefetch_related('items'):
        if ord_obj.table_id:
            item_count = sum(it.quantity for it in ord_obj.items.filter(status=OrderItem.Status.ACTIVE))
            active_orders_map[ord_obj.table_id] = {
                'order_id': ord_obj.id,
                'order_code': ord_obj.order_code,
                'staff': ord_obj.created_by.get_full_name() or ord_obj.created_by.username,
                'opened_at': timezone.localtime(ord_obj.created_at).strftime('%H:%M'),
                'item_count': item_count,
                'subtotal': float(ord_obj.subtotal),
                'total_amount': float(ord_obj.total_amount),
                'total_fmt': _format_money(ord_obj.total_amount),
            }

    tables_data = []
    for tbl in DiningTable.objects.filter(is_active=True).select_related('area').order_by('area__display_order', 'display_order', 'name'):
        ord_info = active_orders_map.get(tbl.id)
        tables_data.append({
            'id': tbl.id,
            'name': tbl.name,
            'area_id': tbl.area_id,
            'area_name': tbl.area.name,
            'status': tbl.status,
            'status_display': tbl.get_status_display(),
            'capacity': tbl.capacity,
            'order': ord_info,
        })

    return JsonResponse({
        'ok': True,
        'server_time': now.strftime('%H:%M:%S'),
        'server_date': now.strftime('%d/%m/%Y'),
        'latest_id': max_id,
        'kpis': {
            'revenue_today': float(total_revenue),
            'revenue_today_fmt': _format_money(total_revenue),
            'paid_count': paid_count,
            'occupied_count': occupied_tables,
            'total_tables': total_tables,
            'pending_amount': float(accumulated_pending),
            'pending_amount_fmt': _format_money(accumulated_pending),
            'sensitive_count': sensitive_count,
        },
        'activities': activities_data,
        'tables': tables_data,
    })


@never_cache
@require_GET
def admin_table_detail_api(request, table_id):
    # Hàm này dùng để trả về thông tin chi tiết các món ăn mà bàn đang gọi trên POS phục vụ Admin xem chi tiết. Input: HttpRequest, table_id. Output: JsonResponse.
    if not request.user.is_authenticated or not _check_admin_privilege(request.user):
        return JsonResponse({'ok': False, 'error': 'Quyền truy cập bị từ chối. Vui lòng đăng nhập Admin.'}, status=401)

    table = DiningTable.objects.filter(pk=table_id, is_active=True).select_related('area').first()
    if not table:
        return JsonResponse({'ok': False, 'error': 'Bàn không tồn tại.'}, status=404)

    order = Order.objects.filter(
        table=table,
        status__in=[Order.Status.DRAFT, Order.Status.CONFIRMED]
    ).select_related('created_by').prefetch_related('items').order_by('-created_at', '-id').first()

    if not order:
        return JsonResponse({
            'ok': True,
            'has_order': False,
            'table': {
                'id': table.id,
                'name': table.name,
                'area': table.area.name,
                'status': table.get_status_display(),
            }
        })

    items = []
    for it in order.items.filter(status=OrderItem.Status.ACTIVE):
        items.append({
            'name': it.product_name,
            'unit': it.unit,
            'quantity': it.quantity,
            'price': float(it.unit_price),
            'price_fmt': _format_money(it.unit_price),
            'total': float(it.total_amount),
            'total_fmt': _format_money(it.total_amount),
            'note': it.note or '',
        })

    return JsonResponse({
        'ok': True,
        'has_order': True,
        'table': {
            'id': table.id,
            'name': table.name,
            'area': table.area.name,
            'status': table.get_status_display(),
        },
        'order': {
            'order_code': order.order_code,
            'staff': order.created_by.get_full_name() or order.created_by.username,
            'created_at': timezone.localtime(order.created_at).strftime('%d/%m/%Y %H:%M:%S'),
            'subtotal_fmt': _format_money(order.subtotal),
            'discount_fmt': _format_money(order.discount_amount),
            'surcharge_fmt': _format_money(order.surcharge_amount),
            'total': float(order.total_amount),
            'total_fmt': _format_money(order.total_amount),
            'note': order.note or '',
            'items': items,
        }
    })


# =========================================================================
# PHÂN HỆ QUẢN TRỊ ADMIN RIÊNG CHO THIẾT BỊ DI ĐỘNG (MOBILE-FIRST)
# =========================================================================

def _require_admin(request):
    """
    Hàm phụ trợ kiểm tra quyền Admin, trả về HttpResponseRedirect nếu chưa đăng nhập.
    Input: request. Output: HttpResponseRedirect hoặc None.
    """
    if not request.user.is_authenticated:
        return redirect(f"/admin/login/?next={request.path}")
    if not _check_admin_privilege(request.user):
        return redirect(f"/admin/login/?next={request.path}&error=not_admin")
    return None


# 1. NGƯỜI DÙNG HỆ THỐNG (/admin/users/)
def admin_users_view(request):
    """
    Hàm này dùng để render giao diện Quản lý Người dùng hệ thống trên Mobile cho Admin.
    Input: HttpRequest. Output: HttpResponse HTML.
    """
    auth_check = _require_admin(request)
    if auth_check:
        return auth_check

    query = request.GET.get('q', '').strip()
    dept = request.GET.get('dept', '').strip()

    users_qs = User.objects.select_related('profile').order_by('-is_active', 'username')
    if query:
        users_qs = users_qs.filter(Q(username__icontains=query) | Q(first_name__icontains=query) | Q(profile__full_name__icontains=query))
    if dept:
        users_qs = users_qs.filter(profile__department=dept)

    users_data = []
    for u in users_qs:
        prof = getattr(u, 'profile', None)
        users_data.append({
            'id': u.id,
            'username': u.username,
            'full_name': (prof.full_name if prof else '') or u.first_name or u.username,
            'phone': prof.phone if prof else '',
            'department': prof.department if prof else 'Undefined',
            'department_display': prof.get_department_display() if prof else 'Chưa phân loại',
            'is_active': u.is_active,
            'is_superuser': u.is_superuser,
            'is_staff': u.is_staff,
            'date_joined': timezone.localtime(u.date_joined).strftime('%d/%m/%Y'),
        })

    dept_choices = UserProfile.Department.choices

    return render(request, 'dashboard/admin_pages/admin_users.html', {
        'users': users_data,
        'dept_choices': dept_choices,
        'search_query': query,
        'selected_dept': dept,
    })


@require_POST
def admin_users_save_api(request):
    """
    Hàm này dùng để thêm mới hoặc cập nhật người dùng trực tiếp từ giao diện Admin Mobile.
    Input: HttpRequest (JSON). Output: JsonResponse.
    """
    if not request.user.is_authenticated or not _check_admin_privilege(request.user):
        return JsonResponse({'ok': False, 'message': 'Quyền truy cập bị từ chối.'}, status=403)

    try:
        data = json.loads(request.body.decode('utf-8'))
    except Exception:
        data = request.POST

    user_id = data.get('user_id')
    username = str(data.get('username') or '').strip()
    full_name = str(data.get('full_name') or '').strip()
    password = str(data.get('password') or '').strip()
    phone = str(data.get('phone') or '').strip()
    department = str(data.get('department') or 'Cashier').strip()
    is_active = bool(data.get('is_active', True))

    if not username:
        return JsonResponse({'ok': False, 'message': 'Tên đăng nhập không được để trống.'}, status=400)

    if user_id:
        target_user = User.objects.filter(pk=user_id).first()
        if not target_user:
            return JsonResponse({'ok': False, 'message': 'Không tìm thấy người dùng cần sửa.'}, status=404)
        target_user.username = username
        target_user.first_name = full_name
        target_user.is_active = is_active
        if password:
            if len(password) < 4:
                return JsonResponse({'ok': False, 'message': 'Mật khẩu mới phải từ 4 ký tự trở lên.'}, status=400)
            target_user.set_password(password)
        target_user.save()

        profile, _ = UserProfile.objects.get_or_create(user=target_user)
        profile.full_name = full_name
        profile.phone = phone
        profile.department = department
        profile.save()

        _sync_user_role_groups(target_user, department)
        msg = f"Đã cập nhật thông tin tài khoản '{username}' thành công."
    else:
        if not password or len(password) < 4:
            return JsonResponse({'ok': False, 'message': 'Mật khẩu khởi tạo phải từ 4 ký tự trở lên.'}, status=400)
        if User.objects.filter(username__iexact=username).exists():
            return JsonResponse({'ok': False, 'message': f"Tên đăng nhập '{username}' đã được sử dụng."}, status=400)

        target_user = User.objects.create(username=username, first_name=full_name, is_active=is_active)
        target_user.set_password(password)
        target_user.save()

        profile = UserProfile.objects.create(user=target_user, full_name=full_name, phone=phone, department=department)
        _sync_user_role_groups(target_user, department)
        msg = f"Đã tạo mới nhân viên '{username}' thành công."

    ActivityLog.objects.create(
        actor=request.user,
        action=ActivityLog.Action.SYSTEM,
        description=f"Admin '{request.user.username}' {msg}",
        request=request,
    )
    return JsonResponse({'ok': True, 'message': msg})


@require_POST
def admin_users_delete_api(request, user_id):
    """
    Hàm này dùng để khóa tài khoản người dùng từ giao diện Admin Mobile.
    Input: HttpRequest, user_id. Output: JsonResponse.
    """
    if not request.user.is_authenticated or not _check_admin_privilege(request.user):
        return JsonResponse({'ok': False, 'message': 'Quyền truy cập bị từ chối.'}, status=403)

    target_user = User.objects.filter(pk=user_id).first()
    if not target_user:
        return JsonResponse({'ok': False, 'message': 'Người dùng không tồn tại.'}, status=404)
    if target_user.id == request.user.id:
        return JsonResponse({'ok': False, 'message': 'Không thể khóa chính tài khoản đang đăng nhập.'}, status=400)

    username = target_user.username
    target_user.is_active = False
    target_user.save(update_fields=['is_active'])

    ActivityLog.objects.create(
        actor=request.user,
        action=ActivityLog.Action.SYSTEM,
        description=f"Admin '{request.user.username}' đã khóa tài khoản nhân viên '{username}'.",
        request=request,
    )
    return JsonResponse({'ok': True, 'message': f"Đã khóa tài khoản '{username}'."})


# 2. PHÂN QUYỀN SỬ DỤNG (/admin/permissions/)
def admin_permissions_view(request):
    """
    Hàm này dùng để render giao diện cấu hình Ma trận 11 Quyền hạn trên Mobile cho Admin.
    Input: HttpRequest. Output: HttpResponse HTML.
    """
    auth_check = _require_admin(request)
    if auth_check:
        return auth_check

    config = UserSystemConfig.get_solo()
    matrix = config.permission_matrix or DEFAULT_PERMISSION_MATRIX
    extra_options = config.extra_options or DEFAULT_EXTRA_OPTIONS

    roles_data = [
        {'key': 'manager', 'label': 'Quản lý'},
        {'key': 'accountant', 'label': 'Kế toán'},
        {'key': 'cashier', 'label': 'Thu ngân'},
        {'key': 'kitchen', 'label': 'Chế biến'},
        {'key': 'waiter', 'label': 'Phục vụ'},
    ]

    permission_definitions = [
        {'key': 'cancel_received_item', 'label': 'Hủy món đã nhận', 'desc': 'Cho phép hủy món khi bếp đã nhận order'},
        {'key': 'edit_item_price', 'label': 'Sửa giá món', 'desc': 'Cho phép điều chỉnh đơn giá món khi gọi món'},
        {'key': 'edit_delete_invoice', 'label': 'Sửa xóa hóa đơn', 'desc': 'Cho phép sửa hoặc hủy hóa đơn bán hàng'},
        {'key': 'reprint_invoice', 'label': 'In lại hóa đơn', 'desc': 'Cho phép in lại hóa đơn đã thanh toán'},
        {'key': 'view_sales_report', 'label': 'Xem báo cáo bán hàng', 'desc': 'Xem doanh thu và báo cáo ca'},
        {'key': 'manage_inventory', 'label': 'Quản lý kho, nguyên liệu', 'desc': 'Nhập xuất và kiểm kê kho hàng'},
        {'key': 'manage_cashbook', 'label': 'Quản lý thu chi tiền mặt', 'desc': 'Lập phiếu thu chi quỹ tiền mặt'},
        {'key': 'manage_staff_shift', 'label': 'Quản lý nhân viên, ca', 'desc': 'Phân ca và kiểm tra giao tiền kết ca'},
        {'key': 'manage_customers', 'label': 'Quản lý khách hàng', 'desc': 'Tạo và tích điểm thẻ thành viên VIP'},
        {'key': 'business_settings', 'label': 'Cài đặt kinh doanh', 'desc': 'Sửa menu món, giá bán, khuyến mãi'},
        {'key': 'system_settings', 'label': 'Thiết lập hệ thống', 'desc': 'Cài đặt máy in POS, két tiền'},
    ]

    extra_definitions = [
        {'key': 'tablet_lock_transfer_split', 'label': 'Khóa chuyển tách bàn trên Tablet/Phone'},
        {'key': 'tablet_lock_receive_print', 'label': 'Khóa nhận/in món trên Tablet/Phone'},
        {'key': 'tablet_lock_payment', 'label': 'Khóa thanh toán trên Tablet/Phone'},
        {'key': 'tablet_lock_discount_vip', 'label': 'Khóa giảm giá, thẻ VIP, tiếp khách trên Tablet/Phone'},
        {'key': 'lock_edit_price_all_roles', 'label': 'Khóa sửa giá món bất chấp cấp bậc người dùng'},
        {'key': 'hide_shift_close_numbers', 'label': 'Ẩn số tiền và số hóa đơn khi kết ca'},
    ]

    return render(request, 'dashboard/admin_pages/admin_permissions.html', {
        'roles': roles_data,
        'permission_definitions': permission_definitions,
        'extra_definitions': extra_definitions,
        'matrix_json': json.dumps(matrix),
        'extra_json': json.dumps(extra_options),
    })


@require_POST
def admin_permissions_save_api(request):
    """
    Hàm này dùng để lưu ma trận phân quyền từ giao diện Admin Mobile.
    Input: HttpRequest (JSON). Output: JsonResponse.
    """
    if not request.user.is_authenticated or not _check_admin_privilege(request.user):
        return JsonResponse({'ok': False, 'message': 'Quyền truy cập bị từ chối.'}, status=403)

    try:
        payload = json.loads(request.body.decode('utf-8'))
    except Exception:
        return JsonResponse({'ok': False, 'message': 'Dữ liệu không hợp lệ.'}, status=400)

    config = UserSystemConfig.get_solo()
    matrix = payload.get('permission_matrix')
    extra = payload.get('extra_options')

    if isinstance(matrix, dict):
        config.permission_matrix = matrix
    if isinstance(extra, dict):
        config.extra_options = extra

    config.save()

    ActivityLog.objects.create(
        actor=request.user,
        action=ActivityLog.Action.SYSTEM,
        description=f"Admin '{request.user.username}' đã cập nhật thiết lập 11 quyền hạn & tùy chọn hệ thống.",
        request=request,
    )
    return JsonResponse({'ok': True, 'message': 'Đã lưu thiết lập phân quyền thành công!'})


# 3. NHẬT KÝ HOẠT ĐỘNG TOÀN DIỆN (/admin/activity/)
def admin_activity_view(request):
    """
    Hàm này dùng để render nhật ký hoạt động đầy đủ trên Mobile cho Admin.
    Input: HttpRequest. Output: HttpResponse HTML.
    """
    auth_check = _require_admin(request)
    if auth_check:
        return auth_check

    query = request.GET.get('q', '').strip()
    action_filter = request.GET.get('action', '').strip()
    date_filter = request.GET.get('date', 'today').strip()

    now = timezone.localtime()
    logs_qs = ActivityLog.objects.select_related('actor', 'actor__profile').order_by('-created_at')

    if date_filter == 'today':
        start_of_day = timezone.make_aware(datetime.combine(now.date(), time.min))
        logs_qs = logs_qs.filter(created_at__gte=start_of_day)
    elif date_filter == '7days':
        seven_days_ago = now - timezone.timedelta(days=7)
        logs_qs = logs_qs.filter(created_at__gte=seven_days_ago)

    if query:
        logs_qs = logs_qs.filter(Q(actor__username__icontains=query) | Q(description__icontains=query))
    if action_filter == 'sensitive':
        logs_qs = logs_qs.filter(action__in=SENSITIVE_ACTIONS)
    elif action_filter:
        logs_qs = logs_qs.filter(action=action_filter)

    logs = logs_qs[:100]

    return render(request, 'dashboard/admin_pages/admin_activity.html', {
        'logs': logs,
        'search_query': query,
        'action_filter': action_filter,
        'date_filter': date_filter,
        'total_count': logs_qs.count(),
    })


# 4. QUẢN LÝ KHO HÀNG 3 KHU VỰC (/admin/inventory/)
def admin_inventory_view(request):
    """
    Hàm này dùng để render danh sách kho hàng 3 khu vực và điều chỉnh tồn kho trên Mobile cho Admin.
    Input: HttpRequest. Output: HttpResponse HTML.
    """
    auth_check = _require_admin(request)
    if auth_check:
        return auth_check

    area = request.GET.get('area', '').strip()
    query = request.GET.get('q', '').strip()

    items_qs = Ingredient.objects.filter(is_active=True).order_by('storage_area', 'name')
    if area:
        items_qs = items_qs.filter(storage_area=area)
    if query:
        items_qs = items_qs.filter(Q(name__icontains=query) | Q(code__icontains=query))

    items = items_qs[:120]

    return render(request, 'dashboard/admin_pages/admin_inventory.html', {
        'items': items,
        'selected_area': area,
        'search_query': query,
        'total_count': items_qs.count(),
    })


@require_POST
def admin_inventory_save_api(request):
    """
    Hàm này dùng để cập nhật số lượng tồn kho nguyên liệu trực tiếp từ Admin Mobile.
    Input: HttpRequest (JSON). Output: JsonResponse.
    """
    if not request.user.is_authenticated or not _check_admin_privilege(request.user):
        return JsonResponse({'ok': False, 'message': 'Quyền truy cập bị từ chối.'}, status=403)

    try:
        data = json.loads(request.body.decode('utf-8'))
    except Exception:
        data = request.POST

    item_id = data.get('item_id')
    ingredient = Ingredient.objects.filter(pk=item_id).first()
    if not ingredient:
        return JsonResponse({'ok': False, 'message': 'Nguyên liệu/mặt hàng không tồn tại.'}, status=404)

    new_stock = data.get('current_stock')
    min_stock = data.get('minimum_stock')

    old_stock = ingredient.current_stock
    if new_stock is not None:
        try:
            ingredient.current_stock = Decimal(str(new_stock))
        except Exception:
            pass
    if min_stock is not None:
        try:
            ingredient.minimum_stock = Decimal(str(min_stock))
        except Exception:
            pass

    ingredient.save()

    ActivityLog.objects.create(
        actor=request.user,
        action=ActivityLog.Action.STOCK_RECEIPT,
        description=f"Admin '{request.user.username}' điều chỉnh tồn kho '{ingredient.name}' từ {old_stock} sang {ingredient.current_stock} {ingredient.unit}.",
        request=request,
    )
    return JsonResponse({'ok': True, 'message': f"Đã cập nhật tồn kho cho '{ingredient.name}'."})


# 5. THỰC ĐƠN & BẢNG GIÁ MÓN (/admin/menu/)
def admin_menu_view(request):
    """
    Hàm này dùng để render danh sách món ăn, giá bán và trạng thái món trên Mobile cho Admin.
    Input: HttpRequest. Output: HttpResponse HTML.
    """
    auth_check = _require_admin(request)
    if auth_check:
        return auth_check

    cat_id = request.GET.get('cat', '').strip()
    query = request.GET.get('q', '').strip()

    categories = Category.objects.filter(is_active=True).order_by('display_order', 'name')
    dishes_qs = Product.objects.filter(is_active=True).select_related('category').order_by('category__display_order', 'name')

    if cat_id:
        dishes_qs = dishes_qs.filter(category_id=cat_id)
    if query:
        dishes_qs = dishes_qs.filter(Q(name__icontains=query) | Q(code__icontains=query))

    return render(request, 'dashboard/admin_pages/admin_menu.html', {
        'dishes': dishes_qs[:150],
        'categories': categories,
        'selected_cat': cat_id,
        'search_query': query,
    })


@require_POST
def admin_menu_save_api(request):
    """
    Hàm này dùng để sửa giá bán và trạng thái món ăn trực tiếp từ Admin Mobile.
    Input: HttpRequest (JSON). Output: JsonResponse.
    """
    if not request.user.is_authenticated or not _check_admin_privilege(request.user):
        return JsonResponse({'ok': False, 'message': 'Quyền truy cập bị từ chối.'}, status=403)

    try:
        data = json.loads(request.body.decode('utf-8'))
    except Exception:
        data = request.POST

    product_id = data.get('product_id')
    name = str(data.get('name') or '').strip()
    price = data.get('price')
    price_2 = data.get('price_2')
    price_3 = data.get('price_3')
    is_available = bool(data.get('is_available', True))

    product = Product.objects.filter(pk=product_id).first()
    if not product:
        return JsonResponse({'ok': False, 'message': 'Món ăn không tồn tại.'}, status=404)

    if name:
        product.name = name
    if price is not None:
        try:
            product.price = Decimal(str(price))
        except Exception:
            pass
    if price_2 is not None:
        try:
            product.price_2 = Decimal(str(price_2)) if str(price_2).strip() else None
        except Exception:
            pass
    if price_3 is not None:
        try:
            product.price_3 = Decimal(str(price_3)) if str(price_3).strip() else None
        except Exception:
            pass

    product.is_available = is_available
    product.save()

    ActivityLog.objects.create(
        actor=request.user,
        action=ActivityLog.Action.EDIT_PRICE,
        description=f"Admin '{request.user.username}' cập nhật món '{product.name}' (Giá: {_format_money(product.price)}, Trạng thái: {'Đang bán' if is_available else 'Tạm ngưng'}).",
        request=request,
    )
    return JsonResponse({'ok': True, 'message': f"Đã lưu món '{product.name}'."})


# 6. ĐỊNH LƯỢNG NGUYÊN LIỆU BOM (/admin/recipes/)
def admin_recipes_view(request):
    """
    Hàm này dùng để render danh sách công thức định lượng nguyên liệu (BOM) trên Mobile cho Admin.
    Input: HttpRequest. Output: HttpResponse HTML.
    """
    auth_check = _require_admin(request)
    if auth_check:
        return auth_check

    query = request.GET.get('q', '').strip()
    recipes_qs = Recipe.objects.select_related('product', 'product__category').prefetch_related(
        Prefetch('items', queryset=RecipeItem.objects.select_related('ingredient'))
    ).order_by('product__name')

    if query:
        recipes_qs = recipes_qs.filter(Q(product__name__icontains=query) | Q(product__code__icontains=query))

    return render(request, 'dashboard/admin_pages/admin_recipes.html', {
        'recipes': recipes_qs[:80],
        'search_query': query,
    })


# 7. KHU VỰC & BÀN ĂN (/admin/dining/)
def admin_dining_view(request):
    """
    Hàm này dùng để render danh sách khu vực và bàn ăn trên Mobile cho Admin.
    Input: HttpRequest. Output: HttpResponse HTML.
    """
    auth_check = _require_admin(request)
    if auth_check:
        return auth_check

    area_id = request.GET.get('area', '').strip()
    areas = Area.objects.filter(is_active=True).order_by('display_order', 'name')
    tables_qs = DiningTable.objects.filter(is_active=True).select_related('area').order_by('area__display_order', 'display_order', 'name')

    if area_id:
        tables_qs = tables_qs.filter(area_id=area_id)

    return render(request, 'dashboard/admin_pages/admin_dining.html', {
        'tables': tables_qs,
        'areas': areas,
        'selected_area': area_id,
    })


@require_POST
def admin_dining_save_api(request):
    """
    Hàm này dùng để thêm mới hoặc sửa bàn ăn trực tiếp từ Admin Mobile.
    Input: HttpRequest (JSON). Output: JsonResponse.
    """
    if not request.user.is_authenticated or not _check_admin_privilege(request.user):
        return JsonResponse({'ok': False, 'message': 'Quyền truy cập bị từ chối.'}, status=403)

    try:
        data = json.loads(request.body.decode('utf-8'))
    except Exception:
        data = request.POST

    table_id = data.get('table_id')
    name = str(data.get('name') or '').strip()
    area_id = data.get('area_id')
    capacity = int(data.get('capacity', 4))
    status = str(data.get('status') or 'available')

    if not name:
        return JsonResponse({'ok': False, 'message': 'Tên bàn không được để trống.'}, status=400)

    area = Area.objects.filter(pk=area_id).first() if area_id else Area.objects.first()

    if table_id:
        table = DiningTable.objects.filter(pk=table_id).first()
        if not table:
            return JsonResponse({'ok': False, 'message': 'Bàn không tồn tại.'}, status=404)
        table.name = name
        if area:
            table.area = area
        table.capacity = capacity
        table.status = status
        table.save()
        msg = f"Đã cập nhật bàn '{name}' ({area.name if area else ''})."
    else:
        table = DiningTable.objects.create(
            name=name,
            area=area,
            capacity=capacity,
            status=status,
            is_active=True,
        )
        msg = f"Đã thêm bàn mới '{name}'."

    ActivityLog.objects.create(
        actor=request.user,
        action=ActivityLog.Action.SYSTEM,
        description=f"Admin '{request.user.username}' {msg}",
        request=request,
    )
    return JsonResponse({'ok': True, 'message': msg})
