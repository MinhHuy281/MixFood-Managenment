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
from django.test import TestCase

# Create your tests here.
