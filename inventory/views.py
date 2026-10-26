import csv
import datetime
import json
from decimal import Decimal

from django.contrib.auth.decorators import login_required
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, render
from django.utils import timezone

from accounts.decorators import role_required
from catalog.models import Category, Ingredient, Product

from .models import (
	Recipe, RecipeItem, StockReceipt, StockReceiptItem,
	StockTransaction, StockIssue, StockIssueItem, StockAdjustment, StockAdjustmentItem
)
from .services import (
	create_and_confirm_receipt,
	create_and_confirm_issue,
	create_and_confirm_adjustment,
)


def update_product_cost_from_recipe(product):
	"""Tự động tính lại giá vốn món ăn từ tổng định lượng nguyên liệu."""
	recipe = getattr(product, 'recipe', None)
	if not recipe or not recipe.is_active:
		return Decimal(0)

	total_cost = Decimal(0)
	for item in recipe.items.select_related('ingredient'):
		if item.ingredient and item.ingredient.is_active:
			total_cost += item.quantity * item.ingredient.average_cost

	product.cost_price = total_cost
	product.save(update_fields=('cost_price', 'updated_at'))
	return total_cost


def _parse_filter_date_range(range_type='this_month', start_str=None, end_str=None):
	now = timezone.localtime()
	today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
	today_end = now.replace(hour=23, minute=59, second=59, microsecond=999999)

	if range_type == 'today':
		return today_start, today_end, f"Hôm nay ({now.strftime('%d/%m/%Y')})"
	elif range_type == 'yesterday':
		y_start = today_start - datetime.timedelta(days=1)
		y_end = y_start.replace(hour=23, minute=59, second=59, microsecond=999999)
		return y_start, y_end, f"Hôm qua ({y_start.strftime('%d/%m/%Y')})"
	elif range_type == '7days':
		start = today_start - datetime.timedelta(days=6)
		return start, today_end, f"7 ngày qua ({start.strftime('%d/%m')} - {today_end.strftime('%d/%m/%Y')})"
	elif range_type == 'this_month':
		start = today_start.replace(day=1)
		return start, today_end, f"Tháng này ({start.strftime('%d/%m')} - {today_end.strftime('%d/%m/%Y')})"
	elif range_type == 'last_month':
		first_this_month = today_start.replace(day=1)
		last_month_end = first_this_month - datetime.timedelta(seconds=1)
		last_month_start = last_month_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
		return last_month_start, last_month_end, f"Tháng trước ({last_month_start.strftime('%d/%m')} - {last_month_end.strftime('%d/%m/%Y')})"
	elif range_type == 'custom' and start_str and end_str:
		try:
			s_date = datetime.datetime.strptime(start_str, '%Y-%m-%d').date()
			e_date = datetime.datetime.strptime(end_str, '%Y-%m-%d').date()
			start = timezone.make_aware(datetime.datetime.combine(s_date, datetime.time.min))
			end = timezone.make_aware(datetime.datetime.combine(e_date, datetime.time.max))
			return start, end, f"Từ {start.strftime('%d/%m/%Y')} đến {end.strftime('%d/%m/%Y')}"
		except Exception:
			pass
	# Mặc định tháng này
	start = today_start.replace(day=1)
	return start, today_end, f"Tháng này ({start.strftime('%d/%m')} - {today_end.strftime('%d/%m/%Y')})"


def _ensure_sample_ingredients_exist():
	"""Tự động thêm một số nguyên liệu mẫu phong phú nếu chưa có nhiều nguyên liệu."""
	if Ingredient.objects.filter(is_active=True).count() >= 8:
		return
	sample_data = [
		{'code': 'NL-THITBO', 'name': 'Thịt bò phi lê', 'group': 'Thịt & Hải sản', 'unit': 'Kg', 'current_stock': Decimal('15.5'), 'minimum_stock': Decimal('5.0'), 'average_cost': Decimal('240000'), 'supplier': 'Cty TNHH Thực phẩm Sạch'},
		{'code': 'NL-THITHEO', 'name': 'Thịt heo ba chỉ', 'group': 'Thịt & Hải sản', 'unit': 'Kg', 'current_stock': Decimal('22.0'), 'minimum_stock': Decimal('6.0'), 'average_cost': Decimal('125000'), 'supplier': 'Cty TNHH Thực phẩm Sạch'},
		{'code': 'NL-XUCSICH', 'name': 'Xúc xích Đức xông khói', 'group': 'Thịt & Hải sản', 'unit': 'Gói', 'current_stock': Decimal('35.0'), 'minimum_stock': Decimal('10.0'), 'average_cost': Decimal('48000'), 'supplier': 'Nhà phân phối CP'},
		{'code': 'NL-PHOMAI', 'name': 'Phô mai Mozzarella sợi', 'group': 'Bơ sữa & Phô mai', 'unit': 'Kg', 'current_stock': Decimal('12.0'), 'minimum_stock': Decimal('4.0'), 'average_cost': Decimal('180000'), 'supplier': 'Anchor Food'},
		{'code': 'NL-BOSUA', 'name': 'Bơ lạt thơm béo', 'group': 'Bơ sữa & Phô mai', 'unit': 'Hộp', 'current_stock': Decimal('18.0'), 'minimum_stock': Decimal('5.0'), 'average_cost': Decimal('65000'), 'supplier': 'Anchor Food'},
		{'code': 'NL-TRUNGGA', 'name': 'Trứng gà ta tươi', 'group': 'Trứng & Đồ khô', 'unit': 'Quả', 'current_stock': Decimal('150.0'), 'minimum_stock': Decimal('30.0'), 'average_cost': Decimal('3200'), 'supplier': 'Trang trại Ba Huân'},
		{'code': 'NL-BANHTRANG', 'name': 'Bánh tráng phơi sương', 'group': 'Trứng & Đồ khô', 'unit': 'Xấp', 'current_stock': Decimal('60.0'), 'minimum_stock': Decimal('15.0'), 'average_cost': Decimal('18000'), 'supplier': 'Cơ sở bánh tráng Tây Ninh'},
		{'code': 'NL-BAPCAI', 'name': 'Bắp cải tím Đà Lạt', 'group': 'Rau củ quả', 'unit': 'Kg', 'current_stock': Decimal('8.5'), 'minimum_stock': Decimal('3.0'), 'average_cost': Decimal('22000'), 'supplier': 'Vườn rau Đà Lạt'},
		{'code': 'NL-XALACH', 'name': 'Xà lách mỡ xoăn', 'group': 'Rau củ quả', 'unit': 'Kg', 'current_stock': Decimal('6.0'), 'minimum_stock': Decimal('4.0'), 'average_cost': Decimal('35000'), 'supplier': 'Vườn rau Đà Lạt'},
		{'code': 'NL-SOTMAYO', 'name': 'Sốt Mayonnaise Kewpie', 'group': 'Gia vị & Sốt', 'unit': 'Chai', 'current_stock': Decimal('14.0'), 'minimum_stock': Decimal('5.0'), 'average_cost': Decimal('55000'), 'supplier': 'Kewpie VN'},
		{'code': 'NL-TUONGOT', 'name': 'Tương ớt cay nồng Cholimex', 'group': 'Gia vị & Sốt', 'unit': 'Chai', 'current_stock': Decimal('20.0'), 'minimum_stock': Decimal('6.0'), 'average_cost': Decimal('16000'), 'supplier': 'Cholimex Food'},
		{'code': 'NL-DAUAN', 'name': 'Dầu ăn Neptune Gold (5L)', 'group': 'Gia vị & Sốt', 'unit': 'Can', 'current_stock': Decimal('7.0'), 'minimum_stock': Decimal('3.0'), 'average_cost': Decimal('245000'), 'supplier': 'Calofic VN'},
		{'code': 'NL-TRADAO', 'name': 'Cốt trà đào Cozy túi lọc', 'group': 'Đồ uống & Pha chế', 'unit': 'Hộp', 'current_stock': Decimal('25.0'), 'minimum_stock': Decimal('8.0'), 'average_cost': Decimal('32000'), 'supplier': 'Cozy Tea'},
		{'code': 'NL-COCA', 'name': 'Nước ngọt Coca-Cola lon 320ml', 'group': 'Đồ uống & Pha chế', 'unit': 'Thùng', 'current_stock': Decimal('16.0'), 'minimum_stock': Decimal('5.0'), 'average_cost': Decimal('198000'), 'supplier': 'Đại lý nước ngọt Kim Phát'},
	]
	for d in sample_data:
		Ingredient.objects.get_or_create(code=d['code'], defaults=d)


