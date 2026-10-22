import csv
from datetime import datetime, time
from django.contrib.auth import get_user_model
from django.contrib.auth.decorators import login_required
from django.db.models import Q
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.utils import timezone

from accounts.decorators import role_required
from .models import ActivityLog

User = get_user_model()

ORDER_LOG_ACTIONS = [
    ActivityLog.Action.RETURN_ITEM,
    ActivityLog.Action.CANCEL_ITEM,
    ActivityLog.Action.EDIT_PRICE,
    ActivityLog.Action.DELETE_ORDER,
]

DISPLAY_ACTIONS = [
    ('reserve_table', 'Đặt bàn'),
    ('transfer_table', 'Chuyển'),
    ('stock_receipt', 'Nhập'),
    ('merge_table', 'Ghép'),
    ('split_table', 'Tách'),
    ('edit_invoice', 'Sửa hóa đơn'),
    ('delete_invoice', 'Xóa hóa đơn'),
    ('shift_close', 'Kết ca'),
    ('login', 'Đăng nhập'),
    ('system', 'Hệ thống'),
    ('menu_update', 'Cập nhật thực đơn'),
    ('return_item', 'Trả món'),
    ('cancel_item', 'Hủy món'),
    ('edit_price', 'Sửa tiền món'),
    ('delete_order', 'Xóa bỏ đơn'),
    ('maintenance', 'Bảo trì dữ liệu'),
    ('warehouse', 'Quản lý kho'),
    ('view_report', 'Xem báo cáo'),
    ('debt', 'Công nợ'),
]


def _parse_date(date_str, end_of_day=False):
    """Phân tích chuỗi ngày dạng dd/mm/yyyy hoặc yyyy-mm-dd thành datetime có timezone."""
    if not date_str:
        return None
    date_str = date_str.strip()
    dt = None
    for fmt in ('%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y'):
        try:
            d = datetime.strptime(date_str, fmt).date()
            t = time.max if end_of_day else time.min
            naive_dt = datetime.combine(d, t)
            dt = timezone.make_aware(naive_dt, timezone.get_current_timezone())
            break
        except (ValueError, TypeError):
            continue
    return dt


def _filter_logs(request):
    """Hàm dùng chung lọc ActivityLog theo tham số request."""
    logs = (
        ActivityLog.objects.select_related('actor')
        .exclude(description__startswith='POST /')
        .exclude(action=ActivityLog.Action.PAYMENT)
    )

    from_date_str = request.GET.get('from_date', '').strip()
    to_date_str = request.GET.get('to_date', '').strip()
    action = request.GET.get('action', '').strip()
    actor_id = request.GET.get('actor_id', '').strip()
    is_order_log = request.GET.get('order_log', '').strip().lower() in ('1', 'true', 'yes')
    search = request.GET.get('q', '').strip()

    from_dt = _parse_date(from_date_str, end_of_day=False)
    if from_dt:
        logs = logs.filter(created_at__gte=from_dt)

    to_dt = _parse_date(to_date_str, end_of_day=True)
    if to_dt:
        logs = logs.filter(created_at__lte=to_dt)

    if is_order_log:
        logs = logs.filter(action__in=ORDER_LOG_ACTIONS)
    elif action:
        # Nếu chọn action cụ thể
        if action == 'menu_update':
            logs = logs.filter(action__in=[ActivityLog.Action.MENU_UPDATE, ActivityLog.Action.CREATE, ActivityLog.Action.UPDATE, ActivityLog.Action.DELETE])
        else:
            logs = logs.filter(action=action)

    if actor_id:
        if actor_id.isdigit():
            logs = logs.filter(actor_id=int(actor_id))
        else:
            logs = logs.filter(Q(actor__username=actor_id) | Q(actor_name__icontains=actor_id))

    if search:
        logs = logs.filter(
            Q(description__icontains=search) |
            Q(reason__icontains=search) |
            Q(actor_name__icontains=search) |
            Q(actor__username__icontains=search)
        )

    return logs


@login_required
@role_required('Owner', 'Manager')
def activity_list(request):
    """Trang xem nhật ký hoạt động đầy đủ giao diện."""
    logs = _filter_logs(request)
    staff_users = User.objects.filter(is_active=True).order_by('username')

    today_str = timezone.localdate().strftime('%Y-%m-%d')
    raw_from = request.GET.get('from_date', today_str)
    raw_to = request.GET.get('to_date', today_str)
    parsed_from = _parse_date(raw_from)
    parsed_to = _parse_date(raw_to)
    from_date = parsed_from.strftime('%Y-%m-%d') if parsed_from else today_str
    to_date = parsed_to.strftime('%Y-%m-%d') if parsed_to else today_str

    return render(request, 'audit/pages/activity_list.html', {
        'logs': logs[:500],
        'total_count': logs.count(),
        'actions': DISPLAY_ACTIONS,
        'staff_users': staff_users,
        'from_date': from_date,
        'to_date': to_date,
        'selected_action': request.GET.get('action', ''),
        'selected_actor': request.GET.get('actor_id', ''),
        'search_query': request.GET.get('q', ''),
        'is_order_log': request.GET.get('order_log', '').strip().lower() in ('1', 'true', 'yes'),
    })


@login_required
def activity_api(request):
    """API JSON trả về danh sách nhật ký hoạt động và cấu hình bộ lọc."""
    logs = _filter_logs(request)
    limit = min(int(request.GET.get('limit', 500)), 1000)

    items = []
    for log in logs[:limit]:
        items.append({
            'id': log.id,
            'formatted_time': log.formatted_time,
            'action_code': log.action,
            'action_display': log.get_action_display(),
            'action_color': log.action_color,
            'description': log.description,
            'reason': log.reason,
            'full_detail': log.full_detail,
            'actor_name': log.display_actor,
        })

    staff_list = [
        {'id': u.id, 'name': u.get_full_name() or u.username}
        for u in User.objects.filter(is_active=True).order_by('username')
    ]

    return JsonResponse({
        'status': 'success',
        'total_count': len(items),
        'logs': items,
        'actions': [{'code': code, 'label': label} for code, label in DISPLAY_ACTIONS],
        'staff_list': staff_list,
    })


@login_required
def activity_export_excel(request):
    """Xuất nhật ký hoạt động sang file Excel CSV UTF-8 kèm BOM."""
    logs = _filter_logs(request)[:2000]

    response = HttpResponse(content_type='text/csv; charset=utf-8-sig')
    filename = f"nhat_ky_hoat_dong_{timezone.now().strftime('%Y%m%d_%H%M%S')}.csv"
    response['Content-Disposition'] = f'attachment; filename="{filename}"'

    writer = csv.writer(response)
    # Header chuẩn theo ảnh mẫu
    writer.writerow(['Thời điểm', 'Hoạt động', 'Chi tiết', 'Thực hiện'])

    for log in logs:
        writer.writerow([
            log.formatted_time,
            log.get_action_display(),
            log.full_detail,
            log.display_actor,
        ])

    return response
