# File này chịu trách nhiệm tổng hợp dữ liệu khu vực, bàn, thực đơn, hóa đơn, nhật ký và phân quyền để hiển thị màn hình Bán hàng POS 4 cột và xử lý Kết ca.
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from datetime import datetime, time, timedelta

from django.db.models import Count, Prefetch, Q, Sum
from django.utils import timezone
from django.shortcuts import render
from django.views.decorators.http import require_POST

from catalog.models import Category, Product
from dining.models import Area, DiningTable
from sales.models import Invoice, Order, OrderItem, Payment, Shift
from accounts.decorators import role_required
from accounts.models import UserSystemConfig
from audit.models import ActivityLog
from django.contrib.auth import get_user_model
import json

User = get_user_model()


@login_required
def home(request):
    # Khi tải lại màn hình chính POS, luôn xóa quyền nâng cấp tạm thời để giữ đúng quyền của tài khoản hiện tại
    # Hàm này dùng để xử lý yêu cầu HTTP cho chức năng 'home' trong phân hệ dashboard/views.py. Input: đối tượng HttpRequest (request). Output: trả về HttpResponse render giao diện HTML hoặc JsonResponse dữ liệu API.
    request.session.pop('pos_elevated_auth', None)
    request.session.pop('pos_elevated_by', None)
    sys_config = UserSystemConfig.get_solo()
    user_permissions = sys_config.get_user_permissions(request.user)
    extra_options = sys_config.extra_options or {}

    shift = Shift.objects.filter(status=Shift.Status.OPEN).order_by('started_at').first()
    now = timezone.localtime()
    day_started_at = timezone.make_aware(datetime.combine(now.date(), time.min))
    if shift is not None and timezone.localtime(shift.started_at).date() < now.date():
        shift.status = Shift.Status.CLOSED
        shift.ended_at = day_started_at
        shift.closed_by = request.user
        shift.save(update_fields=('status', 'ended_at', 'closed_by'))
        shift = None
    if shift is None:
        shift = Shift.objects.create(opened_by=request.user)
        first_invoice = Invoice.objects.filter(status=Invoice.Status.PAID, paid_at__gte=day_started_at).order_by('paid_at').first()
        if first_invoice is not None:
            shift.started_at = first_invoice.paid_at
            shift.save(update_fields=('started_at',))
    shift_started_at = shift.started_at
    shift_invoices = Invoice.objects.filter(
        status=Invoice.Status.PAID,
        paid_at__gte=max(shift_started_at, day_started_at),
    )
    payment_totals = {
        row['payments__method']: row
        for row in shift_invoices.values('payments__method').annotate(
            count=Count('pk', distinct=True), total=Sum('payments__amount'),
        )
    }
    shift_payment_rows = [
        {
            'label': label,
            'count': payment_totals.get(method, {}).get('count', 0),
            'total': payment_totals.get(method, {}).get('total', 0),
        }
        for method, label in Payment.Method.choices
    ]
    paid_today_invoices = list(
        Invoice.objects.filter(
            status=Invoice.Status.PAID,
            paid_at__gte=day_started_at,
            paid_at__lt=day_started_at + timedelta(days=1),
        )
        .select_related('order', 'cashier', 'order__table', 'order__table__area')
        .prefetch_related('payments', 'order__items')
        .order_by('-paid_at')
    )
    table_last_paid = {}
    for inv in paid_today_invoices:
        tbl = inv.order.table if inv.order else None
        if tbl and str(tbl.pk) not in table_last_paid:
            local_paid = timezone.localtime(inv.paid_at)
            total_fmt = f'{inv.total_amount:,.0f}'.replace(',', '.')
            table_last_paid[str(tbl.pk)] = {
                'invoice_code': inv.invoice_code,
                'table_id': tbl.pk,
                'table_name': tbl.name,
                'paid_time_short': local_paid.strftime('%I:%M'),
                'paid_datetime_full': local_paid.strftime('%d/%m/%Y %I:%M %p'),
                'total_amount': float(inv.total_amount),
                'total_formatted': f'{total_fmt} đ',
            }

    active_table_orders = {}
    for ord_obj in Order.objects.filter(status__in=[Order.Status.DRAFT, Order.Status.CONFIRMED], table__isnull=False).select_related('table', 'table__area').prefetch_related('items'):
        active_table_orders[str(ord_obj.table_id)] = {
            'order_id': ord_obj.id,
            'order_code': ord_obj.order_code,
            'items': [
                [
                    str(it.product_id),
                    {
                        'product_id': it.product_id,
                        'name': it.product_name,
                        'unit': it.unit,
                        'price': float(it.unit_price),
                        'quantity': it.quantity,
                        'sent_quantity': it.quantity,
                        'discount_percent': float(it.discount_amount * 100 / (it.unit_price * it.quantity)) if (it.unit_price and it.quantity) else 0,
                        'note': it.note or '',
                    }
                ]
                for it in ord_obj.items.filter(status=OrderItem.Status.ACTIVE)
            ],
            'itemsSentToKitchen': True,
            'tableName': ord_obj.table.name,
            'area': ord_obj.table.area.name if ord_obj.table.area else '',
            'arrivalTime': timezone.localtime(ord_obj.created_at).strftime('%I:%M %p'),
            'surchargeAmount': float(ord_obj.surcharge_amount or 0),
            'orderDiscountAmount': float(ord_obj.discount_amount or 0),
            'taxAmount': float(ord_obj.tax_amount or 0),
        }

    return render(request, 'dashboard/pages/home.html', {
        'areas': Area.objects.filter(is_active=True).prefetch_related(Prefetch('tables', queryset=DiningTable.objects.filter(is_active=True))),
        'categories': Category.objects.filter(is_active=True),
        'menu_categories': Category.objects.filter(is_active=True).order_by('display_order', 'name'),
        'products': Product.objects.filter(is_active=True, is_available=True).select_related('category').order_by('category__display_order', 'category__name', 'subgroup', 'name'),
        'all_menu_products': Product.objects.filter(is_active=True).select_related('category').order_by('category__display_order', 'name'),
        'invoices': paid_today_invoices[:30],
        'shift_started_at': shift_started_at,
        'shift_invoice_count': shift_invoices.count(),
        'shift_total': shift_invoices.aggregate(total=Sum('total_amount'))['total'] or 0,
        'shift_payment_rows': shift_payment_rows,
        'shift': shift,
        'activity_logs': (
            ActivityLog.objects.filter(created_at__gte=day_started_at)
            .exclude(description__startswith='POST /')
            .exclude(action=ActivityLog.Action.PAYMENT)
            .select_related('actor')[:50]
        ),
        'current_time': now,
        'cashiers': User.objects.filter(is_active=True).order_by('username'),
        'pos_user_permissions_json': json.dumps(user_permissions),
        'pos_extra_options_json': json.dumps(extra_options),
        'hide_shift_close_numbers': bool(extra_options.get('hide_shift_close_numbers', False)),
        'table_last_paid_json': json.dumps(table_last_paid),
        'active_table_orders_json': json.dumps(active_table_orders),
    })


