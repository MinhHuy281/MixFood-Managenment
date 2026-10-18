import json

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.urls import reverse

from catalog.models import Category, Product
from dining.models import Area, DiningTable
from inventory.models import Recipe, RecipeItem, StockTransaction

from .models import Invoice, Order, OrderItem, Payment


class CheckoutTests(TestCase):
	def setUp(self):
		self.user = get_user_model().objects.create_user('cashier-test', password='test-password')
		self.sales_group = Group.objects.create(name='Sales')
		self.user.groups.add(self.sales_group)
		self.category = Category.objects.create(name='Pad Thai')
		self.product = Product.objects.create(category=self.category, code='PT-TEST', name='Pad Thai test', unit='Phần', price=95000)
		self.area = Area.objects.create(name='Trong nhà')
		self.table = DiningTable.objects.create(area=self.area, name='1', code='TN-01')
		self.client.force_login(self.user)

	def test_checkout_creates_order_invoice_payment_and_frees_table(self):
		response = self.client.post(reverse('sales:checkout'), data=json.dumps({
			'table_id': self.table.pk,
			'payment_method': Payment.Method.CASH,
			'items': [{'product_id': self.product.pk, 'quantity': 2}],
		}), content_type='application/json')
		self.assertEqual(response.status_code, 200)
		self.assertEqual(Order.objects.count(), 1)
		order = Order.objects.get()
		self.assertEqual(order.status, Order.Status.PAID)
		self.assertEqual(order.total_amount, 190000)
		self.assertEqual(OrderItem.objects.get().total_amount, 190000)
		invoice = Invoice.objects.get()
		self.assertEqual(invoice.total_amount, 190000)
		self.assertEqual(invoice.invoice_code, '0001')
		self.assertEqual(Payment.objects.get().amount, 190000)
		self.table.refresh_from_db()
		self.assertEqual(self.table.status, DiningTable.Status.AVAILABLE)

	def test_invalid_product_does_not_create_partial_order(self):
		response = self.client.post(reverse('sales:checkout'), data=json.dumps({
			'table_id': self.table.pk,
			'items': [{'product_id': 999999, 'quantity': 1}],
		}), content_type='application/json')
		self.assertEqual(response.status_code, 400)
		self.assertEqual(Order.objects.count(), 0)

	def test_checkout_requires_sales_role(self):
		self.user.groups.clear()
		response = self.client.post(reverse('sales:checkout'), data=json.dumps({
			'table_id': self.table.pk,
			'items': [{'product_id': self.product.pk, 'quantity': 1}],
		}), content_type='application/json')
		self.assertEqual(response.status_code, 403)

	def test_checkout_rejects_discount_above_subtotal(self):
		response = self.client.post(reverse('sales:checkout'), data=json.dumps({
			'table_id': self.table.pk,
			'discount_amount': 95001,
			'items': [{'product_id': self.product.pk, 'quantity': 1}],
		}), content_type='application/json')
		self.assertEqual(response.status_code, 400)
		self.assertEqual(Order.objects.count(), 0)

	def test_checkout_merges_duplicate_product_items(self):
		response = self.client.post(reverse('sales:checkout'), data=json.dumps({
			'table_id': self.table.pk,
			'items': [
				{'product_id': self.product.pk, 'quantity': 1},
				{'product_id': self.product.pk, 'quantity': 2},
			],
		}), content_type='application/json')
		self.assertEqual(response.status_code, 200)
		self.assertEqual(OrderItem.objects.get().quantity, 3)

	def test_checkout_deducts_recipe_ingredients(self):
		from catalog.models import Ingredient

		ingredient = Ingredient.objects.create(code='ING-SALE', name='Nguyên liệu bán', current_stock=3, minimum_stock=1)
		recipe = Recipe.objects.create(product=self.product)
		RecipeItem.objects.create(recipe=recipe, ingredient=ingredient, quantity='0.5', unit='Kg')
		response = self.client.post(reverse('sales:checkout'), data=json.dumps({
			'table_id': self.table.pk,
			'items': [{'product_id': self.product.pk, 'quantity': 2}],
		}), content_type='application/json')
		self.assertEqual(response.status_code, 200)
		ingredient.refresh_from_db()
		self.assertEqual(ingredient.current_stock, 2)
		self.assertEqual(StockTransaction.objects.count(), 1)


