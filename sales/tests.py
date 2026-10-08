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
		self.assertEqual(Invoice.objects.get().total_amount, 190000)
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