def _build_shift_report_data(shift, ended_at, actor_user, unpaid_count=None, unpaid_amount=None):
    # Hàm này dùng để tính toán dữ liệu phiếu nhiệt BÁO CÁO KẾT CA (khổ K80) cho một ca làm việc cụ thể. Input: shift, ended_at, actor_user, unpaid_count, unpaid_amount. Output: dict dữ liệu báo cáo kết ca.
    from decimal import Decimal
    from sales.views import _compute_shift_or_eod_block

    prev_shift = (
        Shift.objects.filter(status=Shift.Status.CLOSED, ended_at__isnull=False)
        .exclude(pk=shift.pk)
        .order_by('-ended_at')
        .first()
    )
    prev_dt = prev_shift.ended_at if (prev_shift and prev_shift.ended_at) else shift.started_at
    prev_shift_str = timezone.localtime(prev_dt).strftime('%d/%m/%Y %I:%M %p')
    close_shift_str = timezone.localtime(ended_at).strftime('%d/%m/%Y %I:%M %p')

    shift_invoices_qs = (
        Invoice.objects.filter(
            status=Invoice.Status.PAID,
            paid_at__gte=shift.started_at,
            paid_at__lte=ended_at,
        )
        .select_related('order', 'cashier', 'order__table', 'order__table__area')
        .prefetch_related('payments', 'order__items', 'order__items__product')
        .order_by('paid_at')
    )
    shift_logs_qs = ActivityLog.objects.filter(
        created_at__gte=shift.started_at,
        created_at__lte=ended_at,
    )

    if unpaid_count is None or unpaid_amount is None:
        open_orders_qs = Order.objects.filter(status__in=[Order.Status.DRAFT, Order.Status.CONFIRMED])
        if unpaid_count is None:
            unpaid_count = open_orders_qs.count()
        if unpaid_amount is None:
            unpaid_amount = open_orders_qs.aggregate(s=Sum('total_amount'))['s'] or Decimal('0')

    cashier_name = (actor_user.get_full_name() or actor_user.username) if actor_user else 'Thu Ngân 1'
    cashier_username = actor_user.username if actor_user else 'thungan1'

    block = _compute_shift_or_eod_block(
        invoices_list=list(shift_invoices_qs),
        logs_qs=shift_logs_qs,
        prev_shift_display=prev_shift_str,
        close_shift_display=close_shift_str,
        shift_key=cashier_username,
        shift_label=f'Ca làm việc - {cashier_name}',
        cashier_display=cashier_name,
        unpaid_count=int(unpaid_count or 0),
        unpaid_amount=Decimal(str(unpaid_amount or 0)),
    )
    block['shift_id'] = shift.pk
    block['title'] = 'BÁO CÁO KẾT CA'
    block['print_url'] = (
        f"/close-shift/print/{shift.pk}/?unpaid_count={block['unpaid_count']}&unpaid_amount={int(block['unpaid_amount'])}"
    )
    return block