def _compute_xnt_report(start_date, end_date, group=None, query=None, low_stock_only=False):
	_ensure_sample_ingredients_exist()
	now = timezone.localtime()

	qs = Ingredient.objects.filter(is_active=True)
	if group:
		qs = qs.filter(group=group)
	if query:
		qs = qs.filter(Q(code__icontains=query) | Q(name__icontains=query) | Q(group__icontains=query))

	ingredients = list(qs.order_by('group', 'name'))
	if not ingredients:
		return [], {
			'total_inventory_value': 0,
			'total_inventory_value_formatted': '0 đ',
			'total_ingredients_count': 0,
			'low_stock_count': 0,
			'total_receipt_value': 0,
			'total_receipt_value_formatted': '0 đ',
			'total_sale_value': 0,
			'total_sale_value_formatted': '0 đ',
			'total_issue_value': 0,
			'total_issue_value_formatted': '0 đ',
		}

	ing_ids = [ing.id for ing in ingredients]
	all_txs = list(StockTransaction.objects.filter(ingredient_id__in=ing_ids).order_by('created_at'))

	# Phân loại giao dịch theo ingredient_id
	txs_in_period = {}
	txs_after_period = {}
	for tx in all_txs:
		i_id = tx.ingredient_id
		if start_date <= tx.created_at <= end_date:
			txs_in_period.setdefault(i_id, []).append(tx)
		elif tx.created_at > end_date:
			txs_after_period.setdefault(i_id, []).append(tx)

	report_rows = []
	total_inventory_val = Decimal(0)
	total_receipt_val = Decimal(0)
	total_sale_val = Decimal(0)
	total_issue_val = Decimal(0)
	low_stock_count = 0

	for ing in ingredients:
		i_id = ing.id
		cost = ing.average_cost

		# Tính closing_stock tại thời điểm end_date
		if end_date >= now:
			closing_stock = ing.current_stock
		else:
			# Trừ đi các biến động xảy ra sau end_date
			future_delta = Decimal(0)
			for ftx in txs_after_period.get(i_id, []):
				future_delta += ftx.quantity
			closing_stock = ing.current_stock - future_delta

		# Tính tổng biến động trong kỳ
		receipt_qty = Decimal(0)
		sale_qty = Decimal(0)
		issue_qty = Decimal(0)
		adjust_qty = Decimal(0)

		for tx in txs_in_period.get(i_id, []):
			ttype = tx.transaction_type
			qty = tx.quantity
			if ttype == StockTransaction.TransactionType.RECEIPT:
				receipt_qty += qty
			elif ttype == StockTransaction.TransactionType.SALE:
				sale_qty += abs(qty)
			elif ttype == StockTransaction.TransactionType.ISSUE:
				issue_qty += abs(qty)
			elif ttype in (StockTransaction.TransactionType.INCREASE, StockTransaction.TransactionType.DECREASE):
				adjust_qty += qty

		# opening_stock = closing_stock - (receipt_qty - sale_qty - issue_qty + adjust_qty)
		net_in_period = receipt_qty - sale_qty - issue_qty + adjust_qty
		opening_stock = closing_stock - net_in_period

		# Giá trị
		opening_val = opening_stock * cost
		receipt_val = receipt_qty * cost
		sale_val = sale_qty * cost
		issue_val = issue_qty * cost
		closing_val = closing_stock * cost

		is_low = closing_stock <= ing.minimum_stock
		if is_low:
			low_stock_count += 1

		if low_stock_only and not is_low:
			continue

		total_inventory_val += closing_val
		total_receipt_val += receipt_val
		total_sale_val += sale_val
		total_issue_val += issue_val

		report_rows.append({
			'id': ing.id,
			'code': ing.code,
			'name': ing.name,
			'group': ing.group or 'Khác',
			'unit': ing.unit,
			'average_cost': float(cost),
			'cost_formatted': f'{cost:,.0f}'.replace(',', '.'),
			'opening_stock': float(opening_stock),
			'opening_stock_formatted': f'{opening_stock:.2f}'.rstrip('0').rstrip('.') if '.' in f'{opening_stock:.2f}' else f'{opening_stock:.0f}',
			'opening_val': float(opening_val),
			'opening_val_formatted': f'{opening_val:,.0f}'.replace(',', '.'),
			'receipt_qty': float(receipt_qty),
			'receipt_qty_formatted': f'{receipt_qty:.2f}'.rstrip('0').rstrip('.') if '.' in f'{receipt_qty:.2f}' else f'{receipt_qty:.0f}',
			'receipt_val': float(receipt_val),
			'receipt_val_formatted': f'{receipt_val:,.0f}'.replace(',', '.'),
			'sale_qty': float(sale_qty),
			'sale_qty_formatted': f'{sale_qty:.2f}'.rstrip('0').rstrip('.') if '.' in f'{sale_qty:.2f}' else f'{sale_qty:.0f}',
			'sale_val': float(sale_val),
			'sale_val_formatted': f'{sale_val:,.0f}'.replace(',', '.'),
			'issue_qty': float(issue_qty),
			'issue_qty_formatted': f'{issue_qty:.2f}'.rstrip('0').rstrip('.') if '.' in f'{issue_qty:.2f}' else f'{issue_qty:.0f}',
			'issue_val': float(issue_val),
			'issue_val_formatted': f'{issue_val:,.0f}'.replace(',', '.'),
			'adjust_qty': float(adjust_qty),
			'adjust_qty_formatted': f'{adjust_qty:.2f}'.rstrip('0').rstrip('.') if '.' in f'{adjust_qty:.2f}' else f'{adjust_qty:.0f}',
			'closing_stock': float(closing_stock),
			'closing_stock_formatted': f'{closing_stock:.2f}'.rstrip('0').rstrip('.') if '.' in f'{closing_stock:.2f}' else f'{closing_stock:.0f}',
			'closing_val': float(closing_val),
			'closing_val_formatted': f'{closing_val:,.0f}'.replace(',', '.'),
			'minimum_stock': float(ing.minimum_stock),
			'minimum_stock_formatted': f'{ing.minimum_stock:.2f}'.rstrip('0').rstrip('.') if '.' in f'{ing.minimum_stock:.2f}' else f'{ing.minimum_stock:.0f}',
			'is_low_stock': is_low,
		})

	kpis = {
		'total_inventory_value': float(total_inventory_val),
		'total_inventory_value_formatted': f'{total_inventory_val:,.0f}'.replace(',', '.') + ' đ',
		'total_ingredients_count': len(ingredients),
		'low_stock_count': low_stock_count,
		'total_receipt_value': float(total_receipt_val),
		'total_receipt_value_formatted': f'{total_receipt_val:,.0f}'.replace(',', '.') + ' đ',
		'total_sale_value': float(total_sale_val),
		'total_sale_value_formatted': f'{total_sale_val:,.0f}'.replace(',', '.') + ' đ',
		'total_issue_value': float(total_issue_val),
		'total_issue_value_formatted': f'{total_issue_val:,.0f}'.replace(',', '.') + ' đ',
	}

	return report_rows, kpis


