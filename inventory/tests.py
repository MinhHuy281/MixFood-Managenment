from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase

from catalog.models import Category, Ingredient, Product

from .models import Recipe, RecipeItem, StockReceipt, StockReceiptItem, StockTransaction
from .services import deduct_for_sale, receive_stock


class InventoryServiceTests(TestCase):
	def setUp(self):
		self.user = get_user_model().objects.create_user('warehouse-test', password='test-password')
		category = Category.objects.create(name='Món test')
		self.product = Product.objects.create(category=category, code='TEST-INV', name='Món test', price=50000)
		self.ingredient = Ingredient.objects.create(code='ING-TEST', name='Nguyên liệu test', unit='Kg', current_stock=5, average_cost=10000)

	def test_receive_stock_updates_balance_average_cost_and_history(self):
		receipt = StockReceipt.objects.create(receipt_code='PN-TEST', created_by=self.user)
		StockReceiptItem.objects.create(receipt=receipt, ingredient=self.ingredient, quantity=3, unit_cost=20000)
		receive_stock(receipt, self.user)
		self.ingredient.refresh_from_db()
		receipt.refresh_from_db()
		self.assertEqual(self.ingredient.current_stock, 8)
		self.assertEqual(receipt.status, StockReceipt.Status.CONFIRMED)
		self.assertEqual(StockTransaction.objects.count(), 1)

	def test_sale_deducts_recipe_quantity(self):
		recipe = Recipe.objects.create(product=self.product)
		RecipeItem.objects.create(recipe=recipe, ingredient=self.ingredient, quantity='0.5', unit='Kg')
		class Item:
			product_id = self.product.pk
			quantity = 2
		transactions = deduct_for_sale([Item()], self.user, 123)
		self.ingredient.refresh_from_db()
		self.assertEqual(self.ingredient.current_stock, 4)
		self.assertEqual(len(transactions), 1)

	def test_sale_rejects_insufficient_stock_without_changing_balance(self):
		recipe = Recipe.objects.create(product=self.product)
		RecipeItem.objects.create(recipe=recipe, ingredient=self.ingredient, quantity='10', unit='Kg')
		class Item:
			product_id = self.product.pk
			quantity = 1
		with self.assertRaises(ValidationError):
			deduct_for_sale([Item()], self.user, 123)
		self.ingredient.refresh_from_db()
		self.assertEqual(self.ingredient.current_stock, 5)
		self.assertEqual(StockTransaction.objects.count(), 0)