@login_required
@role_required('Owner', 'Manager', 'Sales', 'Cashier')
@require_POST
def close_shift(request):
    # Hàm này dùng để xử lý yêu cầu HTTP cho chức năng 'close_shift' trong phân hệ dashboard/views.py. Input: đối tượng HttpRequest (request). Output: trả về HttpResponse render giao diện HTML hoặc JsonResponse dữ liệu API.
    from decimal import Decimal, InvalidOperation

    shift = Shift.objects.filter(status=Shift.Status.OPEN).order_by('started_at').first()
    if shift is None:
        last_closed = Shift.objects.filter(status=Shift.Status.CLOSED, ended_at__isnull=False).order_by('-ended_at').first()
        start_time = last_closed.ended_at if last_closed else timezone.make_aware(datetime.combine(timezone.localdate(), time.min))
        shift = Shift.objects.create(opened_by=request.user, status=Shift.Status.OPEN)
        Shift.objects.filter(pk=shift.pk).update(started_at=start_time)
        shift.started_at = start_time

    unpaid_count = None
    unpaid_amount = None
    if request.body:
        try:
            payload = json.loads(request.body)
            if isinstance(payload, dict):
                if 'unpaid_count' in payload:
                    unpaid_count = max(0, int(payload.get('unpaid_count') or 0))
                if 'unpaid_amount' in payload:
                    unpaid_amount = max(Decimal('0'), Decimal(str(payload.get('unpaid_amount') or '0')))
        except (json.JSONDecodeError, TypeError, ValueError, InvalidOperation):
            pass

    ended_at = timezone.now()
    shift_invoices = Invoice.objects.filter(status=Invoice.Status.PAID, paid_at__gte=shift.started_at, paid_at__lte=ended_at)
    payment_totals = {
        row['payments__method']: row
        for row in shift_invoices.values('payments__method').annotate(
            count=Count('pk', distinct=True), total=Sum('payments__amount'),
        )
    }
    total = shift_invoices.aggregate(total=Sum('total_amount'))['total'] or 0

    shift_report = _build_shift_report_data(
        shift=shift,
        ended_at=ended_at,
        actor_user=request.user,
        unpaid_count=unpaid_count,
        unpaid_amount=unpaid_amount,
    )

    shift.status = Shift.Status.CLOSED
    shift.ended_at = ended_at
    shift.closed_by = request.user
    shift.save(update_fields=('status', 'ended_at', 'closed_by'))

    # Mở sẵn ca tiếp theo bắt đầu từ đúng thời điểm kết ca hiện tại để ca sau ghi nhận chuẩn "Ca trước giao lúc"
    Shift.objects.create(
        opened_by=request.user,
        started_at=ended_at,
        status=Shift.Status.OPEN,
    )

    total_fmt = f'{total:,.0f}'.replace(',', '.')
    ActivityLog.objects.create(
        actor=request.user,
        actor_name=request.user.get_full_name() or request.user.username,
        action=ActivityLog.Action.SHIFT_CLOSE,
        method=request.method,
        path=request.path,
        object_type='Shift',
        object_id=shift.pk,
        description=f'Kết ca chung ({shift_invoices.count()} hóa đơn, tổng {total_fmt} đ)',
        status_code=200,
        ip_address=request.META.get('REMOTE_ADDR'),
    )
    return JsonResponse({
        'ok': True,
        'invoice_count': shift_invoices.count(),
        'total': str(total),
        'payments': {
            method: {'count': row['count'], 'total': str(row['total'] or 0)}
            for method, row in payment_totals.items()
        },
        'shift_report': shift_report,
        'print_url': shift_report['print_url'],
    })


