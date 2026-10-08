import json
from decimal import Decimal, InvalidOperation
from uuid import uuid4

from django.contrib.auth.decorators import login_required
from django.core.exceptions import ValidationError
from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from accounts.decorators import role_required
from audit.models import ActivityLog
from catalog.models import Product
from dining.models import DiningTable
from inventory.services import deduct_for_sale

from .models import Invoice, Order, OrderItem, Payment


def _money(value, default='0'):
	try:
		amount = Decimal(str(value))
	except (InvalidOperation, TypeError, ValueError):
		return Decimal(default)
	return max(amount, Decimal('0'))


@login_required
@role_required('Owner', 'Manager', 'Sales')
@require_POST
def checkout(request):
	try:
		payload = json.loads(request.body or '{}')
	except json.JSONDecodeError:
		return JsonResponse({'error': 'Dữ liệu thanh toán không hợp lệ.'}, status=400)

	raw_items = payload.get('items', [])
	if not isinstance(raw_items, list) or not raw_items:
		return JsonResponse({'error': 'Đơn hàng phải có ít nhất một món.'}, status=400)

	payment_method = payload.get('payment_method', Payment.Method.CASH)
	valid_methods = {choice[0] for choice in Payment.Method.choices}
	if payment_method not in valid_methods:
		return JsonResponse({'error': 'Phương thức thanh toán không hợp lệ.'}, status=400)

	table_id = payload.get('table_id')
	order_type = payload.get('order_type', Order.OrderType.DINE_IN)
	if order_type not in {choice[0] for choice in Order.OrderType.choices}:
		return JsonResponse({'error': 'Loại đơn không hợp lệ.'}, status=400)

	validated_items = {}
	validated_products = {}
	for raw_item in raw_items:
		try:
			product_id = int(raw_item.get('product_id'))
			quantity = int(raw_item.get('quantity', 1))
		except (TypeError, ValueError):
			return JsonResponse({'error': 'Món hoặc số lượng không hợp lệ.'}, status=400)
		if quantity < 1 or quantity > 999:
			return JsonResponse({'error': 'Số lượng món phải từ 1 đến 999.'}, status=400)
		product = Product.objects.filter(pk=product_id, is_active=True, is_available=True).first()
		if product is None:
			return JsonResponse({'error': 'Một món trong đơn không còn được bán.'}, status=400)
		validated_items[product.pk] = validated_items.get(product.pk, 0) + quantity
		validated_products[product.pk] = product
	subtotal = sum((validated_products[product_id].price * quantity for product_id, quantity in validated_items.items()), Decimal('0'))
	discount_amount = _money(payload.get('discount_amount'))
	if discount_amount > subtotal:
		return JsonResponse({'error': 'Giảm giá không được lớn hơn tiền món.'}, status=400)

	table = None
	if table_id:
		table = DiningTable.objects.filter(pk=table_id, is_active=True).first()
		if table is None:
			return JsonResponse({'error': 'Bàn không tồn tại hoặc đã ngừng sử dụng.'}, status=400)
		if table.status == DiningTable.Status.MAINTENANCE:
			return JsonResponse({'error': 'Bàn đang bảo trì.'}, status=400)

	try:
		with transaction.atomic():
			if table_id:
				table = DiningTable.objects.select_for_update().get(pk=table_id, is_active=True)
				if table is None:
					return JsonResponse({'error': 'Bàn không tồn tại hoặc đã ngừng sử dụng.'}, status=400)
				if table.status == DiningTable.Status.MAINTENANCE:
					return JsonResponse({'error': 'Bàn đang bảo trì.'}, status=400)

			order = Order.objects.create(
				order_code=f'ORD-{timezone.now():%Y%m%d%H%M%S}-{uuid4().hex[:4].upper()}',
				table=table,
				order_type=order_type,
				status=Order.Status.CONFIRMED,
				note=str(payload.get('note', ''))[:500],
				created_by=request.user,
			)
			subtotal = Decimal('0')
			for product_id, quantity in validated_items.items():
				product = validated_products[product_id]
				OrderItem.objects.create(
					order=order,
					product=product,
					product_name=product.name,
					unit=product.unit,
					quantity=quantity,
					unit_price=product.price,
				)
				subtotal += product.price * quantity

			discount_amount = _money(payload.get('discount_amount'))
			surcharge_amount = _money(payload.get('surcharge_amount'))
			tax_amount = _money(payload.get('tax_amount'))
			total_amount = max(subtotal - discount_amount + surcharge_amount + tax_amount, Decimal('0'))
			order.subtotal = subtotal
			order.discount_amount = discount_amount
			order.surcharge_amount = surcharge_amount
			order.tax_amount = tax_amount
			order.total_amount = total_amount
			order.status = Order.Status.PAID
			order.save(update_fields=('subtotal', 'discount_amount', 'surcharge_amount', 'tax_amount', 'total_amount', 'status', 'updated_at'))
			deduct_for_sale(order.items.all(), request.user, order.pk)

			invoice = Invoice.objects.create(
				invoice_code=f'INV-{timezone.now():%Y%m%d%H%M%S}-{uuid4().hex[:4].upper()}',
				order=order,
				cashier=request.user,
				subtotal=subtotal,
				discount_amount=discount_amount,
				surcharge_amount=surcharge_amount,
				tax_amount=tax_amount,
				total_amount=total_amount,
			)
			Payment.objects.create(invoice=invoice, method=payment_method, amount=total_amount, created_by=request.user)
			if table:
				table.status = DiningTable.Status.AVAILABLE
				table.save(update_fields=('status', 'updated_at'))

	except ValidationError as error:
		return JsonResponse({'error': error.message}, status=400)
	except Exception:
		return JsonResponse({'error': 'Không thể hoàn tất thanh toán. Vui lòng thử lại.'}, status=500)

	return JsonResponse({'invoice_code': invoice.invoice_code, 'order_code': order.order_code, 'total_amount': str(total_amount)})


