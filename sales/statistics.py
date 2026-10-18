import csv
from decimal import Decimal
from datetime import datetime, time
from django.utils import timezone
from django.db.models import Sum, Count, Q
from django.http import HttpResponse

from sales.models import Invoice, Order, OrderItem, Payment
from catalog.models import Product, Category
from dining.models import DiningTable, Area


def parse_datetime_param(val_str, is_end_of_day=False):
	"""
	Parses datetime strings in multiple common formats:
	- DD/MM/YYYY HH:mm
	- DD/MM/YYYY HH:mm:ss
	- DD/MM/YYYY
	- YYYY-MM-DDTHH:mm
	- YYYY-MM-DD HH:mm
	- YYYY-MM-DD
	Returns timezone-aware datetime.
	"""
	if not val_str or not str(val_str).strip():
		now = timezone.localtime()
		if is_end_of_day:
			return timezone.make_aware(datetime.combine(now.date(), time(23, 59, 59)))
		else:
			return timezone.make_aware(datetime.combine(now.date(), time(0, 0, 0)))

	val = str(val_str).strip()
	formats = [
		'%d/%m/%Y %H:%M:%S',
		'%d/%m/%Y %H:%M',
		'%d/%m/%Y',
		'%Y-%m-%d %H:%M:%S',
		'%Y-%m-%d %H:%M',
		'%Y-%m-%dT%H:%M:%S',
		'%Y-%m-%dT%H:%M',
		'%Y-%m-%d',
	]

	for fmt in formats:
		try:
			dt = datetime.strptime(val, fmt)
			if fmt in ('%d/%m/%Y', '%Y-%m-%d'):
				target_time = time(23, 59, 59) if is_end_of_day else time(0, 0, 0)
				dt = datetime.combine(dt.date(), target_time)
			if timezone.is_naive(dt):
				return timezone.make_aware(dt, timezone.get_current_timezone())
			return dt
		except ValueError:
			continue

	now = timezone.localtime()
	default_time = time(23, 59, 59) if is_end_of_day else time(0, 0, 0)
	return timezone.make_aware(datetime.combine(now.date(), default_time))


def format_vnd(amount):
	"""Định dạng số tiền VND: 1.234.567 đ"""
	val = int(round(Decimal(str(amount or 0))))
	return f"{val:,.0f}".replace(',', '.') + ' đ'


def format_num(val):
	"""Định dạng số nguyên: 1.234"""
	v = int(round(Decimal(str(val or 0))))
	return f"{v:,.0f}".replace(',', '.')