@login_required
@role_required('Owner', 'Manager', 'Sales', 'Cashier')
def shift_close_print_view(request, shift_id=None):
    # Hàm này dùng để hiển thị trang in nhiệt K80 cho BÁO CÁO KẾT CA (hoặc xem lại ca vừa kết). Input: request, shift_id. Output: HttpResponse trang in K80.
    from decimal import Decimal, InvalidOperation

    if shift_id:
        shift = Shift.objects.filter(pk=shift_id).first()
    else:
        shift = Shift.objects.filter(status=Shift.Status.CLOSED).order_by('-ended_at').first()
        if not shift:
            shift = Shift.objects.order_by('-started_at').first()

    if not shift:
        now = timezone.now()
        shift = Shift.objects.create(opened_by=request.user, started_at=now, status=Shift.Status.OPEN)

    unpaid_count = None
    unpaid_amount = None
    if 'unpaid_count' in request.GET:
        try:
            unpaid_count = max(0, int(request.GET.get('unpaid_count') or 0))
        except (TypeError, ValueError):
            unpaid_count = None
    if 'unpaid_amount' in request.GET:
        try:
            unpaid_amount = max(Decimal('0'), Decimal(str(request.GET.get('unpaid_amount') or '0')))
        except (InvalidOperation, TypeError, ValueError):
            unpaid_amount = None

    ended_at = shift.ended_at or timezone.now()
    actor_user = shift.closed_by or shift.opened_by or request.user
    shift_report = _build_shift_report_data(
        shift=shift,
        ended_at=ended_at,
        actor_user=actor_user,
        unpaid_count=unpaid_count,
        unpaid_amount=unpaid_amount,
    )
    auto_print = request.GET.get('autoprint', '1') != '0'

    return render(request, 'sales/prints/shift_close_print.html', {
        'report': shift_report,
        'auto_print': auto_print,
    })


@login_required
@role_required('Owner', 'Manager')
def reports(request):
    # Hàm này dùng để xử lý yêu cầu HTTP cho chức năng 'reports' trong phân hệ dashboard/views.py. Input: đối tượng HttpRequest (request). Output: trả về HttpResponse render giao diện HTML hoặc JsonResponse dữ liệu API.
    local_today = timezone.localdate()
    start_value = request.GET.get('from', local_today.isoformat())
    end_value = request.GET.get('to', local_today.isoformat())
    try:
        start_date = datetime.strptime(start_value, '%Y-%m-%d').date()
        end_date = datetime.strptime(end_value, '%Y-%m-%d').date()
    except ValueError:
        start_date = end_date = local_today
    if start_date > end_date:
        start_date, end_date = end_date, start_date
    start_at = timezone.make_aware(datetime.combine(start_date, time.min))
    end_at = timezone.make_aware(datetime.combine(end_date + timedelta(days=1), time.min))
    paid_filter = Q(paid_at__gte=start_at, paid_at__lt=end_at, status=Invoice.Status.PAID)
    invoices = Invoice.objects.filter(paid_filter)
    total_revenue = invoices.aggregate(value=Sum('total_amount'))['value'] or 0
    invoice_count = invoices.count()
    average_order = total_revenue / invoice_count if invoice_count else 0
    payments = list(invoices.values('payments__method').annotate(total=Sum('payments__amount')).order_by('-total'))
    payment_labels = dict(Payment.Method.choices)
    payment_rows = [{'label': payment_labels.get(row['payments__method'], 'Khác'), 'total': row['total']} for row in payments]
    items = list(OrderItem.objects.filter(order__invoice__in=invoices, status=OrderItem.Status.ACTIVE).values('product_name').annotate(quantity=Sum('quantity'), revenue=Sum('total_amount')).order_by('-quantity')[:10])
    product_rows = [{'name': row['product_name'], 'quantity': row['quantity'], 'revenue': row['revenue']} for row in items]
    categories = list(OrderItem.objects.filter(order__invoice__in=invoices, status=OrderItem.Status.ACTIVE).values('product__category__name').annotate(revenue=Sum('total_amount')).order_by('-revenue'))
    category_rows = [{'name': row['product__category__name'] or 'Khác', 'revenue': row['revenue']} for row in categories]
    return render(request, 'dashboard/pages/reports.html', {
        'from_date': start_date.isoformat(), 'to_date': end_date.isoformat(),
        'total_revenue': total_revenue, 'invoice_count': invoice_count, 'average_order': average_order,
        'payment_rows': payment_rows, 'product_rows': product_rows, 'category_rows': category_rows,
    })
