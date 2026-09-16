from django.contrib.auth.decorators import login_required
from datetime import datetime, time, timedelta

from django.db.models import Count, Prefetch, Q, Sum
from django.utils import timezone
from django.shortcuts import render

from catalog.models import Category, Product
from dining.models import Area, DiningTable
from sales.models import Invoice, OrderItem, Payment
from accounts.decorators import role_required


@login_required
def home(request):
	return render(request, 'dashboard/home.html', {
		'areas': Area.objects.filter(is_active=True).prefetch_related(Prefetch('tables', queryset=DiningTable.objects.filter(is_active=True))),
		'categories': Category.objects.filter(is_active=True),
		'products': Product.objects.filter(is_active=True, is_available=True).select_related('category'),
		'invoices': Invoice.objects.select_related('order', 'cashier', 'order__table').prefetch_related('payments')[:30],
	})


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