@login_required
@role_required('Owner', 'Manager', 'Warehouse', 'Sales', 'Cashier')
def inventory_home(request):
	"""Trang Quản lý Kho hàng & Xuất Nhập Tồn toàn diện (Standalone Page)."""
	_ensure_sample_ingredients_exist()
	groups = list(Ingredient.objects.filter(is_active=True).values_list('group', flat=True).distinct().order_by('group'))
	groups = [g for g in groups if g]
	return render(request, 'inventory/pages/home.html', {
		'groups': groups,
		'total_ingredients': Ingredient.objects.filter(is_active=True).count(),
	})


@login_required
def inventory_dashboard_api(request):
	"""API trả về dữ liệu Báo cáo Xuất Nhập Tồn + KPIs cho AJAX và Modal."""
	range_type = request.GET.get('range', 'this_month')
	start_str = request.GET.get('start_date')
	end_str = request.GET.get('end_date')
	group = request.GET.get('group', '').strip()
	query = request.GET.get('q', '').strip()
	low_stock_only = request.GET.get('low_stock_only') in ('1', 'true', 'True')

	start_date, end_date, range_label = _parse_filter_date_range(range_type, start_str, end_str)
	report_rows, kpis = _compute_xnt_report(start_date, end_date, group=group, query=query, low_stock_only=low_stock_only)

	groups = list(Ingredient.objects.filter(is_active=True).values_list('group', flat=True).distinct().order_by('group'))
	groups = [g for g in groups if g]

	# Danh sách tất cả nguyên liệu để tiện tạo phiếu nhập / xuất
	all_ingredients = [{
		'id': ing.id,
		'code': ing.code,
		'name': ing.name,
		'group': ing.group or '',
		'unit': ing.unit,
		'current_stock': float(ing.current_stock),
		'current_stock_formatted': f'{ing.current_stock:.2f}'.rstrip('0').rstrip('.') if '.' in f'{ing.current_stock:.2f}' else f'{ing.current_stock:.0f}',
		'minimum_stock': float(ing.minimum_stock),
		'average_cost': float(ing.average_cost),
		'cost_formatted': f'{ing.average_cost:,.0f}'.replace(',', '.'),
		'supplier': ing.supplier or '',
	} for ing in Ingredient.objects.filter(is_active=True).order_by('group', 'name')]

	return JsonResponse({
		'ok': True,
		'range_label': range_label,
		'start_date_str': start_date.strftime('%Y-%m-%d'),
		'end_date_str': end_date.strftime('%Y-%m-%d'),
		'kpis': kpis,
		'report_rows': report_rows,
		'groups': groups,
		'ingredients': all_ingredients,
	})


