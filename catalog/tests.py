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


class MenuAdminTests(TestCase):
	def setUp(self):
		self.user = get_user_model().objects.create_user(username='admin-menu-test', password='password123')
		self.client.force_login(self.user)
		self.category = Category.objects.create(name='BÚN THÁI', display_order=1)
		self.product = Product.objects.create(
			category=self.category,
			code='BTB',
			name='Bún Thái Bò',
			unit='Phần',
			price=50000,
			price_2=60000,
			price_3=0,
			product_type=Product.ProductType.FOOD,
			is_available=True,
			is_active=True,
		)

	def test_menu_admin_page_renders(self):
		response = self.client.get(reverse('catalog:menu_admin'))
		self.assertEqual(response.status_code, 200)
		self.assertTemplateUsed(response, 'catalog/pages/menu_admin.html')
		self.assertContains(response, 'Thực đơn - Admin')
		self.assertContains(response, 'Bún Thái Bò')
		self.assertContains(response, 'BTB')

	def test_menu_dishes_api(self):
		response = self.client.get(reverse('catalog:menu_dishes_api'))
		self.assertEqual(response.status_code, 200)
		data = response.json()
		self.assertIn('dishes', data)
		self.assertIn('categories', data)
		self.assertEqual(len(data['dishes']), 1)
		self.assertEqual(data['dishes'][0]['code'], 'BTB')

	def test_menu_save_dish_create_with_auto_recipe(self):
		payload = {
			'category_id': self.category.id,
			'subgroup': 'Đặc biệt',
			'code': 'BTDB',
			'name': 'Bún Thái Đặc Biệt',
			'unit': 'Tô',
			'price': 60000,
			'price_2': 70000,
			'price_3': 0,
			'product_type': 'food',
			'auto_recipe': True,
		}
		response = self.client.post(
			reverse('catalog:menu_save_dish'),
			data=payload,
			content_type='application/json',
		)
		self.assertEqual(response.status_code, 200)
		data = response.json()
		self.assertTrue(data.get('success'))
		self.assertTrue(Product.objects.filter(code='BTDB').exists())
		p = Product.objects.get(code='BTDB')
		self.assertEqual(p.subgroup, 'Đặc biệt')
		from inventory.models import Recipe
		self.assertTrue(Recipe.objects.filter(product=p).exists())

	def test_menu_save_dish_update(self):
		payload = {
			'dish_id': self.product.id,
			'category_id': self.category.id,
			'subgroup': '',
			'code': 'BTB',
			'name': 'Bún Thái Bò Nóng',
			'unit': 'Tô',
			'price': 55000,
			'price_2': 65000,
			'price_3': 0,
			'product_type': 'food',
			'auto_recipe': False,
		}
		response = self.client.post(
			reverse('catalog:menu_save_dish'),
			data=payload,
			content_type='application/json',
		)
		self.assertEqual(response.status_code, 200)
		self.product.refresh_from_db()
		self.assertEqual(self.product.name, 'Bún Thái Bò Nóng')
		self.assertEqual(self.product.price, 55000)

	def test_menu_delete_dish(self):
		response = self.client.post(reverse('catalog:menu_delete_dish', args=[self.product.id]))
		self.assertEqual(response.status_code, 200)
		self.product.refresh_from_db()
		self.assertFalse(self.product.is_active)
		self.assertFalse(self.product.is_available)

	def test_menu_save_and_delete_category(self):
		response = self.client.post(
			reverse('catalog:menu_save_category'),
			data={'name': 'LẨU THÁI', 'color': '#ef4444', 'display_order': 5},
			content_type='application/json',
		)
		self.assertEqual(response.status_code, 200)
		cat = Category.objects.get(name='LẨU THÁI')
		self.assertEqual(cat.color, '#ef4444')

		del_response = self.client.post(reverse('catalog:menu_delete_category', args=[cat.id]))
		self.assertEqual(del_response.status_code, 200)
		cat.refresh_from_db()
		self.assertFalse(cat.is_active)

	def test_menu_export_excel(self):
		response = self.client.get(reverse('catalog:menu_export_excel'))
		self.assertEqual(response.status_code, 200)
		self.assertEqual(response['Content-Type'], 'text/csv; charset=utf-8')
		self.assertTrue(response.content.startswith(b'\xef\xbb\xbf'))
		content_text = response.content.decode('utf-8')
		self.assertIn('BTB', content_text)
		self.assertIn('Bún Thái Bò', content_text)

	def test_menu_import_excel(self):
		csv_data = "BÚN THÁI\t\tBT-IMPORT\tBún Thái Nhập Khẩu\tPhần\t75000\t85000\t0\tĐồ ăn\n"
		response = self.client.post(
			reverse('catalog:menu_import_excel'),
			data={'csv_text': csv_data, 'auto_recipe': 'true'},
		)
		self.assertEqual(response.status_code, 200)
		data = response.json()
		self.assertTrue(data.get('success'))
		self.assertEqual(data.get('imported_count'), 1)
		self.assertTrue(Product.objects.filter(code='BT-IMPORT').exists())

	def test_vnd_formatting_and_dotted_price_saving(self):
		from catalog.templatetags.menu_tags import vnd, vnd_currency
		self.assertEqual(vnd(15000), '15.000')
		self.assertEqual(vnd('100000'), '100.000')
		self.assertEqual(vnd(0), '0')
		self.assertEqual(vnd_currency(15000), '15.000 đ')

		# Test model properties
		self.assertEqual(self.product.price_vnd, '50.000')

		# Test saving dish with dotted price e.g. "15.000"
		response = self.client.post(
			reverse('catalog:menu_save_dish'),
			data={
				'category_id': self.category.id,
				'code': 'TEST-DOT',
				'name': 'Món Test Dấu Chấm',
				'unit': 'Phần',
				'price': '15.000',
				'price_2': '20.000',
				'price_3': '0',
				'product_type': 'food',
			},
			content_type='application/json',
		)
		self.assertEqual(response.status_code, 200)
		saved = Product.objects.get(code='TEST-DOT')
		self.assertEqual(int(saved.price), 15000)
		self.assertEqual(int(saved.price_2), 20000)
		self.assertEqual(saved.price_vnd, '15.000')