def _format_order_items(order, show_full_name=False):
	if not order:
		return ''
	parts = []
	for item in order.items.all():
		name = item.product_name.strip()
		if not show_full_name:
			words = name.split()
			acronym = ''.join([w[0].upper() for w in words if w])
			label = acronym or name
		else:
			label = name
		parts.append(f'{label} ({item.quantity})')
	text = ', '.join(parts)
	if order.note:
		text += f' - {order.note}'
	return text


@login_required
@require_GET
def invoice_list(request):
	from datetime import datetime
	import csv
	from django.http import HttpResponse
	from django.core.paginator import Paginator, EmptyPage, PageNotAnInteger
	from django.contrib.auth import get_user_model
	from dining.models import Area, DiningTable
	from django.db.models import Sum

	User = get_user_model()
	queryset = Invoice.objects.select_related(
		'order', 'cashier', 'order__table', 'order__table__area'
	).prefetch_related('order__items', 'payments').order_by('-paid_at')

	# Date filtering
	date_from_str = request.GET.get('date_from', '').strip()
	date_to_str = request.GET.get('date_to', '').strip()

	def _parse_date(s):
		if not s:
			return None
		for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y'):
			try:
				return datetime.strptime(s, fmt).date()
			except ValueError:
				pass
		return None

	date_from = _parse_date(date_from_str)
	date_to = _parse_date(date_to_str)

	if date_from:
		queryset = queryset.filter(paid_at__date__gte=date_from)
	if date_to:
		queryset = queryset.filter(paid_at__date__lte=date_to)

	# Cashier filtering
	cashier_val = request.GET.get('cashier', '').strip()
	if cashier_val and cashier_val != 'all':
		if cashier_val.isdigit():
			queryset = queryset.filter(cashier_id=int(cashier_val))
		else:
			queryset = queryset.filter(cashier__username=cashier_val)

	# Payment method filtering
	payment_method = request.GET.get('payment_method', '').strip()
	if payment_method and payment_method != 'all':
		queryset = queryset.filter(payments__method=payment_method).distinct()

	# Area filtering
	area_val = request.GET.get('area', '').strip()
	if area_val and area_val != 'all':
		if area_val.isdigit():
			queryset = queryset.filter(order__table__area_id=int(area_val))
		elif area_val.lower() == 'takeaway' or area_val.lower() == 'mang về':
			queryset = queryset.filter(order__order_type=Order.OrderType.TAKEAWAY)
		else:
			queryset = queryset.filter(order__table__area__name=area_val)

	# Table filtering
	table_val = request.GET.get('table', '').strip()
	if table_val and table_val != 'all':
		if table_val.isdigit():
			queryset = queryset.filter(order__table_id=int(table_val))
		else:
			queryset = queryset.filter(order__table__name=table_val)

	# Status filtering
	status_val = request.GET.get('status', 'paid').strip()
	if status_val == 'paid' or status_val == 'normal':
		queryset = queryset.filter(status=Invoice.Status.PAID)
	elif status_val == 'cancelled':
		queryset = queryset.filter(status=Invoice.Status.CANCELLED)

	# Option: show full product names
	show_full_name = request.GET.get('show_full_name', '') in ('1', 'true', 'on')
	no_paginate = request.GET.get('no_paginate', '') in ('1', 'true', 'on')

	# Summary statistics across the whole filtered queryset
	total_count = queryset.count()
	total_revenue = queryset.filter(status=Invoice.Status.PAID).aggregate(s=Sum('total_amount'))['s'] or Decimal('0')
	discount_count = queryset.filter(status=Invoice.Status.PAID, discount_amount__gt=0).count()
	discount_total = queryset.filter(status=Invoice.Status.PAID).aggregate(s=Sum('discount_amount'))['s'] or Decimal('0')

	summary = {
		'total_count': total_count,
		'total_revenue': float(total_revenue),
		'total_revenue_formatted': f'{total_revenue:,.0f}'.replace(',', '.') + ' đ',
		'discount_count': discount_count,
		'discount_total': float(discount_total),
		'discount_total_formatted': f'{discount_total:,.0f}'.replace(',', '.') + ' đ',
	}

	# Check for Excel / CSV export
	export_format = request.GET.get('export', '').strip().lower()
	if export_format in ('excel', 'csv'):
		response = HttpResponse(content_type='text/csv; charset=utf-8')
		filename = f"Hoa_don_thanh_toan_{timezone.now().strftime('%Y%m%d_%H%M%S')}.csv"
		response['Content-Disposition'] = f'attachment; filename="{filename}"'
		response.write('\ufeff')
		writer = csv.writer(response)
		writer.writerow([
			'Số HĐ', 'Thời gian', 'Nhân viên', 'Tiền món', 'Tiền giờ',
			'Phụ thu', 'Giảm giá', 'VAT', 'Thành tiền', 'Kiểu thanh toán',
			'Khu vực', 'Điểm bàn', 'Các món / Ghi chú'
		])
		for inv in queryset:
			table_name = inv.order.table.name if (inv.order and inv.order.table) else ('Mang về' if (inv.order and inv.order.order_type == Order.OrderType.TAKEAWAY) else '-')
			area_name = inv.order.table.area.name if (inv.order and inv.order.table and inv.order.table.area) else ('Mang về' if (inv.order and inv.order.order_type == Order.OrderType.TAKEAWAY) else '-')
			payment_str = ', '.join([p.get_method_display() for p in inv.payments.all()]) or 'Tiền mặt'
			items_str = _format_order_items(inv.order, show_full_name=show_full_name)
			time_str = inv.paid_at.strftime('%d/%m/%Y %I:%M %p') if inv.paid_at else '-'
			writer.writerow([
				inv.invoice_code,
				time_str,
				inv.cashier.get_full_name() or inv.cashier.username,
				int(inv.subtotal),
				0,
				int(inv.surcharge_amount),
				int(inv.discount_amount),
				int(inv.tax_amount),
				int(inv.total_amount),
				payment_str,
				area_name,
				table_name,
				items_str,
			])
		return response

	# Pagination
	page = request.GET.get('page', 1)
	per_page = 40 if not no_paginate else (total_count or 1)
	paginator = Paginator(queryset, per_page)
	try:
		invoices_page = paginator.page(page)
	except PageNotAnInteger:
		invoices_page = paginator.page(1)
	except EmptyPage:
		invoices_page = paginator.page(paginator.num_pages)

	# Serialize list for JSON responses
	if request.headers.get('x-requested-with') == 'XMLHttpRequest' or request.GET.get('format') == 'json':
		items_data = []
		for inv in invoices_page:
			table_name = inv.order.table.name if (inv.order and inv.order.table) else ('Mang về' if (inv.order and inv.order.order_type == Order.OrderType.TAKEAWAY) else '-')
			area_name = inv.order.table.area.name if (inv.order and inv.order.table and inv.order.table.area) else ('Mang về' if (inv.order and inv.order.order_type == Order.OrderType.TAKEAWAY) else '-')
			payment_str = ', '.join([p.get_method_display() for p in inv.payments.all()]) or 'Tiền mặt'
			items_short = _format_order_items(inv.order, show_full_name=False)
			items_full = _format_order_items(inv.order, show_full_name=True)
			items_data.append({
				'invoice_code': inv.invoice_code,
				'time': inv.paid_at.strftime('%d/%m/%Y %I:%M %p') if inv.paid_at else '-',
				'cashier': inv.cashier.get_full_name() or inv.cashier.username,
				'subtotal': float(inv.subtotal),
				'subtotal_formatted': f'{inv.subtotal:,.0f}'.replace(',', '.'),
				'hourly_fee': 0,
				'surcharge': float(inv.surcharge_amount),
				'discount': float(inv.discount_amount),
				'discount_formatted': f'{inv.discount_amount:,.0f}'.replace(',', '.'),
				'tax': float(inv.tax_amount),
				'total_amount': float(inv.total_amount),
				'total_amount_formatted': f'{inv.total_amount:,.0f}'.replace(',', '.'),
				'payment_method': payment_str,
				'area': area_name,
				'table': table_name,
				'items_short': items_short,
				'items_full': items_full,
				'status': inv.status,
				'status_display': inv.get_status_display(),
			})
		return JsonResponse({
			'ok': True,
			'invoices': items_data,
			'summary': summary,
			'pagination': {
				'current_page': invoices_page.number,
				'total_pages': paginator.num_pages,
				'has_next': invoices_page.has_next(),
				'has_previous': invoices_page.has_previous(),
				'total_count': total_count,
			}
		})

	# Template context
	areas = Area.objects.filter(is_active=True).order_by('display_order', 'name')
	tables = DiningTable.objects.filter(is_active=True).select_related('area').order_by('area__display_order', 'display_order', 'name')
	cashiers = User.objects.filter(is_active=True).order_by('username')
	payment_methods = Payment.Method.choices

	context = {
		'invoices': invoices_page,
		'summary': summary,
		'areas': areas,
		'tables': tables,
		'cashiers': cashiers,
		'payment_methods': payment_methods,
		'filters': {
			'date_from': date_from_str,
			'date_to': date_to_str,
			'cashier': cashier_val,
			'payment_method': payment_method,
			'area': area_val,
			'table': table_val,
			'status': status_val,
			'show_full_name': show_full_name,
			'no_paginate': no_paginate,
		}
	}
	return render(request, 'sales/invoice_list.html', context)