@login_required
def stock_receipts_api(request):
	"""API Quản lý Phiếu Nhập Kho (Danh sách, Chi tiết, Tạo mới)."""
	if request.method == 'GET':
		receipt_id = request.GET.get('receipt_id')
		if receipt_id and receipt_id.isdigit():
			receipt = get_object_or_404(StockReceipt.objects.select_related('created_by'), pk=int(receipt_id))
			items = []
			for it in receipt.items.select_related('ingredient'):
				items.append({
					'item_id': it.id,
					'ingredient_id': it.ingredient_id,
					'ingredient_code': it.ingredient.code,
					'ingredient_name': it.ingredient.name,
					'unit': it.ingredient.unit,
					'quantity': float(it.quantity),
					'quantity_formatted': f'{it.quantity:.2f}'.rstrip('0').rstrip('.') if '.' in f'{it.quantity:.2f}' else f'{it.quantity:.0f}',
					'unit_cost': float(it.unit_cost),
					'unit_cost_formatted': f'{it.unit_cost:,.0f}'.replace(',', '.'),
					'total_cost': float(it.total_cost),
					'total_cost_formatted': f'{it.total_cost:,.0f}'.replace(',', '.'),
				})
			return JsonResponse({
				'ok': True,
				'receipt': {
					'id': receipt.id,
					'receipt_code': receipt.receipt_code,
					'supplier': receipt.supplier or 'Nhà cung cấp lẻ',
					'total_amount': float(receipt.total_amount),
					'total_amount_formatted': f'{receipt.total_amount:,.0f}'.replace(',', '.') + ' đ',
					'note': receipt.note or '',
					'status': receipt.status,
					'status_display': receipt.get_status_display(),
					'created_by': receipt.created_by.get_full_name() or receipt.created_by.username,
					'created_at_formatted': timezone.localtime(receipt.created_at).strftime('%d/%m/%Y %H:%M'),
					'items': items,
					'items_count': len(items),
				}
			})

		# Danh sách phiếu nhập
		receipts_qs = StockReceipt.objects.select_related('created_by').prefetch_related('items').order_by('-created_at')[:80]
		data = []
		for r in receipts_qs:
			data.append({
				'id': r.id,
				'receipt_code': r.receipt_code,
				'supplier': r.supplier or 'Nhà cung cấp lẻ',
				'total_amount': float(r.total_amount),
				'total_amount_formatted': f'{r.total_amount:,.0f}'.replace(',', '.') + ' đ',
				'items_count': r.items.count(),
				'status': r.status,
				'status_display': r.get_status_display(),
				'created_by': r.created_by.get_full_name() or r.created_by.username,
				'created_at_formatted': timezone.localtime(r.created_at).strftime('%d/%m/%Y %H:%M'),
				'note': r.note or '',
			})
		return JsonResponse({'ok': True, 'receipts': data})

	elif request.method == 'POST':
		try:
			payload = json.loads(request.body) if request.content_type == 'application/json' else request.POST
		except Exception:
			payload = request.POST

		supplier = payload.get('supplier', '').strip()
		note = payload.get('note', '').strip()
		items = payload.get('items', [])

		if isinstance(items, str):
			try:
				items = json.loads(items)
			except Exception:
				items = []

		if not items:
			return JsonResponse({'ok': False, 'error': 'Vui lòng chọn ít nhất một nguyên liệu nhập kho.'}, status=400)

		try:
			receipt = create_and_confirm_receipt(
				user=request.user,
				supplier=supplier,
				note=note,
				items_data=items,
				request=request,
			)
			return JsonResponse({
				'ok': True,
				'message': f'Đã lập và xác nhận phiếu nhập kho số {receipt.receipt_code} thành công!',
				'receipt_id': receipt.id,
				'receipt_code': receipt.receipt_code,
			})
		except ValidationError as e:
			return JsonResponse({'ok': False, 'error': str(e.message if hasattr(e, 'message') else e)}, status=400)
		except Exception as e:
			return JsonResponse({'ok': False, 'error': f'Lỗi khi nhập kho: {str(e)}'}, status=500)

	return JsonResponse({'error': 'Method not allowed'}, status=405)


@login_required
def stock_issues_api(request):
	"""API Quản lý Phiếu Xuất Kho (Danh sách, Chi tiết, Tạo mới)."""
	if request.method == 'GET':
		issue_id = request.GET.get('issue_id')
		if issue_id and issue_id.isdigit():
			issue = get_object_or_404(StockIssue.objects.select_related('created_by'), pk=int(issue_id))
			items = []
			for it in issue.items.select_related('ingredient'):
				items.append({
					'item_id': it.id,
					'ingredient_id': it.ingredient_id,
					'ingredient_code': it.ingredient.code,
					'ingredient_name': it.ingredient.name,
					'unit': it.ingredient.unit,
					'quantity': float(it.quantity),
					'quantity_formatted': f'{it.quantity:.2f}'.rstrip('0').rstrip('.') if '.' in f'{it.quantity:.2f}' else f'{it.quantity:.0f}',
					'unit_cost': float(it.unit_cost),
					'unit_cost_formatted': f'{it.unit_cost:,.0f}'.replace(',', '.'),
					'total_cost': float(it.total_cost),
					'total_cost_formatted': f'{it.total_cost:,.0f}'.replace(',', '.'),
				})
			return JsonResponse({
				'ok': True,
				'issue': {
					'id': issue.id,
					'issue_code': issue.issue_code,
					'issue_type': issue.issue_type,
					'issue_type_display': issue.get_issue_type_display(),
					'receiver': issue.receiver or '-',
					'total_amount': float(issue.total_amount),
					'total_amount_formatted': f'{issue.total_amount:,.0f}'.replace(',', '.') + ' đ',
					'note': issue.note or '',
					'status': issue.status,
					'status_display': issue.get_status_display(),
					'created_by': issue.created_by.get_full_name() or issue.created_by.username,
					'created_at_formatted': timezone.localtime(issue.created_at).strftime('%d/%m/%Y %H:%M'),
					'items': items,
					'items_count': len(items),
				}
			})

		# Danh sách phiếu xuất
		issues_qs = StockIssue.objects.select_related('created_by').prefetch_related('items').order_by('-created_at')[:80]
		data = []
		for issue in issues_qs:
			data.append({
				'id': issue.id,
				'issue_code': issue.issue_code,
				'issue_type': issue.issue_type,
				'issue_type_display': issue.get_issue_type_display(),
				'receiver': issue.receiver or '-',
				'total_amount': float(issue.total_amount),
				'total_amount_formatted': f'{issue.total_amount:,.0f}'.replace(',', '.') + ' đ',
				'items_count': issue.items.count(),
				'status': issue.status,
				'status_display': issue.get_status_display(),
				'created_by': issue.created_by.get_full_name() or issue.created_by.username,
				'created_at_formatted': timezone.localtime(issue.created_at).strftime('%d/%m/%Y %H:%M'),
				'note': issue.note or '',
			})
		return JsonResponse({'ok': True, 'issues': data})

	elif request.method == 'POST':
		try:
			payload = json.loads(request.body) if request.content_type == 'application/json' else request.POST
		except Exception:
			payload = request.POST

		issue_type = payload.get('issue_type', StockIssue.IssueType.MANUAL).strip()
		receiver = payload.get('receiver', '').strip()
		note = payload.get('note', '').strip()
		items = payload.get('items', [])

		if isinstance(items, str):
			try:
				items = json.loads(items)
			except Exception:
				items = []

		if not items:
			return JsonResponse({'ok': False, 'error': 'Vui lòng chọn ít nhất một nguyên liệu để xuất kho.'}, status=400)

		try:
			issue = create_and_confirm_issue(
				user=request.user,
				issue_type=issue_type,
				receiver=receiver,
				note=note,
				items_data=items,
				request=request,
			)
			return JsonResponse({
				'ok': True,
				'message': f'Đã lập và xác nhận phiếu xuất kho số {issue.issue_code} thành công!',
				'issue_id': issue.id,
				'issue_code': issue.issue_code,
			})
		except ValidationError as e:
			return JsonResponse({'ok': False, 'error': str(e.message if hasattr(e, 'message') else e)}, status=400)
		except Exception as e:
			return JsonResponse({'ok': False, 'error': f'Lỗi khi xuất kho: {str(e)}'}, status=500)

	return JsonResponse({'error': 'Method not allowed'}, status=405)


