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
from audit.models import ActivityLog, log_activity
from catalog.models import Product
from dining.models import DiningTable
from inventory.services import deduct_for_sale, restore_stock_for_undone_sale

from .models import Invoice, Order, OrderItem, Payment


def _money(value, default='0'):
	try:
		amount = Decimal(str(value))
	except (InvalidOperation, TypeError, ValueError):
		return Decimal(default)
	return max(amount, Decimal('0'))


@login_required
@role_required('Owner', 'Manager', 'Sales', 'Cashier')
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

	parsed_items = []
	subtotal = Decimal('0')
	item_discounts_sum = Decimal('0')
	for raw_item in raw_items:
		try:
			product_id = int(raw_item.get('product_id'))
			quantity = int(raw_item.get('quantity', 1))
		except (TypeError, ValueError):
			return JsonResponse({'error': 'Món hoặc số lượng không hợp lệ.'}, status=400)
		if quantity < 1 or quantity > 999:
			return JsonResponse({'error': 'Số lượng món phải từ 1 đến 999.'}, status=400)
		product = Product.objects.filter(pk=product_id, is_active=True).first()
		if product is None:
			return JsonResponse({'error': 'Một món trong đơn không còn được bán.'}, status=400)

		raw_price = raw_item.get('unit_price')
		unit_price = _money(raw_price, default=str(product.price)) if raw_price is not None else product.price
		if unit_price <= 0:
			unit_price = product.price
		disc_pct = _money(raw_item.get('discount_percent', 0))
		if disc_pct > 100:
			disc_pct = Decimal('100')
		line_gross = unit_price * quantity
		line_disc = (line_gross * disc_pct / Decimal('100')).quantize(Decimal('1'))
		note = str(raw_item.get('note', '') or '').strip()[:255]

		parsed_items.append({
			'product': product,
			'quantity': quantity,
			'unit_price': unit_price,
			'discount_amount': line_disc,
			'note': note,
		})
		subtotal += line_gross
		item_discounts_sum += line_disc

	explicit_discount = _money(payload.get('discount_amount'))
	discount_amount = explicit_discount if explicit_discount > 0 else item_discounts_sum
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
			for p_item in parsed_items:
				prod = p_item['product']
				OrderItem.objects.create(
					order=order,
					product=prod,
					product_name=prod.name,
					unit=prod.unit,
					quantity=p_item['quantity'],
					unit_price=p_item['unit_price'],
					discount_amount=p_item['discount_amount'],
					note=p_item['note'],
				)

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
				invoice_code=Invoice.next_invoice_code(),
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
@require_GET
def invoice_detail_api(request, invoice_code):
	"""API lấy thông tin chi tiết một hóa đơn để phục vụ modal Sửa hóa đơn."""
	from django.contrib.auth import get_user_model
	User = get_user_model()

	invoice = Invoice.objects.select_related(
		'order', 'cashier', 'order__table', 'order__table__area'
	).prefetch_related('order__items', 'payments').filter(invoice_code=invoice_code).first()

	if not invoice:
		return JsonResponse({'ok': False, 'error': 'Không tìm thấy hóa đơn.'}, status=404)

	cashiers = [{'id': u.id, 'name': u.get_full_name() or u.username} for u in User.objects.filter(is_active=True).order_by('username')]
	
	first_payment = invoice.payments.first()
	payment_method = first_payment.method if first_payment else Payment.Method.CASH

	order = invoice.order
	table_name = order.table.name if (order and order.table) else ('Mang về' if (order and order.order_type == Order.OrderType.TAKEAWAY) else '-')

	items_data = []
	if order:
		for item in order.items.filter(status=OrderItem.Status.ACTIVE):
			orig_total = item.unit_price * item.quantity
			discount_pct = float(round((item.discount_amount / orig_total * 100), 1)) if orig_total > 0 else 0
			items_data.append({
				'id': item.id,
				'product_id': item.product_id,
				'product_name': item.product_name,
				'unit': item.unit,
				'unit_price': float(item.unit_price),
				'quantity': item.quantity,
				'discount_percent': discount_pct,
				'discount_amount': float(item.discount_amount),
				'total_amount': float(item.total_amount),
				'note': item.note,
			})

	products = [
		{'id': p.id, 'code': p.code, 'name': p.name, 'price': float(p.price), 'unit': p.unit}
		for p in Product.objects.filter(is_active=True).order_by('name')
	]

	payment_methods = [{'code': code, 'name': label} for code, label in Payment.Method.choices]

	return JsonResponse({
		'ok': True,
		'invoice': {
			'invoice_code': invoice.invoice_code,
			'table_name': table_name,
			'cashier_id': invoice.cashier_id,
			'cashier_name': invoice.cashier.get_full_name() or invoice.cashier.username,
			'payment_method': payment_method,
			'payment_method_display': first_payment.get_method_display() if first_payment else 'Tiền mặt',
			'subtotal': float(invoice.subtotal),
			'surcharge_amount': float(invoice.surcharge_amount),
			'discount_amount': float(invoice.discount_amount),
			'tax_amount': float(invoice.tax_amount),
			'total_amount': float(invoice.total_amount),
			'items': items_data,
		},
		'cashiers': cashiers,
		'payment_methods': payment_methods,
		'products': products,
	})


