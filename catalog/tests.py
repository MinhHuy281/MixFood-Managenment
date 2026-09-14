from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from .models import Category, Ingredient, Product


class CatalogCrudTests(TestCase):
	def setUp(self):
		self.user = get_user_model().objects.create_user(username='catalog-test', password='test-password')
		self.client.force_login(self.user)
		self.category = Category.objects.create(name='Pad Thai')

	def test_catalog_pages_require_authentication(self):
		self.client.logout()
		response = self.client.get(reverse('catalog:products'))
		self.assertRedirects(response, '/accounts/login/?next=/catalog/products/')

	def test_catalog_pages_render_for_authenticated_user(self):
		for route_name in ('catalog:home', 'catalog:categories', 'catalog:products', 'catalog:ingredients'):
			response = self.client.get(reverse(route_name))
			self.assertEqual(response.status_code, 200)

	def test_can_create_product_and_ingredient(self):
		product_response = self.client.post(reverse('catalog:product_create'), {
			'category': self.category.pk,
			'code': 'PT-001',
			'name': 'Pad Thai tôm',
			'unit': 'Phần',
			'price': '95000',
			'price_2': '0',
			'price_3': '0',
			'cost_price': '45000',
			'product_type': Product.ProductType.FOOD,
			'is_available': 'on',
			'is_active': 'on',
		})
		ingredient_response = self.client.post(reverse('catalog:ingredient_create'), {
			'code': 'ING-001',
			'name': 'Tôm sú',
			'unit': 'Kg',
			'current_stock': '2',
			'minimum_stock': '5',
			'average_cost': '180000',
			'supplier': 'Nhà cung cấp thử nghiệm',
			'is_active': 'on',
		})
		self.assertRedirects(product_response, reverse('catalog:products'))
		self.assertRedirects(ingredient_response, reverse('catalog:ingredients'))
		self.assertTrue(Product.objects.filter(code='PT-001').exists())
		ingredient = Ingredient.objects.get(code='ING-001')
		self.assertTrue(ingredient.is_low_stock)
from django.test import TestCase

# Create your tests here.