@login_required
def stock_adjustments_api(request):
	"""API Kiểm kê kho & Cân đối điều chỉnh tồn."""
	if request.method == 'GET':
		adjustments_qs = StockAdjustment.objects.select_related('created_by').prefetch_related('items__ingredient').order_by('-created_at')[:50]
		data = []
		for adj in adjustments_qs:
			items = []
			for it in adj.items.all():
				items.append({
					'ingredient_name': it.ingredient.name,
					'unit': it.ingredient.unit,
					'system_stock': float(it.system_stock),
					'actual_stock': float(it.actual_stock),
					'diff_quantity': float(it.diff_quantity),
					'diff_amount': float(it.diff_amount),
					'diff_amount_formatted': f'{it.diff_amount:,.0f}'.replace(',', '.'),
				})
			data.append({
				'id': adj.id,
				'adjustment_code': adj.adjustment_code,
				'note': adj.note or '',
				'total_diff_amount': float(adj.total_diff_amount),
				'total_diff_amount_formatted': f'{adj.total_diff_amount:,.0f}'.replace(',', '.') + ' đ',
				'items_count': len(items),
				'items': items,
				'created_by': adj.created_by.get_full_name() or adj.created_by.username,
				'created_at_formatted': timezone.localtime(adj.created_at).strftime('%d/%m/%Y %H:%M'),
			})
		return JsonResponse({'ok': True, 'adjustments': data})

	elif request.method == 'POST':
		try:
			payload = json.loads(request.body) if request.content_type == 'application/json' else request.POST
		except Exception:
			payload = request.POST

		note = payload.get('note', '').strip()
		items = payload.get('items', [])

		if isinstance(items, str):
			try:
				items = json.loads(items)
			except Exception:
				items = []

		if not items:
			return JsonResponse({'ok': False, 'error': 'Vui lòng nhập số liệu kiểm kê thực tế.'}, status=400)

		try:
			adj = create_and_confirm_adjustment(
				user=request.user,
				note=note,
				items_data=items,
				request=request,
			)
			return JsonResponse({
				'ok': True,
				'message': f'Đã cân đối và cập nhật tồn kho theo phiếu kiểm kê số {adj.adjustment_code} thành công!',
				'adjustment_id': adj.id,
				'adjustment_code': adj.adjustment_code,
			})
		except ValidationError as e:
			return JsonResponse({'ok': False, 'error': str(e.message if hasattr(e, 'message') else e)}, status=400)
		except Exception as e:
			return JsonResponse({'ok': False, 'error': f'Lỗi khi cân đối kho: {str(e)}'}, status=500)

	return JsonResponse({'error': 'Method not allowed'}, status=405)


@login_required
def stock_ledger_api(request):
	"""API Sổ chi tiết thẻ kho (Lịch sử biến động xuất / nhập / bán / điều chỉnh)."""
	ingredient_id = request.GET.get('ingredient_id')
	tx_type = request.GET.get('type')
	range_type = request.GET.get('range', 'this_month')
	start_str = request.GET.get('start_date')
	end_str = request.GET.get('end_date')

	start_date, end_date, _ = _parse_filter_date_range(range_type, start_str, end_str)

	qs = StockTransaction.objects.select_related('ingredient', 'created_by').filter(
		created_at__gte=start_date,
		created_at__lte=end_date,
	)

	if ingredient_id and ingredient_id.isdigit():
		qs = qs.filter(ingredient_id=int(ingredient_id))
	if tx_type:
		qs = qs.filter(transaction_type=tx_type)

	txs = qs.order_by('-created_at')[:200]
	data = []
	for tx in txs:
		qty_fmt = f'{tx.quantity:+.2f}'.rstrip('0').rstrip('.') if '.' in f'{tx.quantity:.2f}' else f'{tx.quantity:+.0f}'
		bal_fmt = f'{tx.balance_after:.2f}'.rstrip('0').rstrip('.') if '.' in f'{tx.balance_after:.2f}' else f'{tx.balance_after:.0f}'
		data.append({
			'id': tx.id,
			'ingredient_id': tx.ingredient_id,
			'ingredient_code': tx.ingredient.code,
			'ingredient_name': tx.ingredient.name,
			'unit': tx.ingredient.unit,
			'transaction_type': tx.transaction_type,
			'transaction_type_display': tx.get_transaction_type_display(),
			'quantity': float(tx.quantity),
			'quantity_formatted': qty_fmt,
			'unit_cost': float(tx.unit_cost),
			'unit_cost_formatted': f'{tx.unit_cost:,.0f}'.replace(',', '.'),
			'balance_after': float(tx.balance_after),
			'balance_after_formatted': bal_fmt,
			'reference_type': tx.reference_type or '',
			'reference_id': tx.reference_id,
			'note': tx.note or '',
			'created_by': tx.created_by.get_full_name() or tx.created_by.username,
			'created_at_formatted': timezone.localtime(tx.created_at).strftime('%d/%m/%Y %H:%M'),
		})

	return JsonResponse({'ok': True, 'transactions': data})