class InvoiceListTests(TestCase):
	def setUp(self):
		self.user = get_user_model().objects.create_user('cashier-test', password='test-password')
		self.sales_group = Group.objects.create(name='Sales')
		self.user.groups.add(self.sales_group)
		self.category = Category.objects.create(name='Đồ uống')
		self.product = Product.objects.create(category=self.category, code='TYDB', name='Trà Ý Đặc Biệt', unit='Ly', price=35000)
		self.area = Area.objects.create(name='Tầng 2')
		self.table = DiningTable.objects.create(area=self.area, name='14', code='T2-14')
		self.client.force_login(self.user)

		# Create an invoice
		self.order = Order.objects.create(
			order_code='ORD-TEST-001',
			table=self.table,
			order_type=Order.OrderType.DINE_IN,
			status=Order.Status.PAID,
			subtotal=70000,
			discount_amount=5000,
			total_amount=65000,
			created_by=self.user,
		)
		OrderItem.objects.create(
			order=self.order,
			product=self.product,
			product_name=self.product.name,
			unit='Ly',
			quantity=2,
			unit_price=35000,
		)
		self.invoice = Invoice.objects.create(
			invoice_code='00255',
			order=self.order,
			cashier=self.user,
			subtotal=70000,
			discount_amount=5000,
			total_amount=65000,
			status=Invoice.Status.PAID,
		)
		Payment.objects.create(
			invoice=self.invoice,
			method=Payment.Method.BANK,
			amount=65000,
			created_by=self.user,
		)

	def test_invoice_list_html_view(self):
		response = self.client.get(reverse('sales:invoices'))
		self.assertEqual(response.status_code, 200)
		self.assertContains(response, '00255')
		self.assertContains(response, '65.000')

	def test_invoice_list_json_api(self):
		response = self.client.get(reverse('sales:invoices'), {'format': 'json'})
		self.assertEqual(response.status_code, 200)
		data = response.json()
		self.assertTrue(data['ok'])
		self.assertEqual(len(data['invoices']), 1)
		inv = data['invoices'][0]
		self.assertEqual(inv['invoice_code'], '00255')
		self.assertEqual(inv['table'], '14')
		self.assertEqual(inv['area'], 'Tầng 2')
		self.assertEqual(inv['items_short'], 'TÝĐB (2)')
		self.assertEqual(inv['items_full'], 'Trà Ý Đặc Biệt (2)')
		self.assertEqual(data['summary']['total_count'], 1)
		self.assertEqual(data['summary']['total_revenue'], 65000.0)

	def test_invoice_list_excel_export(self):
		response = self.client.get(reverse('sales:invoices'), {'export': 'excel'})
		self.assertEqual(response.status_code, 200)
		self.assertEqual(response['Content-Type'], 'text/csv; charset=utf-8')
		content = response.content.decode('utf-8-sig')
		self.assertIn('Số HĐ,Thời gian,Nhân viên', content)
		self.assertIn('00255', content)
		self.assertIn('Tầng 2,14,TÝĐB (2)', content)


