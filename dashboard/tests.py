from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.urls import reverse

from catalog.models import Category, Product
from dining.models import Area, DiningTable
from sales.models import Invoice, Order, OrderItem, Payment


class PosDataTests(TestCase):
	def test_pos_uses_database_products_and_tables(self):
		user = get_user_model().objects.create_user('pos-test', password='test-password')
		category = Category.objects.create(name='Pad Thai')
		Product.objects.create(category=category, code='PT-001', name='Pad Thai tôm', price=95000)
		area = Area.objects.create(name='Trong nhà')
		DiningTable.objects.create(area=area, name='1', code='TN-01')
		self.client.force_login(user)
		response = self.client.get('/')
		self.assertEqual(response.status_code, 200)
		self.assertContains(response, 'Pad Thai tôm')
		self.assertContains(response, 'data-table-name="1"', status_code=200)


class ReportTests(TestCase):
	def test_report_uses_paid_invoice_data(self):
		user = get_user_model().objects.create_user('manager-report', password='test-password')
		user.groups.add(Group.objects.create(name='Manager'))
		category = Category.objects.create(name='Báo cáo')
		product = Product.objects.create(category=category, code='REPORT-01', name='Món báo cáo', price=80000)
		order = Order.objects.create(order_code='REPORT-ORDER', status=Order.Status.PAID, subtotal=160000, total_amount=160000, created_by=user)
		OrderItem.objects.create(order=order, product=product, product_name=product.name, unit='Phần', quantity=2, unit_price=80000)
		invoice = Invoice.objects.create(invoice_code='REPORT-INV', order=order, cashier=user, subtotal=160000, total_amount=160000)
		Payment.objects.create(invoice=invoice, method=Payment.Method.CASH, amount=160000, created_by=user)
		self.client.force_login(user)
		response = self.client.get(reverse('dashboard:reports'))
		self.assertEqual(response.status_code, 200)
		self.assertContains(response, '160000')
		self.assertContains(response, 'Món báo cáo')

	def test_report_requires_manager_role(self):
		user = get_user_model().objects.create_user('sales-report', password='test-password')
		user.groups.add(Group.objects.create(name='Sales'))
		self.client.force_login(user)
		self.assertEqual(self.client.get(reverse('dashboard:reports')).status_code, 403)
