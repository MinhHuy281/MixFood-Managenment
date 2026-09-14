import json
from decimal import Decimal, InvalidOperation
from uuid import uuid4

from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from catalog.models import Product
from dining.models import DiningTable

from .models import Invoice, Order, OrderItem, Payment


def _money(value, default='0'):
	try:
		amount = Decimal(str(value))
	except (InvalidOperation, TypeError, ValueError):
		return Decimal(default)
	return max(amount, Decimal('0'))


@login_required
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

	validated_items = []
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
		validated_items.append((product, quantity))

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
			for product, quantity in validated_items:
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

	except Exception:
		return JsonResponse({'error': 'Không thể hoàn tất thanh toán. Vui lòng thử lại.'}, status=500)

	return JsonResponse({'invoice_code': invoice.invoice_code, 'order_code': order.order_code, 'total_amount': str(total_amount)})


@login_required
@require_GET
def invoice_list(request):
	invoices = Invoice.objects.select_related('order', 'cashier', 'order__table').prefetch_related('payments')[:100]
	return render(request, 'sales/invoice_list.html', {'invoices': invoices})