class RecipeAdminTests(TestCase):
	def setUp(self):
		self.user = get_user_model().objects.create_user(username='recipe-admin-test', password='password123')
		self.client.force_login(self.user)
		self.category = Category.objects.create(name='Cà phê & Đồ uống')
		self.product = Product.objects.create(
			category=self.category,
			code='CF-DEN',
			name='Cà phê đen đá',
			unit='Ly',
			price=25000,
			cost_price=0,
		)
		self.ing_cf = Ingredient.objects.create(
			group='Pha chế',
			code='MH002',
			name='Cà phê Trung Nguyên',
			unit='Kg',
			average_cost=120000,
		)
		self.ing_sugar = Ingredient.objects.create(
			group='Gia vị',
			code='MH003',
			name='Đường trắng',
			unit='Kg',
			average_cost=27000,
		)

	def test_recipe_list_page_renders(self):
		from django.urls import reverse
		response = self.client.get(reverse('inventory:recipes'))
		self.assertEqual(response.status_code, 200)
		self.assertContains(response, 'Định lượng nguyên liệu')
		self.assertContains(response, 'Cà phê đen đá')

	def test_recipe_data_api(self):
		from django.urls import reverse
		response = self.client.get(reverse('inventory:recipe_data_api'))
		self.assertEqual(response.status_code, 200)
		data = response.json()
		self.assertIn('products', data)
		self.assertIn('ingredients', data)
		self.assertIn('categories', data)
		self.assertEqual(len(data['products']), 1)

	def test_recipe_save_item_recalculates_cost_price(self):
		from django.urls import reverse
		# Thêm cà phê: 0.025 Kg * 120.000 = 3.000 đ
		resp1 = self.client.post(
			reverse('inventory:recipe_save_item_api'),
			data={
				'product_id': self.product.id,
				'ingredient_id': self.ing_cf.id,
				'quantity': '0.025',
				'unit': 'Kg',
			},
			content_type='application/json',
		)
		self.assertEqual(resp1.status_code, 200)
		self.product.refresh_from_db()
		self.assertEqual(int(self.product.cost_price), 3000)

		# Thêm đường: 0.010 Kg * 27.000 = 270 đ
		resp2 = self.client.post(
			reverse('inventory:recipe_save_item_api'),
			data={
				'product_id': self.product.id,
				'ingredient_id': self.ing_sugar.id,
				'quantity': '0.010',
				'unit': 'Kg',
			},
			content_type='application/json',
		)
		self.assertEqual(resp2.status_code, 200)
		self.product.refresh_from_db()
		self.assertEqual(int(self.product.cost_price), 3270)

		# Chi tiết recipe_data_api kèm product_id
		resp_detail = self.client.get(reverse('inventory:recipe_data_api') + f'?product_id={self.product.id}')
		detail_data = resp_detail.json()
		self.assertIsNotNone(detail_data['selected_recipe'])
		self.assertEqual(len(detail_data['selected_recipe']['items']), 2)

	def test_recipe_delete_item_api(self):
		from django.urls import reverse
		recipe = Recipe.objects.create(product=self.product)
		item = RecipeItem.objects.create(recipe=recipe, ingredient=self.ing_cf, quantity='0.025', unit='Kg')
		self.product.cost_price = 3000
		self.product.save()

		del_resp = self.client.post(reverse('inventory:recipe_delete_item_api', args=[item.id]))
		self.assertEqual(del_resp.status_code, 200)
		self.product.refresh_from_db()
		self.assertEqual(int(self.product.cost_price), 0)

	def test_recipe_delete_recipe_api(self):
		from django.urls import reverse
		recipe = Recipe.objects.create(product=self.product)
		RecipeItem.objects.create(recipe=recipe, ingredient=self.ing_cf, quantity='0.025', unit='Kg')
		RecipeItem.objects.create(recipe=recipe, ingredient=self.ing_sugar, quantity='0.010', unit='Kg')

		clear_resp = self.client.post(reverse('inventory:recipe_delete_recipe_api', args=[self.product.id]))
		self.assertEqual(clear_resp.status_code, 200)
		self.product.refresh_from_db()
		self.assertEqual(int(self.product.cost_price), 0)
		self.assertEqual(recipe.items.count(), 0)

	def test_recipe_export_excel(self):
		from django.urls import reverse
		recipe = Recipe.objects.create(product=self.product)
		RecipeItem.objects.create(recipe=recipe, ingredient=self.ing_cf, quantity='0.025', unit='Kg')

		response = self.client.get(reverse('inventory:recipe_export_excel'))
		self.assertEqual(response.status_code, 200)
		self.assertEqual(response['Content-Type'], 'text/csv; charset=utf-8')
		content = response.content.decode('utf-8-sig')
		self.assertIn('Cà phê đen đá', content)
		self.assertIn('Cà phê Trung Nguyên', content)

	def test_recipe_import_excel(self):
		from django.urls import reverse
		csv_data = "CF-DEN\tCà phê đen đá\tCà phê & Đồ uống\tLy\t25000\t0\tMH002\tCà phê Trung Nguyên\t0.030\tKg\t120000\t3600\n"
		response = self.client.post(
			reverse('inventory:recipe_import_excel'),
			data={'csv_text': csv_data},
		)
		self.assertEqual(response.status_code, 200)
		data = response.json()
		self.assertTrue(data['success'])
		self.assertEqual(data['imported_count'], 1)
		self.product.refresh_from_db()
		self.assertEqual(int(self.product.cost_price), 3600)
