# File này chịu trách nhiệm kiểm thử tự động các dịch vụ Nhập kho, Xuất kho, Trừ định lượng khi bán hàng và Quản lý Công thức món (BOM).
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase

from catalog.models import Category, Ingredient, Product

from .models import Recipe, RecipeItem, StockReceipt, StockReceiptItem, StockTransaction
from .services import deduct_for_sale, receive_stock


class InventoryServiceTests(TestCase):
    # Class này dùng để đóng gói bộ kịch bản kiểm thử tự động (Unit/Integration Tests) cho nhóm chức năng InventoryServiceTests.
    def setUp(self):
        # Hàm này dùng để khởi tạo dữ liệu mẫu (tài khoản, danh mục, bàn, món ăn, nguyên liệu) trước mỗi ca kiểm thử. Input: self. Output: thiết lập trạng thái CSDL phục vụ test.
        self.user = get_user_model().objects.create_user('warehouse-test', password='test-password')
        category = Category.objects.create(name='Món test')
        self.product = Product.objects.create(category=category, code='TEST-INV', name='Món test', price=50000)
        self.ingredient = Ingredient.objects.create(code='ING-TEST', name='Nguyên liệu test', unit='Kg', current_stock=5, average_cost=10000)

    def test_receive_stock_updates_balance_average_cost_and_history(self):
        # Hàm này dùng để kiểm thử kịch bản nghiệp vụ: receive stock updates balance average cost and history. Input: đối tượng test case (self). Output: xác nhận (assert) kết quả phản hồi HTTP và trạng thái dữ liệu trong CSDL.
        receipt = StockReceipt.objects.create(receipt_code='PN-TEST', created_by=self.user)
        StockReceiptItem.objects.create(receipt=receipt, ingredient=self.ingredient, quantity=3, unit_cost=20000)
        receive_stock(receipt, self.user)
        self.ingredient.refresh_from_db()
        receipt.refresh_from_db()
        self.assertEqual(self.ingredient.current_stock, 8)
        self.assertEqual(receipt.status, StockReceipt.Status.CONFIRMED)
        self.assertEqual(StockTransaction.objects.count(), 1)

    def test_sale_deducts_recipe_quantity(self):
        # Hàm này dùng để kiểm thử kịch bản nghiệp vụ: sale deducts recipe quantity. Input: đối tượng test case (self). Output: xác nhận (assert) kết quả phản hồi HTTP và trạng thái dữ liệu trong CSDL.
        recipe = Recipe.objects.create(product=self.product)
        RecipeItem.objects.create(recipe=recipe, ingredient=self.ingredient, quantity='0.5', unit='Kg')
        class Item:
            # Class này dùng để giả lập đối tượng dòng món ăn (Mock OrderItem) phục vụ kiểm thử đơn vị dịch vụ trừ kho.
            product_id = self.product.pk
            quantity = 2
        transactions = deduct_for_sale([Item()], self.user, 123)
        self.ingredient.refresh_from_db()
        self.assertEqual(self.ingredient.current_stock, 4)
        self.assertEqual(len(transactions), 1)

    def test_sale_rejects_insufficient_stock_without_changing_balance(self):
        # Hàm này dùng để kiểm thử kịch bản nghiệp vụ: sale rejects insufficient stock without changing balance. Input: đối tượng test case (self). Output: xác nhận (assert) kết quả phản hồi HTTP và trạng thái dữ liệu trong CSDL.
        recipe = Recipe.objects.create(product=self.product)
        RecipeItem.objects.create(recipe=recipe, ingredient=self.ingredient, quantity='10', unit='Kg')
        class Item:
            # Class này dùng để giả lập đối tượng dòng món ăn (Mock OrderItem) phục vụ kiểm thử đơn vị dịch vụ trừ kho.
            product_id = self.product.pk
            quantity = 1
        with self.assertRaises(ValidationError):
            deduct_for_sale([Item()], self.user, 123)
        self.ingredient.refresh_from_db()
        self.assertEqual(self.ingredient.current_stock, 5)
        self.assertEqual(StockTransaction.objects.count(), 0)


class RecipeAdminTests(TestCase):
    # Class này dùng để đóng gói bộ kịch bản kiểm thử tự động (Unit/Integration Tests) cho nhóm chức năng RecipeAdminTests.
    def setUp(self):
        # Hàm này dùng để khởi tạo dữ liệu mẫu (tài khoản, danh mục, bàn, món ăn, nguyên liệu) trước mỗi ca kiểm thử. Input: self. Output: thiết lập trạng thái CSDL phục vụ test.
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
        # Hàm này dùng để kiểm thử kịch bản nghiệp vụ: recipe list page renders. Input: đối tượng test case (self). Output: xác nhận (assert) kết quả phản hồi HTTP và trạng thái dữ liệu trong CSDL.
        from django.urls import reverse
        response = self.client.get(reverse('inventory:recipes'))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Định lượng nguyên liệu')
        self.assertTrue(any(p.name == 'Cà phê đen đá' for p in response.context['products']))

    def test_recipe_data_api(self):
        # Hàm này dùng để kiểm thử kịch bản nghiệp vụ: recipe data api. Input: đối tượng test case (self). Output: xác nhận (assert) kết quả phản hồi HTTP và trạng thái dữ liệu trong CSDL.
        from django.urls import reverse
        response = self.client.get(reverse('inventory:recipe_data_api'))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('products', data)
        self.assertIn('ingredients', data)
        self.assertIn('categories', data)
        self.assertEqual(len(data['products']), 1)

    def test_recipe_save_item_recalculates_cost_price(self):
        # Hàm này dùng để kiểm thử kịch bản nghiệp vụ: recipe save item recalculates cost price. Input: đối tượng test case (self). Output: xác nhận (assert) kết quả phản hồi HTTP và trạng thái dữ liệu trong CSDL.
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
        # Hàm này dùng để kiểm thử kịch bản nghiệp vụ: recipe delete item api. Input: đối tượng test case (self). Output: xác nhận (assert) kết quả phản hồi HTTP và trạng thái dữ liệu trong CSDL.
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
        # Hàm này dùng để kiểm thử kịch bản nghiệp vụ: recipe delete recipe api. Input: đối tượng test case (self). Output: xác nhận (assert) kết quả phản hồi HTTP và trạng thái dữ liệu trong CSDL.
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
        # Hàm này dùng để kiểm thử kịch bản nghiệp vụ: recipe export excel. Input: đối tượng test case (self). Output: xác nhận (assert) kết quả phản hồi HTTP và trạng thái dữ liệu trong CSDL.
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
        # Hàm này dùng để kiểm thử kịch bản nghiệp vụ: recipe import excel. Input: đối tượng test case (self). Output: xác nhận (assert) kết quả phản hồi HTTP và trạng thái dữ liệu trong CSDL.
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