def get_sales_statistics_data(start_dt, end_dt):
	"""
	Tính toán toàn bộ số liệu thống kê bán hàng theo chuẩn DRS POS:
	1. Nhân viên (Số h/đơn, Doanh thu)
	2. Kiểu thanh toán (Số h/đơn, Doanh thu)
	3. Khu vực (Số h/đơn, Doanh thu)
	4. Điểm bàn (Số h/đơn, Doanh thu)
	5. Danh sách món đã bán (Mã/Dấu, Tên món, ĐVT, SL, Số giảm, Tiền giảm, Doanh thu, Giá vốn)
	6. Nhóm món (Doanh thu)
	7. Loại món (Doanh thu)
	8. Tổng hợp DTT, Giảm giá, Giá vốn (GVH), Lợi nhuận gộp
	"""
	if start_dt > end_dt:
		start_dt, end_dt = end_dt, start_dt

	invoices = Invoice.objects.filter(
		status=Invoice.Status.PAID,
		paid_at__gte=start_dt,
		paid_at__lte=end_dt
	).select_related(
		'order', 'cashier', 'order__table', 'order__table__area'
	).prefetch_related(
		'order__items__product__category',
		'payments'
	)

	total_invoices = invoices.count()
	total_subtotal = Decimal(0)
	total_discount = Decimal(0)
	discount_invoice_count = 0
	net_revenue = Decimal(0)

	cashier_map = {}
	area_map = {}
	table_map = {}
	payment_map = {
		'card': {'code': 'card', 'name': 'Thẻ ngân hàng', 'count': 0, 'revenue': Decimal(0)},
		'cash': {'code': 'cash', 'name': 'Tiền mặt', 'count': 0, 'revenue': Decimal(0)},
		'e_wallet': {'code': 'e_wallet', 'name': 'Ví điện tử', 'count': 0, 'revenue': Decimal(0)},
		'prepaid': {'code': 'prepaid', 'name': 'Thẻ trả trước', 'count': 0, 'revenue': Decimal(0)},
		'points': {'code': 'points', 'name': 'Thẻ tích điểm', 'count': 0, 'revenue': Decimal(0)},
		'system': {'code': 'system', 'name': 'Hệ thống khác', 'count': 0, 'revenue': Decimal(0)},
		'customer_debt': {'code': 'customer_debt', 'name': 'Nợ khách', 'count': 0, 'revenue': Decimal(0)},
		'debt': {'code': 'debt', 'name': 'Ghi nợ', 'count': 0, 'revenue': Decimal(0)},
		'topup': {'code': 'topup', 'name': 'Nạp tiền', 'count': 0, 'revenue': Decimal(0)},
		'other': {'code': 'other', 'name': 'Khác', 'count': 0, 'revenue': Decimal(0)},
	}

	dishes_map = {}
	group_map = {}
	type_map = {
		'food': {'name': 'Đồ ăn', 'revenue': Decimal(0)},
		'drink': {'name': 'Thức uống', 'revenue': Decimal(0)},
		'other': {'name': 'Loại khác', 'revenue': Decimal(0)},
		'unselected': {'name': 'Không chọn', 'revenue': Decimal(0)},
	}
	total_cogs = Decimal(0)

	for inv in invoices:
		total_subtotal += inv.subtotal
		total_discount += inv.discount_amount
		if inv.discount_amount > 0:
			discount_invoice_count += 1
		net_revenue += inv.total_amount

		# 1. Nhân viên
		c_name = inv.cashier.get_full_name() or inv.cashier.username if inv.cashier else 'Admin'
		if c_name not in cashier_map:
			cashier_map[c_name] = {'name': c_name, 'count': 0, 'revenue': Decimal(0)}
		cashier_map[c_name]['count'] += 1
		cashier_map[c_name]['revenue'] += inv.total_amount

		# 2. Khu vực & Điểm bàn
		order = inv.order
		if order and order.table:
			tbl_name = order.table.name
			area_name = order.table.area.name if order.table.area else 'Trong nhà'
		elif order and order.order_type == Order.OrderType.TAKEAWAY:
			tbl_name = 'Mang về'
			area_name = 'Mang về'
		else:
			tbl_name = 'Mang về'
			area_name = 'Mang về'

		if area_name not in area_map:
			area_map[area_name] = {'name': area_name, 'count': 0, 'revenue': Decimal(0)}
		area_map[area_name]['count'] += 1
		area_map[area_name]['revenue'] += inv.total_amount

		if tbl_name not in table_map:
			table_map[tbl_name] = {'name': tbl_name, 'count': 0, 'revenue': Decimal(0)}
		table_map[tbl_name]['count'] += 1
		table_map[tbl_name]['revenue'] += inv.total_amount

		# 3. Kiểu thanh toán
		payments = list(inv.payments.all())
		if payments:
			for p in payments:
				m_key = p.method
				if m_key == 'bank':
					m_key = 'card'  # Gộp Thẻ ngân hàng / Chuyển khoản
				if m_key not in payment_map:
					payment_map[m_key] = {'code': m_key, 'name': p.get_method_display(), 'count': 0, 'revenue': Decimal(0)}
				payment_map[m_key]['count'] += 1
				payment_map[m_key]['revenue'] += p.amount
		else:
			payment_map['cash']['count'] += 1
			payment_map['cash']['revenue'] += inv.total_amount

		# 4. Món ăn đã bán
		if order:
			for item in order.items.filter(status=OrderItem.Status.ACTIVE):
				p = item.product
				p_code = (p.code if p else '') or ''
				p_name = item.product_name
				p_unit = item.unit or (p.unit if p else 'Phần') or 'Phần'
				key = f"{p_code}_{p_name}_{p_unit}"

				first_char = p_name[:1].upper() if p_name else 'M'
				mark_code = p_code[:2].upper() if p_code else f"{first_char}."

				if key not in dishes_map:
					cost_val = p.cost_price if p else Decimal(0)
					cat_name = (p.category.name if (p and p.category) else '') or 'Không rõ'
					p_type = (p.product_type if p else 'food') or 'food'
					dishes_map[key] = {
						'mark': mark_code,
						'code': p_code,
						'name': p_name,
						'unit': p_unit,
						'quantity': 0,
						'discount_count': 0,
						'discount_amount': Decimal(0),
						'revenue': Decimal(0),
						'cost_price': cost_val,
						'category': cat_name,
						'product_type': p_type,
					}

				dishes_map[key]['quantity'] += item.quantity
				if item.discount_amount > 0:
					dishes_map[key]['discount_count'] += 1
					dishes_map[key]['discount_amount'] += item.discount_amount
				dishes_map[key]['revenue'] += item.total_amount

				# Tính giá vốn hàng (chỉ tính món có định lượng / cost_price > 0)
				if p and p.cost_price > 0:
					total_cogs += item.quantity * p.cost_price

				# Nhóm món
				cat = dishes_map[key]['category']
				if cat not in group_map:
					group_map[cat] = {'name': cat, 'revenue': Decimal(0)}
				group_map[cat]['revenue'] += item.total_amount

				# Loại món
				ptype = dishes_map[key]['product_type']
				if ptype == 'drink':
					type_map['drink']['revenue'] += item.total_amount
				elif ptype in ('other', 'topping'):
					type_map['other']['revenue'] += item.total_amount
				elif ptype == 'food':
					type_map['food']['revenue'] += item.total_amount
				else:
					type_map['unselected']['revenue'] += item.total_amount

	# Sắp xếp danh sách
	cashiers = sorted(cashier_map.values(), key=lambda x: x['revenue'], reverse=True)
	areas = sorted(area_map.values(), key=lambda x: x['revenue'], reverse=True)
	tables = sorted(table_map.values(), key=lambda x: x['revenue'], reverse=True)
	
	# Payment list: Giữ đúng thứ tự hiển thị chuẩn như ảnh
	payment_order = ['card', 'cash', 'e_wallet', 'prepaid', 'points', 'system', 'customer_debt', 'debt', 'topup', 'other']
	payments_list = []
	for k in payment_order:
		if k in payment_map:
			payments_list.append(payment_map[k])
	for k, v in payment_map.items():
		if k not in payment_order and v not in payments_list:
			payments_list.append(v)

	dishes = sorted(dishes_map.values(), key=lambda x: x['revenue'], reverse=True)
	groups = sorted(group_map.values(), key=lambda x: x['revenue'], reverse=True)

	type_order = ['unselected', 'food', 'drink', 'other']
	types_list = [type_map[k] for k in type_order if k in type_map]

	gross_profit = net_revenue - total_cogs

	return {
		'start_dt': start_dt,
		'end_dt': end_dt,
		'from_str': start_dt.strftime('%d/%m/%Y %H:%M'),
		'to_str': end_dt.strftime('%d/%m/%Y %H:%M'),
		'total_invoices': total_invoices,
		'discount_invoice_count': discount_invoice_count,
		'total_subtotal': total_subtotal,
		'total_discount': total_discount,
		'net_revenue': net_revenue,
		'total_cogs': total_cogs,
		'gross_profit': gross_profit,
		# Formatted strings
		'net_revenue_formatted': format_vnd(net_revenue),
		'total_discount_formatted': format_vnd(total_discount),
		'total_cogs_formatted': format_vnd(total_cogs),
		'gross_profit_formatted': format_vnd(gross_profit),
		# Tables
		'cashiers': [
			{
				'name': c['name'],
				'count': c['count'],
				'revenue': float(c['revenue']),
				'revenue_formatted': format_num(c['revenue']),
			} for c in cashiers
		],
		'payments': [
			{
				'name': p['name'],
				'count': p['count'],
				'revenue': float(p['revenue']),
				'revenue_formatted': format_num(p['revenue']),
			} for p in payments_list
		],
		'areas': [
			{
				'name': a['name'],
				'count': a['count'],
				'revenue': float(a['revenue']),
				'revenue_formatted': format_num(a['revenue']),
			} for a in areas
		],
		'tables': [
			{
				'name': t['name'],
				'count': t['count'],
				'revenue': float(t['revenue']),
				'revenue_formatted': format_num(t['revenue']),
			} for t in tables
		],
		'dishes': [
			{
				'mark': d['mark'],
				'code': d['code'],
				'name': d['name'],
				'unit': d['unit'],
				'quantity': d['quantity'],
				'discount_count': d['discount_count'],
				'discount_amount': float(d['discount_amount']),
				'discount_amount_formatted': format_num(d['discount_amount']),
				'revenue': float(d['revenue']),
				'revenue_formatted': format_num(d['revenue']),
				'category': d['category'],
				'cost_price': float(d['cost_price']),
			} for d in dishes
		],
		'groups': [
			{
				'name': g['name'],
				'revenue': float(g['revenue']),
				'revenue_formatted': format_num(g['revenue']),
			} for g in groups
		],
		'types': [
			{
				'name': t['name'],
				'revenue': float(t['revenue']),
				'revenue_formatted': format_num(t['revenue']),
			} for t in types_list
		],
	}


