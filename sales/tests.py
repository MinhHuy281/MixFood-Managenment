import json

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from catalog.models import Category, Product
from dining.models import Area, DiningTable

from .models import Invoice, Order, OrderItem, Payment


class CheckoutTests(TestCase):
	def setUp(self):
		self.user = get_user_model().objects.create_user('cashier-test', password='test-password')
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
from django.test import TestCase

# Create your tests here.
