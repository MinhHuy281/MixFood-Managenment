from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from datetime import datetime, time, timedelta

from django.db.models import Count, Prefetch, Q, Sum
from django.utils import timezone
from django.shortcuts import render
from django.views.decorators.http import require_POST

from catalog.models import Category, Product
from dining.models import Area, DiningTable
from sales.models import Invoice, OrderItem, Payment, Shift
from accounts.decorators import role_required
from audit.models import ActivityLog


@login_required
def home(request):
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
	return render(request, 'dashboard/home.html', {
		'areas': Area.objects.filter(is_active=True).prefetch_related(Prefetch('tables', queryset=DiningTable.objects.filter(is_active=True))),
		'categories': Category.objects.filter(is_active=True),
		'products': Product.objects.filter(is_active=True, is_available=True).select_related('category'),
		'invoices': Invoice.objects.filter(paid_at__gte=day_started_at, paid_at__lt=day_started_at + timedelta(days=1)).select_related('order', 'cashier', 'order__table').prefetch_related('payments')[:30],
		'shift_started_at': shift_started_at,
		'shift_invoice_count': shift_invoices.count(),
		'shift_total': shift_invoices.aggregate(total=Sum('total_amount'))['total'] or 0,
		'shift_payment_rows': shift_payment_rows,
		'shift': shift,
		'activity_logs': ActivityLog.objects.filter(created_at__gte=day_started_at).select_related('actor')[:12],
		'current_time': now,
	})


@login_required
@role_required('Owner', 'Manager', 'Sales')
@require_POST
def close_shift(request):
	shift = Shift.objects.filter(status=Shift.Status.OPEN).order_by('started_at').first()
	if shift is None:
		return JsonResponse({'error': 'Không có ca đang mở.'}, status=400)
	ended_at = timezone.now()
	shift_invoices = Invoice.objects.filter(status=Invoice.Status.PAID, paid_at__gte=shift.started_at, paid_at__lte=ended_at)
	payment_totals = {
		row['payments__method']: row
		for row in shift_invoices.values('payments__method').annotate(
			count=Count('pk', distinct=True), total=Sum('payments__amount'),
		)
	}
	total = shift_invoices.aggregate(total=Sum('total_amount'))['total'] or 0
	shift.status = Shift.Status.CLOSED
	shift.ended_at = ended_at
	shift.closed_by = request.user
	shift.save(update_fields=('status', 'ended_at', 'closed_by'))
	ActivityLog.objects.create(
		actor=request.user,
		action=ActivityLog.Action.OTHER,
		method=request.method,
		path=request.path,
		object_type='Shift',
		object_id=shift.pk,
		description=f'Kết ca chung ({shift_invoices.count()} hóa đơn, tổng {total:,.0f} đ)',
		status_code=200,
		ip_address=request.META.get('REMOTE_ADDR'),
	)
	return JsonResponse({'ok': True, 'invoice_count': shift_invoices.count(), 'total': str(total), 'payments': {method: {'count': row['count'], 'total': str(row['total'] or 0)} for method, row in payment_totals.items()}})


@login_required
@role_required('Owner', 'Manager')
def reports(request):
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
	return render(request, 'dashboard/reports.html', {
		'from_date': start_date.isoformat(), 'to_date': end_date.isoformat(),
		'total_revenue': total_revenue, 'invoice_count': invoice_count, 'average_order': average_order,
		'payment_rows': payment_rows, 'product_rows': product_rows, 'category_rows': category_rows,
	})