def export_sales_statistics_csv(stats):
	"""
	Xuất báo cáo thống kê bán hàng ra file CSV UTF-8 kèm BOM.
	Tương thích hoàn hảo với Microsoft Excel, Google Sheets.
	"""
	response = HttpResponse(content_type='text/csv; charset=utf-8')
	filename = f"Thong_ke_ban_hang_{timezone.now().strftime('%Y%m%d_%H%M%S')}.csv"
	response['Content-Disposition'] = f'attachment; filename="{filename}"'
	response.write('\ufeff')

	writer = csv.writer(response)

	# 1. Header Báo cáo
	writer.writerow(['MIX FOOD - CHI NHÁNH ĐÀ NẴNG', '', '', '', '', '', '', ''])
	writer.writerow(['Ẩm Thực Thái • K38/37 Nguyễn Duy Hiệu, Q.Sơn Trà - TP. Đà Nẵng • Mã: 13255'])
	writer.writerow(['BÁO CÁO THỐNG KÊ BÁN HÀNG'])
	writer.writerow([f"Thời gian: Từ {stats['from_str']} đến {stats['to_str']}"])
	writer.writerow([])

	# 2. Tổng quan
	writer.writerow(['--- TỔNG HỢP DOANH THU & CHỈ SỐ ---'])
	writer.writerow(['Chỉ số', 'Giá trị'])
	writer.writerow(['Tổng số hóa đơn', stats['total_invoices']])
	writer.writerow(['Doanh thu thuần (DTT)', int(stats['net_revenue'])])
	writer.writerow(['Số hóa đơn có giảm giá', stats['discount_invoice_count']])
	writer.writerow(['Tổng tiền giảm giá', int(stats['total_discount'])])
	writer.writerow(['Giá vốn hàng bán (GVH)', int(stats['total_cogs'])])
	writer.writerow(['Lợi nhuận gộp (DTT - GVH)', int(stats['gross_profit'])])
	writer.writerow([])

	# 3. Theo Nhân viên
	writer.writerow(['--- DOANH THU THEO NHÂN VIÊN ---'])
	writer.writerow(['Nhân viên', 'Số h/đơn', 'Doanh thu (đ)'])
	for c in stats['cashiers']:
		writer.writerow([c['name'], c['count'], int(c['revenue'])])
	writer.writerow([])

	# 4. Theo Kiểu thanh toán
	writer.writerow(['--- DOANH THU THEO KIỂU THANH TOÁN ---'])
	writer.writerow(['Kiểu thanh toán', 'Số h/đơn', 'Doanh thu (đ)'])
	for p in stats['payments']:
		writer.writerow([p['name'], p['count'], int(p['revenue'])])
	writer.writerow([])

	# 5. Theo Khu vực
	writer.writerow(['--- DOANH THU THEO KHU VỰC ---'])
	writer.writerow(['Khu vực', 'Số h/đơn', 'Doanh thu (đ)'])
	for a in stats['areas']:
		writer.writerow([a['name'], a['count'], int(a['revenue'])])
	writer.writerow([])

	# 6. Theo Điểm bàn
	writer.writerow(['--- DOANH THU THEO ĐIỂM BÀN ---'])
	writer.writerow(['Điểm bàn', 'Số h/đơn', 'Doanh thu (đ)'])
	for t in stats['tables']:
		writer.writerow([t['name'], t['count'], int(t['revenue'])])
	writer.writerow([])

	# 7. Danh sách món ăn đã bán
	writer.writerow(['--- DANH SÁCH MÓN ĐÃ BÁN ---'])
	writer.writerow(['Mã/Dấu', 'Mã món', 'Tên món', 'ĐVT', 'Số lượng', 'Số giảm', 'Tiền giảm (đ)', 'Doanh thu (đ)'])
	for d in stats['dishes']:
		writer.writerow([
			d['mark'],
			d['code'],
			d['name'],
			d['unit'],
			d['quantity'],
			d['discount_count'],
			int(d['discount_amount']),
			int(d['revenue']),
		])
	writer.writerow([])

	# 8. Nhóm món
	writer.writerow(['--- DOANH THU THEO NHÓM MÓN ---'])
	writer.writerow(['Nhóm món', 'Doanh thu (đ)'])
	for g in stats['groups']:
		writer.writerow([g['name'], int(g['revenue'])])
	writer.writerow([])

	# 9. Loại món
	writer.writerow(['--- DOANH THU THEO LOẠI MÓN ---'])
	writer.writerow(['Loại món', 'Doanh thu (đ)'])
	for t in stats['types']:
		writer.writerow([t['name'], int(t['revenue'])])

	return response