@login_required
@role_required('Owner', 'Manager', 'Sales')
@require_POST
def edit_invoice(request):
	try:
		payload = json.loads(request.body or '{}')
	except json.JSONDecodeError:
		return JsonResponse({'error': 'Dữ liệu sửa hóa đơn không hợp lệ.'}, status=400)
	reason = str(payload.get('reason', '')).strip()
	invoice_code = str(payload.get('invoice_code', '')).strip()
	if not reason:
		return JsonResponse({'error': 'Vui lòng nhập lý do sửa hóa đơn.'}, status=400)
	invoice = Invoice.objects.filter(invoice_code=invoice_code).first()
	if invoice is None:
		return JsonResponse({'error': 'Không tìm thấy hóa đơn.'}, status=404)
	ActivityLog.objects.create(
		actor=request.user,
		action=ActivityLog.Action.UPDATE,
		method=request.method,
		path=request.path,
		object_type='Invoice',
		object_id=invoice.pk,
		description=f'Sửa hóa đơn số {invoice.invoice_code} (lý do: {reason})',
		status_code=200,
		ip_address=request.META.get('REMOTE_ADDR'),
	)
	return JsonResponse({'ok': True})


@login_required
@role_required('Owner', 'Manager', 'Sales')
@require_POST
def delete_invoice(request):
	try:
		payload = json.loads(request.body or '{}')
	except json.JSONDecodeError:
		return JsonResponse({'error': 'Dữ liệu xóa hóa đơn không hợp lệ.'}, status=400)
	reason = str(payload.get('reason', '')).strip()
	invoice_code = str(payload.get('invoice_code', '')).strip()
	if not reason:
		return JsonResponse({'error': 'Vui lòng nhập lý do xóa hóa đơn.'}, status=400)
	invoice = Invoice.objects.select_related('order').filter(invoice_code=invoice_code).first()
	if invoice is None:
		return JsonResponse({'error': 'Không tìm thấy hóa đơn.'}, status=404)
	invoice.status = Invoice.Status.CANCELLED
	invoice.cancelled_at = timezone.now()
	invoice.cancel_reason = reason[:255]
	invoice.save(update_fields=('status', 'cancelled_at', 'cancel_reason'))
	invoice.order.status = Order.Status.CANCELLED
	invoice.order.save(update_fields=('status', 'updated_at'))
	ActivityLog.objects.create(
		actor=request.user,
		action=ActivityLog.Action.DELETE,
		method=request.method,
		path=request.path,
		object_type='Invoice',
		object_id=invoice.pk,
		description=f'Hủy hóa đơn số {invoice.invoice_code} (lý do: {reason})',
		status_code=200,
		ip_address=request.META.get('REMOTE_ADDR'),
	)
	return JsonResponse({'ok': True})