class InvoiceEditTests(TestCase):
	def setUp(self):
		self.user = get_user_model().objects.create_user('cashier-editor', password='test-password')
		self.sales_group = Group.objects.create(name='Sales')
		self.user.groups.add(self.sales_group)
		self.category = Category.objects.create(name='Đồ uống')
		self.product1 = Product.objects.create(category=self.category, code='TYDB', name='Trà Ý Đặc Biệt', unit='Ly', price=35000)
		self.product2 = Product.objects.create(category=self.category, code='CFD', name='Cà phê đen', unit='Ly', price=25000)
		self.area = Area.objects.create(name='Tầng 1')
		self.table = DiningTable.objects.create(area=self.area, name='1', code='T1-01')
		self.client.force_login(self.user)

		self.order = Order.objects.create(
			order_code='ORD-EDIT-001',
			table=self.table,
			order_type=Order.OrderType.DINE_IN,
			status=Order.Status.PAID,
			subtotal=70000,
			discount_amount=0,
			total_amount=70000,
			created_by=self.user,
		)
		self.item1 = OrderItem.objects.create(
			order=self.order,
			product=self.product1,
			product_name=self.product1.name,
			unit='Ly',
			quantity=2,
			unit_price=35000,
			total_amount=70000,
		)
		self.invoice = Invoice.objects.create(
			invoice_code='00064',
			order=self.order,
			cashier=self.user,
			subtotal=70000,
			total_amount=70000,
			status=Invoice.Status.PAID,
		)
		self.payment = Payment.objects.create(
			invoice=self.invoice,
			method=Payment.Method.CASH,
			amount=70000,
			created_by=self.user,
		)

	def test_invoice_detail_api_success(self):
		url = reverse('sales:invoice_detail_api', kwargs={'invoice_code': '00064'})
		response = self.client.get(url)
		self.assertEqual(response.status_code, 200)
		data = response.json()
		self.assertTrue(data['ok'])
		self.assertEqual(data['invoice']['invoice_code'], '00064')
		self.assertEqual(data['invoice']['table_name'], '1')
		self.assertEqual(len(data['invoice']['items']), 1)
		self.assertEqual(data['invoice']['items'][0]['product_name'], 'Trà Ý Đặc Biệt')
		self.assertGreaterEqual(len(data['products']), 2)
		self.assertGreaterEqual(len(data['cashiers']), 1)
		self.assertGreaterEqual(len(data['payment_methods']), 4)

	def test_invoice_detail_api_not_found(self):
		url = reverse('sales:invoice_detail_api', kwargs={'invoice_code': '999999'})
		response = self.client.get(url)
		self.assertEqual(response.status_code, 404)
		data = response.json()
		self.assertFalse(data['ok'])

	def test_edit_invoice_success_and_logs_activity(self):
		from audit.models import ActivityLog

		url = reverse('sales:edit_invoice')
		payload = {
			'invoice_code': '00064',
			'cashier_id': self.user.pk,
			'payment_method': Payment.Method.BANK,
			'items': [
				{
					'product_id': self.product1.pk,
					'product_name': self.product1.name,
					'unit': 'Ly',
					'unit_price': 35000,
					'quantity': 1,
					'discount_percent': 0,
				},
				{
					'product_id': self.product2.pk,
					'product_name': self.product2.name,
					'unit': 'Ly',
					'unit_price': 25000,
					'quantity': 2,
					'discount_percent': 0,
				},
			],
			'surcharge_amount': 5000,
			'discount_amount': 10000,
			'tax_amount': 0,
			'reason': 'Khách đổi món và yêu cầu thanh toán chuyển khoản',
		}
		response = self.client.post(url, data=json.dumps(payload), content_type='application/json')
		self.assertEqual(response.status_code, 200)
		data = response.json()
		self.assertTrue(data['ok'])

		# Verification in database
		# Items: 35.000*1 + 25.000*2 = 85.000. Surcharge: 5.000. Discount: 10.000. Total = 80.000
		self.invoice.refresh_from_db()
		self.order.refresh_from_db()
		self.payment.refresh_from_db()

		self.assertEqual(self.order.subtotal, 85000)
		self.assertEqual(self.order.surcharge_amount, 5000)
		self.assertEqual(self.order.discount_amount, 10000)
		self.assertEqual(self.order.total_amount, 80000)

		self.assertEqual(self.invoice.subtotal, 85000)
		self.assertEqual(self.invoice.surcharge_amount, 5000)
		self.assertEqual(self.invoice.discount_amount, 10000)
		self.assertEqual(self.invoice.total_amount, 80000)

		self.assertEqual(self.payment.amount, 80000)
		self.assertEqual(self.payment.method, Payment.Method.BANK)

		# Check order items
		self.assertEqual(self.order.items.count(), 2)

		# Check audit log
		log = ActivityLog.objects.filter(action=ActivityLog.Action.EDIT_INVOICE).latest('created_at')
		self.assertIn('Sửa hóa đơn số 00064', log.description)
		self.assertIn('(thay đổi kiểu thanh toán, thông tin các món)', log.description)
		self.assertIn('thành tiền từ 70.000 đ thành 80.000 đ', log.description)
		self.assertIn('(Khách đổi món và yêu cầu thanh toán chuyển khoản)', log.description)
		self.assertEqual(log.actor, self.user)
		self.assertIn('activity_log', data)

	def test_edit_invoice_requires_reason(self):
		url = reverse('sales:edit_invoice')
		payload = {
			'invoice_code': '00064',
			'items': [{'product_id': self.product1.pk, 'product_name': self.product1.name, 'unit_price': 35000, 'quantity': 1}],
			'reason': '',
		}
		response = self.client.post(url, data=json.dumps(payload), content_type='application/json')
		self.assertEqual(response.status_code, 400)
		data = response.json()
		self.assertFalse(data['ok'])
		self.assertIn('lý do', data['error'].lower())

	def test_edit_invoice_requires_items(self):
		url = reverse('sales:edit_invoice')
		payload = {
			'invoice_code': '00064',
			'items': [],
			'reason': 'Thử xóa hết món',
		}
		response = self.client.post(url, data=json.dumps(payload), content_type='application/json')
		self.assertEqual(response.status_code, 400)
		data = response.json()
		self.assertFalse(data['ok'])

	def test_sales_statistics_api(self):
		url = reverse('sales:statistics_api')
		response = self.client.get(url)
		self.assertEqual(response.status_code, 200)
		data = response.json()
		self.assertTrue(data['ok'])
		stats = data['stats']
		self.assertIn('total_invoices', stats)
		self.assertIn('net_revenue', stats)
		self.assertIn('cashiers', stats)
		self.assertIn('areas', stats)
		self.assertIn('payments', stats)
		self.assertIn('tables', stats)
		self.assertIn('dishes', stats)
		self.assertIn('groups', stats)
		self.assertIn('types', stats)
		self.assertGreaterEqual(stats['total_invoices'], 1)

	def test_sales_statistics_export(self):
		url = reverse('sales:statistics_export')
		response = self.client.get(url)
		self.assertEqual(response.status_code, 200)
		self.assertIn('text/csv', response['Content-Type'])
		self.assertTrue(response.has_header('Content-Disposition'))

	def test_sales_statistics_print(self):
		url = reverse('sales:statistics_print')
		response = self.client.get(url)
		self.assertEqual(response.status_code, 200)
		self.assertContains(response, 'print-container')
		self.assertContains(response, 'summary-box')

	def test_delete_invoice_logs_reason_like_edit(self):
		from audit.models import ActivityLog
		url = reverse('sales:delete_invoice')
		response = self.client.post(url, data=json.dumps({
			'invoice_code': '00064',
			'reason': 'Khách báo hủy đơn',
		}), content_type='application/json')
		self.assertEqual(response.status_code, 200)
		data = response.json()
		self.assertTrue(data['ok'])
		self.assertIn('activity_log', data)
		self.assertIn('(Khách báo hủy đơn)', data['activity_log']['description'])
		log = ActivityLog.objects.filter(action=ActivityLog.Action.DELETE_INVOICE).latest('created_at')
		self.assertIn('Xóa hóa đơn số 00064', log.description)
		self.assertIn('(Khách báo hủy đơn)', log.description)

	def test_table_actions_reserve_transfer_import_combine_split(self):
		from audit.models import ActivityLog
		table2 = DiningTable.objects.create(area=self.area, name='2', code='T1-02')
		url = reverse('sales:table_action_api')

		# Reserve table 1
		res = self.client.post(url, data=json.dumps({
			'action': 'reserve',
			'source_table_id': self.table.pk,
		}), content_type='application/json')
		self.assertEqual(res.status_code, 200)
		self.table.refresh_from_db()
		self.assertEqual(self.table.status, DiningTable.Status.RESERVED)

		# Transfer from table 2 to table 1
		res = self.client.post(url, data=json.dumps({
			'action': 'transfer',
			'source_table_id': table2.pk,
			'target_table_id': self.table.pk,
		}), content_type='application/json')
		self.assertEqual(res.status_code, 200)
		data = res.json()
		self.assertTrue(data['ok'])
		self.assertIn('Chuyển từ bàn 2 sang bàn 1', data['activity_log']['description'])
		table2.refresh_from_db()
		self.table.refresh_from_db()
		self.assertEqual(table2.status, DiningTable.Status.AVAILABLE)
		self.assertEqual(self.table.status, DiningTable.Status.OCCUPIED)

		# Combine table 1 with table 2
		res = self.client.post(url, data=json.dumps({
			'action': 'combine',
			'source_table_id': self.table.pk,
			'target_table_id': table2.pk,
		}), content_type='application/json')
		self.assertEqual(res.status_code, 200)
		self.assertIn('Ghép bàn 1 với bàn 2', res.json()['activity_log']['description'])

		# Split from table 1 to table 2
		res = self.client.post(url, data=json.dumps({
			'action': 'split',
			'source_table_id': self.table.pk,
			'target_table_id': table2.pk,
		}), content_type='application/json')
		self.assertEqual(res.status_code, 200)
		self.assertIn('Tách từ bàn 1 sang bàn 2', res.json()['activity_log']['description'])

		# Import from table 2 into table 1
		res = self.client.post(url, data=json.dumps({
			'action': 'import',
			'source_table_id': table2.pk,
			'target_table_id': self.table.pk,
		}), content_type='application/json')
		self.assertEqual(res.status_code, 200)
		self.assertIn('Nhập từ bàn 2 vào bàn 1', res.json()['activity_log']['description'])
		self.assertEqual(ActivityLog.objects.filter(action=ActivityLog.Action.TRANSFER_TABLE).count(), 1)