@login_required
def stock_export_excel(request):
	"""Xuất Báo cáo Xuất - Nhập - Tồn ra file Excel CSV UTF-8 với BOM."""
	range_type = request.GET.get('range', 'this_month')
	start_str = request.GET.get('start_date')
	end_str = request.GET.get('end_date')
	group = request.GET.get('group', '').strip()
	query = request.GET.get('q', '').strip()
	low_stock_only = request.GET.get('low_stock_only') in ('1', 'true', 'True')

	start_date, end_date, range_label = _parse_filter_date_range(range_type, start_str, end_str)
	report_rows, kpis = _compute_xnt_report(start_date, end_date, group=group, query=query, low_stock_only=low_stock_only)

	response = HttpResponse(content_type='text/csv; charset=utf-8')
	response['Content-Disposition'] = f'attachment; filename="Bao_cao_Xuat_Nhap_Ton_{start_date.strftime("%Y%m%d")}_{end_date.strftime("%Y%m%d")}.csv"'
	response.write('\ufeff')

	writer = csv.writer(response)
	writer.writerow(['MIXFOOD POS - BÁO CÁO XUẤT NHẬP TỒN KHO'])
	writer.writerow([f'Khoảng thời gian: {range_label}'])
	writer.writerow([f'Tổng giá trị tồn kho: {kpis["total_inventory_value_formatted"]}', f'Tổng số mặt hàng: {kpis["total_ingredients_count"]}', f'Cảnh báo tồn thấp: {kpis["low_stock_count"]}'])
	writer.writerow([])

	writer.writerow([
		'Mã hàng', 'Tên nguyên liệu / mặt hàng', 'Nhóm', 'ĐVT', 'Đơn giá vốn (đ)',
		'Tồn đầu kỳ', 'Giá trị đầu kỳ (đ)',
		'Nhập trong kỳ', 'Giá trị nhập (đ)',
		'Xuất bán hàng', 'Giá trị xuất bán (đ)',
		'Xuất khác/hủy', 'Giá trị xuất khác (đ)',
		'Điều chỉnh (+/-)',
		'Tồn cuối kỳ', 'Giá trị tồn cuối (đ)',
		'Tồn tối thiểu', 'Trạng thái'
	])

	for r in report_rows:
		status_str = 'CẢNH BÁO TỒN THẤP' if r['is_low_stock'] else 'Bình thường'
		writer.writerow([
			r['code'], r['name'], r['group'], r['unit'], int(r['average_cost']),
			r['opening_stock_formatted'], int(r['opening_val']),
			r['receipt_qty_formatted'], int(r['receipt_val']),
			r['sale_qty_formatted'], int(r['sale_val']),
			r['issue_qty_formatted'], int(r['issue_val']),
			r['adjust_qty_formatted'],
			r['closing_stock_formatted'], int(r['closing_val']),
			r['minimum_stock_formatted'], status_str
		])

	return response


# ==============================================================================
# CÔNG THỨC MÓN / RECIPES (BOM) - GIỮ NGUYÊN 100%
# ==============================================================================

@login_required
def recipe_list(request):
	"""Trang Quản lý Định lượng nguyên liệu (Recipes / BOM)."""
	categories = Category.objects.filter(is_active=True).order_by('display_order', 'name')
	products = Product.objects.filter(is_active=True).select_related('category', 'recipe').prefetch_related('recipe__items__ingredient').order_by('category__display_order', 'name')
	ingredients = Ingredient.objects.filter(is_active=True).order_by('group', 'name')

	return render(request, 'inventory/pages/recipes.html', {
		'categories': categories,
		'products': products,
		'ingredients': ingredients,
		'total_products': products.count(),
	})