@login_required
@role_required('Owner', 'Manager', 'Sales')
@require_POST
def edit_invoice(request):
	"""Chức năng Sửa hóa đơn đầy đủ: chỉnh sửa món, số lượng, giảm giá %, nhân viên, phương thức thanh toán, phụ thu, VAT và ghi nhật ký hoạt động."""
	from django.contrib.auth import get_user_model
	try:
		payload = json.loads(request.body or '{}')
	except json.JSONDecodeError:
		return JsonResponse({'ok': False, 'error': 'Dữ liệu sửa hóa đơn không hợp lệ.'}, status=400)

	invoice_code = str(payload.get('invoice_code', '')).strip()
	reason = str(payload.get('reason', '')).strip()

	if not invoice_code:
		return JsonResponse({'ok': False, 'error': 'Thiếu mã hóa đơn cần sửa.'}, status=400)

	if not reason:
		return JsonResponse({'ok': False, 'error': 'Vui lòng nhập lý do sửa hóa đơn.'}, status=400)

	invoice = Invoice.objects.select_related('order', 'cashier').prefetch_related('order__items', 'payments').filter(invoice_code=invoice_code).first()
	if invoice is None:
		return JsonResponse({'ok': False, 'error': 'Không tìm thấy hóa đơn.'}, status=404)

	raw_items = payload.get('items', [])
	if not isinstance(raw_items, list) or not raw_items:
		return JsonResponse({'ok': False, 'error': 'Hóa đơn phải có ít nhất một món.'}, status=400)

	cashier_id = payload.get('cashier_id')
	payment_method = payload.get('payment_method', Payment.Method.CASH)
	surcharge_val = _money(payload.get('surcharge_amount', 0))
	discount_val = _money(payload.get('discount_amount', 0))
	tax_val = _money(payload.get('tax_amount', 0))

	with transaction.atomic():
		old_total = invoice.total_amount
		old_payment = invoice.payments.first()
		old_method = old_payment.get_method_display() if old_payment else 'Tiền mặt'
		old_cashier_id = invoice.cashier_id
		old_surcharge = invoice.surcharge_amount
		old_discount = invoice.discount_amount
		old_tax = invoice.tax_amount

		order = invoice.order
		old_items_sig = [
			(it.product_name, int(it.quantity), it.unit_price, it.discount_amount)
			for it in order.items.filter(status=OrderItem.Status.ACTIVE).order_by('id')
		]
		order.items.all().delete()

		subtotal_calc = Decimal(0)
		default_product = Product.objects.filter(is_active=True).first()

		for it in raw_items:
			p_id = it.get('product_id')
			p_name = str(it.get('product_name', '')).strip()
			p_unit = str(it.get('unit', '')).strip() or 'Phần'
			p_price = _money(it.get('unit_price', 0))
			p_qty = max(1, int(it.get('quantity', 1)))
			p_disc_pct = Decimal(str(it.get('discount_percent', 0) or 0))

			product = None
			if p_id and str(p_id).isdigit():
				product = Product.objects.filter(pk=int(p_id)).first()
			if product:
				p_name = p_name or product.name
				p_unit = p_unit or product.unit

			item_raw_total = p_price * p_qty
			item_disc = (item_raw_total * p_disc_pct / Decimal(100)).quantize(Decimal('1'))
			item_total = max(Decimal(0), item_raw_total - item_disc)

			OrderItem.objects.create(
				order=order,
				product=product if product else default_product,
				product_name=p_name or 'Món gọi',
				unit=p_unit,
				quantity=p_qty,
				unit_price=p_price,
				discount_amount=item_disc,
				total_amount=item_total,
				status=OrderItem.Status.ACTIVE,
			)
			subtotal_calc += item_total

		# Check tax
		if 0 < tax_val <= 100:
			tax_amount = ((subtotal_calc + surcharge_val - discount_val) * tax_val / Decimal(100)).quantize(Decimal('1'))
		else:
			tax_amount = tax_val

		total_calc = max(Decimal(0), subtotal_calc + surcharge_val - discount_val + tax_amount)

		# Update Order
		order.subtotal = subtotal_calc
		order.surcharge_amount = surcharge_val
		order.discount_amount = discount_val
		order.tax_amount = tax_amount
		order.total_amount = total_calc
		order.save()

		# Update Invoice
		invoice.subtotal = subtotal_calc
		invoice.surcharge_amount = surcharge_val
		invoice.discount_amount = discount_val
		invoice.tax_amount = tax_amount
		invoice.total_amount = total_calc

		if cashier_id:
			User = get_user_model()
			new_cashier = User.objects.filter(pk=cashier_id).first()
			if new_cashier:
				invoice.cashier = new_cashier

		invoice.save()

		# Update or create payment
		if old_payment:
			old_payment.method = payment_method
			old_payment.amount = total_calc
			old_payment.save()
			new_payment_method_display = old_payment.get_method_display()
		else:
			new_pm = Payment.objects.create(
				invoice=invoice,
				method=payment_method,
				amount=total_calc,
				created_by=request.user
			)
			new_payment_method_display = new_pm.get_method_display()

		# Build descriptive activity log matching the screenshot format:
		# Sửa hóa đơn số 00874 (thay đổi kiểu thanh toán, thông tin các món) thành tiền từ 210.000 đ thành 195.000 đ (lý do)
		new_items_sig = [
			(it.product_name, int(it.quantity), it.unit_price, it.discount_amount)
			for it in order.items.filter(status=OrderItem.Status.ACTIVE).order_by('id')
		]
		change_parts = []
		if old_cashier_id != invoice.cashier_id:
			change_parts.append('nhân viên')
		if old_method != new_payment_method_display:
			change_parts.append('kiểu thanh toán')
		if (
			old_items_sig != new_items_sig
			or old_surcharge != surcharge_val
			or old_discount != discount_val
			or old_tax != tax_amount
			or not change_parts
		):
			change_parts.append('thông tin các món')

		change_summary = f"(thay đổi {', '.join(change_parts)})"
		old_fmt = f'{old_total:,.0f}'.replace(',', '.')
		new_fmt = f'{total_calc:,.0f}'.replace(',', '.')
		amount_summary = f'thành tiền từ {old_fmt} đ thành {new_fmt} đ'

		if reason:
			log_description = f'Sửa hóa đơn số {invoice.invoice_code} {change_summary} {amount_summary} ({reason})'
		else:
			log_description = f'Sửa hóa đơn số {invoice.invoice_code} {change_summary} {amount_summary}'

		new_log = log_activity(
			actor=request.user,
			action=ActivityLog.Action.EDIT_INVOICE,
			description=log_description,
			reason=reason or 'Điều chỉnh hóa đơn theo yêu cầu',
			request=request,
			object_type='Invoice',
			object_id=invoice.pk,
		)

		items_short_parts = []
		for it in order.items.select_related('product').filter(status=OrderItem.Status.ACTIVE):
			code_str = it.product.code if (it.product and it.product.code) else ''.join(w[0].upper() for w in it.product_name.split() if w)
			items_short_parts.append(f'{code_str} ({it.quantity})')
		items_short = ', '.join(items_short_parts)

	return JsonResponse({
		'ok': True,
		'message': f'Đã cập nhật hóa đơn số {invoice.invoice_code} thành công.',
		'invoice': {
			'invoice_code': invoice.invoice_code,
			'total_amount': float(invoice.total_amount),
			'total_amount_formatted': f'{invoice.total_amount:,.0f}'.replace(',', '.'),
			'subtotal_formatted': f'{invoice.subtotal:,.0f}'.replace(',', '.'),
			'surcharge_formatted': f'{invoice.surcharge_amount:,.0f}'.replace(',', '.') if invoice.surcharge_amount else '0',
			'discount_formatted': f'{invoice.discount_amount:,.0f}'.replace(',', '.') if invoice.discount_amount else '',
			'tax_formatted': f'{invoice.tax_amount:,.0f}'.replace(',', '.') if invoice.tax_amount else '',
			'cashier': invoice.cashier.get_full_name() or invoice.cashier.username,
			'payment_method': new_payment_method_display,
			'items_short': items_short,
		},
		'activity_log': {
			'id': new_log.id,
			'time': timezone.localtime(new_log.created_at).strftime('%I:%M %p'),
			'formatted_time': new_log.formatted_time,
			'action': new_log.action,
			'action_display': new_log.get_action_display(),
			'action_color': new_log.action_color,
			'description': new_log.description,
			'reason': new_log.reason,
			'actor_name': new_log.display_actor,
		},
	})


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

	total_fmt = f'{invoice.total_amount:,.0f}'.replace(',', '.')
	log_desc = f'Xóa hóa đơn số {invoice.invoice_code} thành tiền {total_fmt} đ ({reason})'
	new_log = log_activity(
		actor=request.user,
		action=ActivityLog.Action.DELETE_INVOICE,
		description=log_desc,
		reason=reason,
		request=request,
		object_type='Invoice',
		object_id=invoice.pk,
	)
	return JsonResponse({
		'ok': True,
		'message': f'Đã xóa hóa đơn số {invoice.invoice_code}.',
		'activity_log': {
			'id': new_log.id,
			'time': timezone.localtime(new_log.created_at).strftime('%I:%M %p'),
			'formatted_time': new_log.formatted_time,
			'action': new_log.action,
			'action_display': new_log.get_action_display(),
			'action_color': new_log.action_color,
			'description': new_log.description,
			'reason': new_log.reason,
			'actor_name': new_log.display_actor,
		},
	})


