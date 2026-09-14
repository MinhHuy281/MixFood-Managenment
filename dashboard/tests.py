from django.contrib.auth import get_user_model
from django.test import TestCase

from catalog.models import Category, Product
from dining.models import Area, DiningTable


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
from django.test import TestCase

# Create your tests here.