@login_required
def recipe_data_api(request):
	"""API trả về danh sách món và chi tiết định lượng cho Modal POS và AJAX."""
	product_id = request.GET.get('product_id')
	category_id = request.GET.get('category_id')
	query = request.GET.get('q', '').strip()

	categories = Category.objects.filter(is_active=True).order_by('display_order', 'name')
	products_qs = Product.objects.filter(is_active=True).select_related('category', 'recipe').prefetch_related('recipe__items__ingredient')

	if category_id and category_id.isdigit():
		products_qs = products_qs.filter(category_id=int(category_id))
	if query:
		products_qs = products_qs.filter(Q(code__icontains=query) | Q(name__icontains=query))

	products_qs = products_qs.order_by('category__display_order', 'name')

	products_data = []
	for p in products_qs:
		recipe = getattr(p, 'recipe', None)
		has_recipe = recipe is not None and recipe.is_active and recipe.items.exists()
		items_count = recipe.items.count() if (recipe and recipe.is_active) else 0

		price = float(p.price)
		cost = float(p.cost_price)
		profit = price - cost
		margin_pct = round((profit / price * 100), 1) if price > 0 else 0

		products_data.append({
			'id': p.id,
			'code': p.code,
			'name': p.name,
			'category_id': p.category_id,
			'category_name': p.category.name,
			'unit': p.unit,
			'price': price,
			'price_formatted': f'{p.price:,.0f}'.replace(',', '.'),
			'cost_price': cost,
			'cost_price_formatted': f'{p.cost_price:,.0f}'.replace(',', '.'),
			'profit': profit,
			'profit_formatted': f'{profit:,.0f}'.replace(',', '.'),
			'margin_pct': margin_pct,
			'has_recipe': has_recipe,
			'items_count': items_count,
		})

	selected_recipe_data = None
	if product_id and product_id.isdigit():
		selected_product = Product.objects.filter(pk=int(product_id), is_active=True).select_related('recipe', 'category').first()
		if selected_product:
			recipe, _ = Recipe.objects.get_or_create(
				product=selected_product,
				defaults={'is_active': True, 'description': f'Công thức món {selected_product.name}'}
			)
			items_qs = recipe.items.select_related('ingredient').filter(ingredient__is_active=True).order_by('ingredient__group', 'ingredient__name')

			items_list = []
			total_cost = Decimal(0)
			for it in items_qs:
				line_cost = it.quantity * it.ingredient.average_cost
				total_cost += line_cost
				items_list.append({
					'item_id': it.id,
					'ingredient_id': it.ingredient_id,
					'ingredient_code': it.ingredient.code,
					'ingredient_name': it.ingredient.name,
					'ingredient_group': it.ingredient.group or '',
					'quantity': float(it.quantity),
					'quantity_formatted': f'{it.quantity:.3f}'.rstrip('0').rstrip('.') if '.' in f'{it.quantity}' else f'{it.quantity}',
					'unit': it.unit,
					'unit_cost': float(it.ingredient.average_cost),
					'unit_cost_formatted': f'{it.ingredient.average_cost:,.0f}'.replace(',', '.'),
					'total_cost': float(line_cost),
					'total_cost_formatted': f'{line_cost:,.0f}'.replace(',', '.'),
				})

			if selected_product.cost_price != total_cost:
				selected_product.cost_price = total_cost
				selected_product.save(update_fields=('cost_price', 'updated_at'))

			price = float(selected_product.price)
			cost = float(total_cost)
			profit = price - cost
			margin_pct = round((profit / price * 100), 1) if price > 0 else 0

			selected_recipe_data = {
				'product_id': selected_product.id,
				'product_code': selected_product.code,
				'product_name': selected_product.name,
				'product_unit': selected_product.unit,
				'category_name': selected_product.category.name,
				'price': price,
				'price_formatted': f'{selected_product.price:,.0f}'.replace(',', '.'),
				'total_cost': cost,
				'total_cost_formatted': f'{cost:,.0f}'.replace(',', '.'),
				'profit': profit,
				'profit_formatted': f'{profit:,.0f}'.replace(',', '.'),
				'margin_pct': margin_pct,
				'description': recipe.description,
				'items': items_list,
			}

	ingredients_qs = Ingredient.objects.filter(is_active=True).order_by('group', 'name')
	ingredients_data = [{
		'id': ing.id,
		'group': ing.group or '',
		'code': ing.code,
		'name': ing.name,
		'unit': ing.unit,
		'average_cost': float(ing.average_cost),
		'cost_formatted': f'{ing.average_cost:,.0f}'.replace(',', '.'),
		'current_stock_formatted': f'{ing.current_stock:.3f}',
	} for ing in ingredients_qs]

	categories_data = [{
		'id': c.id,
		'name': c.name,
	} for c in categories]

	return JsonResponse({
		'products': products_data,
		'selected_recipe': selected_recipe_data,
		'ingredients': ingredients_data,
		'categories': categories_data,
		'total_products': len(products_data),
	})


@login_required
def recipe_save_item_api(request):
	"""Thêm hoặc sửa nguyên liệu trong công thức của món."""
	if request.method != 'POST':
		return JsonResponse({'error': 'Phương thức không hợp lệ.'}, status=405)

	try:
		data = json.loads(request.body) if request.content_type == 'application/json' else request.POST
	except Exception:
		data = request.POST

	product_id = data.get('product_id')
	ingredient_id = data.get('ingredient_id')
	quantity_raw = str(data.get('quantity', 0)).replace(',', '.')
	unit = data.get('unit', '').strip()

	if not product_id or not str(product_id).isdigit():
		return JsonResponse({'error': 'Vui lòng chọn món ăn.'}, status=400)
	if not ingredient_id or not str(ingredient_id).isdigit():
		return JsonResponse({'error': 'Vui lòng chọn nguyên liệu.'}, status=400)

	try:
		quantity = Decimal(quantity_raw)
		if quantity <= 0:
			return JsonResponse({'error': 'Định lượng phải lớn hơn 0.'}, status=400)
	except Exception:
		return JsonResponse({'error': 'Định lượng không hợp lệ.'}, status=400)

	product = get_object_or_404(Product, pk=int(product_id))
	ingredient = get_object_or_404(Ingredient, pk=int(ingredient_id))

	if not unit:
		unit = ingredient.unit

	recipe, _ = Recipe.objects.get_or_create(
		product=product,
		defaults={'is_active': True, 'description': f'Công thức cho {product.name}'}
	)
	recipe.is_active = True
	recipe.save(update_fields=('is_active', 'updated_at'))

	recipe_item, created = RecipeItem.objects.update_or_create(
		recipe=recipe,
		ingredient=ingredient,
		defaults={'quantity': quantity, 'unit': unit}
	)

	new_cost = update_product_cost_from_recipe(product)

	return JsonResponse({
		'success': True,
		'message': f'Đã cập nhật nguyên liệu "{ingredient.name}" vào công thức.',
		'item': {
			'item_id': recipe_item.id,
			'ingredient_id': ingredient.id,
			'ingredient_code': ingredient.code,
			'ingredient_name': ingredient.name,
			'quantity': float(recipe_item.quantity),
			'unit': recipe_item.unit,
			'unit_cost': float(ingredient.average_cost),
			'unit_cost_formatted': f'{ingredient.average_cost:,.0f}'.replace(',', '.'),
			'total_cost': float(recipe_item.quantity * ingredient.average_cost),
			'total_cost_formatted': f'{(recipe_item.quantity * ingredient.average_cost):,.0f}'.replace(',', '.'),
		},
		'new_cost_price': float(new_cost),
		'new_cost_price_formatted': f'{new_cost:,.0f}'.replace(',', '.'),
	})