@login_required
@role_required('Owner', 'Manager', 'Sales')
@require_POST
def table_action_api(request):
	"""API xử lý các nghiệp vụ bàn: Đặt chỗ, Hủy đặt, Mở bàn, Hủy bàn, Chuyển, Nhập, Ghép, Tách bàn và ghi Nhật ký hoạt động."""
	try:
		payload = json.loads(request.body or '{}')
	except json.JSONDecodeError:
		return JsonResponse({'ok': False, 'error': 'Dữ liệu thao tác bàn không hợp lệ.'}, status=400)

	action_type = str(payload.get('action', '')).strip().lower()
	source_id = payload.get('source_table_id')
	target_id = payload.get('target_table_id')
	detail_text = str(payload.get('detail', '')).strip()

	source_table = DiningTable.objects.select_related('area').filter(pk=source_id, is_active=True).first() if source_id else None
	target_table = DiningTable.objects.select_related('area').filter(pk=target_id, is_active=True).first() if target_id else None

	if not source_table:
		return JsonResponse({'ok': False, 'error': 'Không tìm thấy bàn thao tác.'}, status=404)

	new_log = None
	with transaction.atomic():
		if action_type == 'reserve':
			source_table.status = DiningTable.Status.RESERVED
			source_table.save(update_fields=('status', 'updated_at'))
			desc = detail_text or f'Đặt trước bàn {source_table.name} ({source_table.area.name})'
			new_log = log_activity(
				actor=request.user,
				action=ActivityLog.Action.RESERVE_TABLE,
				description=desc,
				request=request,
				object_type='DiningTable',
				object_id=source_table.pk,
			)
		elif action_type == 'unreserve':
			source_table.status = DiningTable.Status.AVAILABLE
			source_table.save(update_fields=('status', 'updated_at'))
			desc = detail_text or f'Hủy đặt bàn {source_table.name} ({source_table.area.name})'
			new_log = log_activity(
				actor=request.user,
				action=ActivityLog.Action.RESERVE_TABLE,
				description=desc,
				request=request,
				object_type='DiningTable',
				object_id=source_table.pk,
			)
		elif action_type == 'cancel_open':
			source_table.status = DiningTable.Status.AVAILABLE
			source_table.save(update_fields=('status', 'updated_at'))
		elif action_type == 'open':
			source_table.status = DiningTable.Status.OCCUPIED
			source_table.save(update_fields=('status', 'updated_at'))
		elif action_type == 'transfer':
			if not target_table:
				return JsonResponse({'ok': False, 'error': 'Vui lòng chọn bàn đích để chuyển.'}, status=400)
			source_table.status = DiningTable.Status.AVAILABLE
			source_table.save(update_fields=('status', 'updated_at'))
			target_table.status = DiningTable.Status.OCCUPIED
			target_table.save(update_fields=('status', 'updated_at'))
			desc = detail_text or f'Chuyển từ bàn {source_table.name} sang bàn {target_table.name}'
			new_log = log_activity(
				actor=request.user,
				action=ActivityLog.Action.TRANSFER_TABLE,
				description=desc,
				request=request,
				object_type='DiningTable',
				object_id=source_table.pk,
			)
		elif action_type == 'import':
			if not target_table:
				return JsonResponse({'ok': False, 'error': 'Vui lòng chọn bàn để nhập.'}, status=400)
			source_table.status = DiningTable.Status.AVAILABLE
			source_table.save(update_fields=('status', 'updated_at'))
			target_table.status = DiningTable.Status.OCCUPIED
			target_table.save(update_fields=('status', 'updated_at'))
			desc = detail_text or f'Nhập từ bàn {source_table.name} vào bàn {target_table.name}'
			new_log = log_activity(
				actor=request.user,
				action=ActivityLog.Action.STOCK_RECEIPT,
				description=desc,
				request=request,
				object_type='DiningTable',
				object_id=target_table.pk,
			)
		elif action_type == 'combine':
			if not target_table:
				return JsonResponse({'ok': False, 'error': 'Vui lòng chọn bàn để ghép.'}, status=400)
			source_table.status = DiningTable.Status.OCCUPIED
			source_table.save(update_fields=('status', 'updated_at'))
			target_table.status = DiningTable.Status.OCCUPIED
			target_table.save(update_fields=('status', 'updated_at'))
			desc = detail_text or f'Ghép bàn {source_table.name} với bàn {target_table.name}'
			new_log = log_activity(
				actor=request.user,
				action=ActivityLog.Action.MERGE_TABLE,
				description=desc,
				request=request,
				object_type='DiningTable',
				object_id=source_table.pk,
			)
		elif action_type == 'split':
			if not target_table:
				return JsonResponse({'ok': False, 'error': 'Vui lòng chọn bàn đích để tách.'}, status=400)
			target_table.status = DiningTable.Status.OCCUPIED
			target_table.save(update_fields=('status', 'updated_at'))
			desc = detail_text or f'Tách từ bàn {source_table.name} sang bàn {target_table.name}'
			new_log = log_activity(
				actor=request.user,
				action=ActivityLog.Action.SPLIT_TABLE,
				description=desc,
				request=request,
				object_type='DiningTable',
				object_id=source_table.pk,
			)
		else:
			return JsonResponse({'ok': False, 'error': 'Thao tác bàn không hợp lệ.'}, status=400)

	response_data = {
		'ok': True,
		'action': action_type,
		'source_table': {'id': source_table.id, 'name': source_table.name, 'status': source_table.status},
		'target_table': {'id': target_table.id, 'name': target_table.name, 'status': target_table.status} if target_table else None,
	}
	if new_log:
		response_data['activity_log'] = {
			'id': new_log.id,
			'time': timezone.localtime(new_log.created_at).strftime('%I:%M %p'),
			'formatted_time': new_log.formatted_time,
			'action': new_log.action,
			'action_display': new_log.get_action_display(),
			'action_color': new_log.action_color,
			'description': new_log.description,
			'reason': new_log.reason,
			'actor_name': new_log.display_actor,
		}
	return JsonResponse(response_data)