class IngredientAdminTests(TestCase):
	def setUp(self):
		self.user = get_user_model().objects.create_user(username='ingredient-admin-test', password='password123')
		self.client.force_login(self.user)
		self.ing1 = Ingredient.objects.create(
			group='Pha chế',
			code='MH001',
			name='Chanh quả',
			unit='Kg',
			average_cost=35000,
			minimum_stock=0,
			is_active=True,
		)
		self.ing2 = Ingredient.objects.create(
			group='Pha chế',
			code='MH002',
			name='Cà phê Trung Nguyên',
			unit='Kg',
			average_cost=120000,
			minimum_stock=0,
			is_active=True,
		)

	def test_ingredient_list_page_renders(self):
		response = self.client.get(reverse('catalog:ingredients'))
		self.assertEqual(response.status_code, 200)
		self.assertContains(response, 'Mặt hàng - Admin')
		self.assertContains(response, 'Chanh quả')
		self.assertContains(response, 'Cà phê Trung Nguyên')

	def test_ingredient_data_api(self):
		response = self.client.get(reverse('catalog:ingredient_data_api'))
		self.assertEqual(response.status_code, 200)
		data = response.json()
		self.assertEqual(data['total_count'], 2)
		self.assertIn('groups', data)
		self.assertIn('Pha chế', data['groups'])

	def test_ingredient_save_api_create_and_update(self):
		# Create
		create_resp = self.client.post(
			reverse('catalog:ingredient_save_api'),
			data={
				'group': 'Gia vị',
				'name': 'Đường trắng',
				'code': 'MH003',
				'unit': 'Kg',
				'average_cost': '27.000',
				'minimum_stock': '0.000',
			},
			content_type='application/json',
		)
		self.assertEqual(create_resp.status_code, 200)
		c_data = create_resp.json()
		self.assertTrue(c_data['success'])
		self.assertEqual(c_data['ingredient']['name'], 'Đường trắng')
		self.assertEqual(c_data['ingredient']['cost_formatted'], '27.000')

		ing3 = Ingredient.objects.get(code='MH003')
		self.assertEqual(int(ing3.average_cost), 27000)

		# Update
		update_resp = self.client.post(
			reverse('catalog:ingredient_save_api'),
			data={
				'id': ing3.id,
				'group': 'Gia vị',
				'name': 'Đường trắng Biên Hòa',
				'code': 'MH003',
				'unit': 'Kg',
				'average_cost': '28.000',
				'minimum_stock': '1.000',
			},
			content_type='application/json',
		)
		self.assertEqual(update_resp.status_code, 200)
		ing3.refresh_from_db()
		self.assertEqual(ing3.name, 'Đường trắng Biên Hòa')
		self.assertEqual(int(ing3.average_cost), 28000)

	def test_ingredient_delete_api(self):
		response = self.client.post(reverse('catalog:ingredient_delete_api', args=[self.ing1.id]))
		self.assertEqual(response.status_code, 200)
		self.ing1.refresh_from_db()
		self.assertFalse(self.ing1.is_active)

	def test_ingredient_export_excel(self):
		response = self.client.get(reverse('catalog:ingredient_export_excel'))
		self.assertEqual(response.status_code, 200)
		self.assertEqual(response['Content-Type'], 'text/csv; charset=utf-8')
		content = response.content.decode('utf-8-sig')
		self.assertIn('Chanh quả', content)
		self.assertIn('Cà phê Trung Nguyên', content)

	def test_ingredient_import_excel(self):
		csv_data = "Nông sản\t\tSả cây\tKg\t15000\t0\nGia vị\t\tTiêu đen\tKg\t180000\t0\n"
		response = self.client.post(
			reverse('catalog:ingredient_import_excel'),
			data={'csv_text': csv_data},
		)
		self.assertEqual(response.status_code, 200)
		data = response.json()
		self.assertTrue(data['success'])
		self.assertEqual(data['imported_count'], 2)
		self.assertTrue(Ingredient.objects.filter(name='Sả cây').exists())
		self.assertTrue(Ingredient.objects.filter(name='Tiêu đen').exists())