@login_required
def recipe_delete_item_api(request, pk):
	"""Xóa 1 nguyên liệu khỏi công thức."""
	if request.method != 'POST':
		return JsonResponse({'error': 'Phương thức không hợp lệ.'}, status=405)

	recipe_item = get_object_or_404(RecipeItem, pk=pk)
	product = recipe_item.recipe.product
	ing_name = recipe_item.ingredient.name

	recipe_item.delete()

	new_cost = update_product_cost_from_recipe(product)

	return JsonResponse({
		'success': True,
		'message': f'Đã xóa nguyên liệu "{ing_name}" khỏi công thức.',
		'new_cost_price': float(new_cost),
		'new_cost_price_formatted': f'{new_cost:,.0f}'.replace(',', '.'),
	})


@login_required
def recipe_delete_recipe_api(request, product_id):
	"""Xóa toàn bộ công thức định lượng của món ăn."""
	if request.method != 'POST':
		return JsonResponse({'error': 'Phương thức không hợp lệ.'}, status=405)

	product = get_object_or_404(Product, pk=product_id)
	recipe = getattr(product, 'recipe', None)
	if recipe:
		recipe.items.all().delete()
		recipe.is_active = False
		recipe.save(update_fields=('is_active', 'updated_at'))

	product.cost_price = Decimal(0)
	product.save(update_fields=('cost_price', 'updated_at'))

	return JsonResponse({
		'success': True,
		'message': f'Đã xóa công thức định lượng của món "{product.name}".',
	})


@login_required
def recipe_export_excel(request):
	"""Xuất danh sách công thức định lượng ra file Excel CSV UTF-8 với BOM."""
	response = HttpResponse(content_type='text/csv; charset=utf-8')
	response['Content-Disposition'] = 'attachment; filename="dinh_luong_nguyen_lieu_mixfood.csv"'
	response.write('\ufeff')

	writer = csv.writer(response)
	writer.writerow([
		'Mã món', 'Tên món', 'Danh mục', 'ĐVT món', 'Đơn giá bán (đ)',
		'Giá vốn món (đ)', 'Mã nguyên liệu', 'Tên nguyên liệu', 'Định lượng',
		'ĐVT nguyên liệu', 'Đơn giá vốn NL (đ)', 'Thành tiền vốn NL (đ)'
	])

	recipes = Recipe.objects.filter(is_active=True).select_related('product__category').prefetch_related('items__ingredient').order_by('product__category__display_order', 'product__name')

	for r in recipes:
		p = r.product
		items = list(r.items.select_related('ingredient').all())
		if not items:
			writer.writerow([
				p.code, p.name, p.category.name, p.unit, int(p.price),
				int(p.cost_price), '', '', '', '', '', ''
			])
		else:
			for item in items:
				ing = item.ingredient
				line_cost = item.quantity * ing.average_cost
				writer.writerow([
					p.code, p.name, p.category.name, p.unit, int(p.price),
					int(p.cost_price), ing.code, ing.name, f'{item.quantity:.3f}',
					item.unit, int(ing.average_cost), int(line_cost)
				])

	return response


@login_required
def recipe_import_excel(request):
	"""Nhập công thức định lượng từ file Excel CSV hoặc nội dung dán."""
	if request.method != 'POST':
		return JsonResponse({'error': 'Phương thức không hợp lệ.'}, status=405)

	csv_file = request.FILES.get('file')
	csv_text = request.POST.get('csv_text', '').strip()

	lines = []
	if csv_file:
		content = csv_file.read().decode('utf-8-sig', errors='ignore')
		lines = content.splitlines()
	elif csv_text:
		lines = csv_text.splitlines()
	else:
		return JsonResponse({'error': 'Vui lòng tải lên file CSV hoặc dán dữ liệu công thức.'}, status=400)

	if not lines:
		return JsonResponse({'error': 'Dữ liệu nhập rỗng.'}, status=400)

	sample = lines[0]
	delimiter = '\t' if '\t' in sample else (',' if ',' in sample else ';')
	reader = csv.reader(lines, delimiter=delimiter)

	imported_count = 0
	header_skipped = False
	affected_products = set()

	for row in reader:
		if not row or not any(row):
			continue
		row_str = ''.join(row)
		if not header_skipped and ('Mã món' in row_str or 'Tên món' in row_str or 'Nguyên liệu' in row_str or 'Định lượng' in row_str):
			header_skipped = True
			continue

		product = None
		ingredient = None
		quantity_val = Decimal(0)
		unit_val = ''

		if len(row) >= 10:
			prod_code = row[0].strip()
			prod_name = row[1].strip()
			ing_code = row[6].strip()
			ing_name = row[7].strip()
			qty_raw = row[8].strip().replace(',', '.')
			unit_val = row[9].strip()

			product = Product.objects.filter(code=prod_code).first() or Product.objects.filter(name__iexact=prod_name).first()
			ingredient = Ingredient.objects.filter(code=ing_code).first() or Ingredient.objects.filter(name__iexact=ing_name).first()
			try:
				quantity_val = Decimal(qty_raw or 0)
			except Exception:
				quantity_val = Decimal(0)

		elif len(row) >= 3:
			prod_key = row[0].strip()
			ing_key = row[1].strip()
			qty_raw = row[2].strip().replace(',', '.')
			unit_val = row[3].strip() if len(row) > 3 else ''

			product = Product.objects.filter(Q(code=prod_key) | Q(name__iexact=prod_key)).first()
			ingredient = Ingredient.objects.filter(Q(code=ing_key) | Q(name__iexact=ing_key)).first()
			try:
				quantity_val = Decimal(qty_raw or 0)
			except Exception:
				quantity_val = Decimal(0)

		if product and ingredient and quantity_val > 0:
			recipe, _ = Recipe.objects.get_or_create(
				product=product,
				defaults={'is_active': True, 'description': f'Công thức cho {product.name}'}
			)
			recipe.is_active = True
			recipe.save()

			if not unit_val:
				unit_val = ingredient.unit

			RecipeItem.objects.update_or_create(
				recipe=recipe,
				ingredient=ingredient,
				defaults={'quantity': quantity_val, 'unit': unit_val}
			)
			affected_products.add(product)
			imported_count += 1

	for p in affected_products:
		update_product_cost_from_recipe(p)

	return JsonResponse({
		'success': True,
		'imported_count': imported_count,
		'affected_dishes_count': len(affected_products),
		'message': f'Đã nhập thành công {imported_count} định lượng cho {len(affected_products)} món ăn.'
	})