@login_required
@role_required('Owner', 'Manager', 'Sales')
@require_GET
def sales_statistics_api(request):
	"""API trả về toàn bộ dữ liệu Thống kê bán hàng theo khoảng thời gian."""
	from .statistics import get_sales_statistics_data, parse_datetime_param
	from_str = request.GET.get('from', '') or request.GET.get('from_time', '')
	to_str = request.GET.get('to', '') or request.GET.get('to_time', '')
	start_dt = parse_datetime_param(from_str, is_end_of_day=False)
	end_dt = parse_datetime_param(to_str, is_end_of_day=True)
	stats = get_sales_statistics_data(start_dt, end_dt)
	return JsonResponse({'ok': True, 'stats': stats})


@login_required
@role_required('Owner', 'Manager', 'Sales')
@require_GET
def sales_statistics_export_excel(request):
	"""Xuất Thống kê bán hàng ra file Excel (CSV UTF-8 với BOM)."""
	from .statistics import get_sales_statistics_data, export_sales_statistics_csv, parse_datetime_param
	from_str = request.GET.get('from', '') or request.GET.get('from_time', '')
	to_str = request.GET.get('to', '') or request.GET.get('to_time', '')
	start_dt = parse_datetime_param(from_str, is_end_of_day=False)
	end_dt = parse_datetime_param(to_str, is_end_of_day=True)
	stats = get_sales_statistics_data(start_dt, end_dt)
	return export_sales_statistics_csv(stats)


@login_required
@role_required('Owner', 'Manager', 'Sales')
@require_GET
def sales_statistics_print(request):
	"""Trang in kiểm bán hàng (In kiểm bán) tối ưu cho in ấn A4 / máy in nhiệt POS 80mm."""
	from .statistics import get_sales_statistics_data, parse_datetime_param
	from_str = request.GET.get('from', '') or request.GET.get('from_time', '')
	to_str = request.GET.get('to', '') or request.GET.get('to_time', '')
	start_dt = parse_datetime_param(from_str, is_end_of_day=False)
	end_dt = parse_datetime_param(to_str, is_end_of_day=True)
	stats = get_sales_statistics_data(start_dt, end_dt)
	return render(request, 'sales/sales_statistics_print.html', {
		'stats': stats,
		'current_user': request.user,
		'printed_at': timezone.localtime(),
	})


@login_required
@role_required('Owner', 'Manager', 'Sales', 'Cashier')
@require_POST
def undo_payment(request):
	"""
	Chức năng Hoàn tác thanh toán (như ảnh mẫu DRS Manager / MixFood POS):
	- Hoàn tác hóa đơn đã thanh toán của bàn (hoặc theo mã hóa đơn)
	- Hoàn trả lại tồn kho nguyên liệu đã xuất
	- Xóa hóa đơn thanh toán, đưa bàn về lại trạng thái Đang phục vụ (màu xanh) với đầy đủ các món, giảm giá, phụ thu
	- Ghi nhận vào Nhật ký hoạt động: 'Hoàn tác thanh toán cho bàn <Tên bàn> (hóa đơn số <Mã HĐ>)' (Hoạt động: Khác)
	"""
	try:
		payload = json.loads(request.body or '{}')
	except json.JSONDecodeError:
		return JsonResponse({'ok': False, 'error': 'Dữ liệu hoàn tác thanh toán không hợp lệ.'}, status=400)

	invoice_code = str(payload.get('invoice_code', '') or '').strip().lstrip('#')
	table_id = payload.get('table_id')

	qs = Invoice.objects.select_related(
		'order', 'order__table', 'order__table__area', 'cashier'
	).prefetch_related('order__items', 'order__items__product', 'payments').filter(
		status=Invoice.Status.PAID
	)

	invoice = None
	if invoice_code:
		invoice = qs.filter(invoice_code=invoice_code).first()
	elif table_id:
		invoice = qs.filter(order__table_id=table_id).order_by('-paid_at').first()

	if invoice is None:
		return JsonResponse({'ok': False, 'error': 'Không tìm thấy hóa đơn thanh toán cần hoàn tác.'}, status=404)

	order = invoice.order
	table = order.table if order else None
	table_id_val = table.pk if table else None
	table_name = table.name if table else 'Mang về'
	area_name = (table.area.name if table and table.area else 'Mang về')
	inv_code = invoice.invoice_code
	arrival_dt = timezone.localtime(order.created_at) if order else timezone.localtime(invoice.paid_at)
	arrival_time_str = arrival_dt.strftime('%I:%M %p')
	cashier_name = invoice.cashier.get_full_name() or invoice.cashier.username

	restored_items = []
	if order:
		for item in order.items.filter(status=OrderItem.Status.ACTIVE).order_by('id'):
			gross = item.unit_price * item.quantity
			disc_pct = round(float(item.discount_amount * Decimal('100') / gross), 1) if gross > 0 else 0.0
			restored_items.append({
				'product_id': item.product_id,
				'name': item.product_name,
				'unit': item.unit,
				'price': float(item.unit_price),
				'quantity': int(item.quantity),
				'discount_amount': float(item.discount_amount),
				'discount_percent': disc_pct,
				'note': item.note or '',
			})

	subtotal_val = float(invoice.subtotal)
	discount_val = float(invoice.discount_amount)
	items_disc_sum = sum(float(it['discount_amount']) for it in restored_items)
	extra_order_discount_val = max(0.0, round(discount_val - items_disc_sum, 2))
	surcharge_val = float(invoice.surcharge_amount)
	tax_val = float(invoice.tax_amount)
	total_val = float(invoice.total_amount)
	discount_pct_val = round(discount_val * 100.0 / subtotal_val, 1) if subtotal_val > 0 else 0.0

	with transaction.atomic():
		if order:
			restore_stock_for_undone_sale(order.pk)

		if table:
			table.status = DiningTable.Status.OCCUPIED
			table.save(update_fields=('status', 'updated_at'))

		# Xóa Payment -> Invoice -> Order để hóa đơn được hoàn tác hoàn toàn khỏi danh sách đã thanh toán
		invoice.payments.all().delete()
		invoice.delete()
		if order:
			order.delete()

		log_desc = f'Hoàn tác thanh toán cho bàn {table_name} (hóa đơn số {inv_code})'
		new_log = log_activity(
			actor=request.user,
			action=ActivityLog.Action.OTHER,
			description=log_desc,
			request=request,
			object_type='DiningTable',
			object_id=table_id_val,
		)

		# Kiểm tra xem bàn này còn hóa đơn đã thanh toán nào trước đó trong ngày không
		previous_last_paid = None
		if table_id_val:
			now = timezone.localtime()
			from datetime import datetime, time
			day_start = timezone.make_aware(datetime.combine(now.date(), time.min))
			prev_inv = (
				Invoice.objects.filter(
					status=Invoice.Status.PAID,
					order__table_id=table_id_val,
					paid_at__gte=day_start,
				)
				.order_by('-paid_at')
				.first()
			)
			if prev_inv:
				prev_local = timezone.localtime(prev_inv.paid_at)
				prev_total_fmt = f'{prev_inv.total_amount:,.0f}'.replace(',', '.')
				previous_last_paid = {
					'invoice_code': prev_inv.invoice_code,
					'table_id': table_id_val,
					'table_name': table_name,
					'paid_time_short': prev_local.strftime('%I:%M'),
					'paid_datetime_full': prev_local.strftime('%d/%m/%Y %I:%M %p'),
					'total_amount': float(prev_inv.total_amount),
					'total_formatted': f'{prev_total_fmt} đ',
				}

	return JsonResponse({
		'ok': True,
		'message': 'Đã hoàn tác việc thanh toán!',
		'undone_invoice_code': inv_code,
		'restored_order': {
			'table_id': str(table_id_val) if table_id_val else '',
			'table_name': table_name,
			'area_name': area_name,
			'arrival_time': arrival_time_str,
			'cashier_name': cashier_name,
			'subtotal': subtotal_val,
			'discount_amount': extra_order_discount_val,
			'total_discount_amount': discount_val,
			'discount_percent': discount_pct_val,
			'surcharge_amount': surcharge_val,
			'tax_amount': tax_val,
			'total_amount': total_val,
			'items': restored_items,
		},
		'previous_last_paid': previous_last_paid,
		'activity_log': {
			'id': new_log.id,
			'time': timezone.localtime(new_log.created_at).strftime('%I:%M %p'),
			'formatted_time': new_log.formatted_time,
			'action': new_log.action,
			'action_display': new_log.get_action_display(),
			'action_color': new_log.action_color,
			'description': new_log.description,
			'reason': new_log.reason,
			'actor_name': new_log.display_actor,
		},
	})



