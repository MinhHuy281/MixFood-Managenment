# File này chịu trách nhiệm kiểm thử tự động quy trình Thanh toán POS, Quản lý & Chỉnh sửa Hóa đơn, Thao tác bàn (Chuyển/Ghép/Tách/Đặt bàn) và Thống kê doanh thu.
import json
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.urls import reverse

from catalog.models import Category, Ingredient, Product
from dining.models import Area, DiningTable
from inventory.models import Recipe, RecipeItem, StockTransaction

from .models import Invoice, Order, OrderItem, Payment


class CheckoutTests(TestCase):
    # Class này dùng để đóng gói bộ kịch bản kiểm thử tự động (Unit/Integration Tests) cho nhóm chức năng CheckoutTests.
    def setUp(self):
        # Hàm này dùng để khởi tạo dữ liệu mẫu (tài khoản, danh mục, bàn, món ăn, nguyên liệu) trước mỗi ca kiểm thử. Input: self. Output: thiết lập trạng thái CSDL phục vụ test.
        self.user = get_user_model().objects.create_user('cashier-test', password='test-password')
        self.sales_group = Group.objects.create(name='Sales')
        self.user.groups.add(self.sales_group)
        self.category = Category.objects.create(name='Pad Thai')
        self.product = Product.objects.create(category=self.category, code='PT-TEST', name='Pad Thai test', unit='Phần', price=95000)
        self.area = Area.objects.create(name='Trong nhà')
        self.table = DiningTable.objects.create(area=self.area, name='1', code='TN-01')
        self.client.force_login(self.user)

    def test_checkout_creates_order_invoice_payment_and_frees_table(self):
        # Hàm này dùng để kiểm thử kịch bản nghiệp vụ: checkout creates order invoice payment and frees table. Input: đối tượng test case (self). Output: xác nhận (assert) kết quả phản hồi HTTP và trạng thái dữ liệu trong CSDL.
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
        # Hàm này dùng để kiểm thử kịch bản nghiệp vụ: invalid product does not create partial order. Input: đối tượng test case (self). Output: xác nhận (assert) kết quả phản hồi HTTP và trạng thái dữ liệu trong CSDL.
        response = self.client.post(reverse('sales:checkout'), data=json.dumps({
            'table_id': self.table.pk,
            'items': [{'product_id': 999999, 'quantity': 1}],
        }), content_type='application/json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Order.objects.count(), 0)

    def test_checkout_requires_sales_role(self):
        # Hàm này dùng để kiểm thử kịch bản nghiệp vụ: checkout requires sales role. Input: đối tượng test case (self). Output: xác nhận (assert) kết quả phản hồi HTTP và trạng thái dữ liệu trong CSDL.
        self.user.groups.clear()
        response = self.client.post(reverse('sales:checkout'), data=json.dumps({
            'table_id': self.table.pk,
            'items': [{'product_id': self.product.pk, 'quantity': 1}],
        }), content_type='application/json')
        self.assertEqual(response.status_code, 403)

    def test_checkout_rejects_discount_above_subtotal(self):
        # Hàm này dùng để kiểm thử kịch bản nghiệp vụ: checkout rejects discount above subtotal. Input: đối tượng test case (self). Output: xác nhận (assert) kết quả phản hồi HTTP và trạng thái dữ liệu trong CSDL.
        response = self.client.post(reverse('sales:checkout'), data=json.dumps({
            'table_id': self.table.pk,
            'discount_amount': 95001,
            'items': [{'product_id': self.product.pk, 'quantity': 1}],
        }), content_type='application/json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Order.objects.count(), 0)

    def test_checkout_merges_duplicate_product_items(self):
        # Hàm này dùng để kiểm thử kịch bản nghiệp vụ: checkout merges duplicate product items. Input: đối tượng test case (self). Output: xác nhận (assert) kết quả phản hồi HTTP và trạng thái dữ liệu trong CSDL.
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
        # Hàm này dùng để kiểm thử kịch bản nghiệp vụ: checkout deducts recipe ingredients. Input: đối tượng test case (self). Output: xác nhận (assert) kết quả phản hồi HTTP và trạng thái dữ liệu trong CSDL.
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
    # Class này dùng để đóng gói bộ kịch bản kiểm thử tự động (Unit/Integration Tests) cho nhóm chức năng InvoiceListTests.
    def setUp(self):
        # Hàm này dùng để khởi tạo dữ liệu mẫu (tài khoản, danh mục, bàn, món ăn, nguyên liệu) trước mỗi ca kiểm thử. Input: self. Output: thiết lập trạng thái CSDL phục vụ test.
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
        # Hàm này dùng để kiểm thử kịch bản nghiệp vụ: invoice list html view. Input: đối tượng test case (self). Output: xác nhận (assert) kết quả phản hồi HTTP và trạng thái dữ liệu trong CSDL.
        response = self.client.get(reverse('sales:invoices'))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, '00255')
        self.assertContains(response, '65.000')

    def test_invoice_list_json_api(self):
        # Hàm này dùng để kiểm thử kịch bản nghiệp vụ: invoice list json api. Input: đối tượng test case (self). Output: xác nhận (assert) kết quả phản hồi HTTP và trạng thái dữ liệu trong CSDL.
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
        # Hàm này dùng để kiểm thử kịch bản nghiệp vụ: invoice list excel export. Input: đối tượng test case (self). Output: xác nhận (assert) kết quả phản hồi HTTP và trạng thái dữ liệu trong CSDL.
        response = self.client.get(reverse('sales:invoices'), {'export': 'excel'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'text/csv; charset=utf-8')
        content = response.content.decode('utf-8-sig')
        self.assertIn('Số HĐ,Thời gian,Nhân viên', content)
        self.assertIn('00255', content)
        self.assertIn('Tầng 2,14,TÝĐB (2)', content)


class InvoiceEditTests(TestCase):
    # Class này dùng để đóng gói bộ kịch bản kiểm thử tự động (Unit/Integration Tests) cho nhóm chức năng InvoiceEditTests.
    def setUp(self):
        # Hàm này dùng để khởi tạo dữ liệu mẫu (tài khoản, danh mục, bàn, món ăn, nguyên liệu) trước mỗi ca kiểm thử. Input: self. Output: thiết lập trạng thái CSDL phục vụ test.
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
        # Hàm này dùng để kiểm thử kịch bản nghiệp vụ: invoice detail api success. Input: đối tượng test case (self). Output: xác nhận (assert) kết quả phản hồi HTTP và trạng thái dữ liệu trong CSDL.
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
        # Hàm này dùng để kiểm thử kịch bản nghiệp vụ: invoice detail api not found. Input: đối tượng test case (self). Output: xác nhận (assert) kết quả phản hồi HTTP và trạng thái dữ liệu trong CSDL.
        url = reverse('sales:invoice_detail_api', kwargs={'invoice_code': '999999'})
        response = self.client.get(url)
        self.assertEqual(response.status_code, 404)
        data = response.json()
        self.assertFalse(data['ok'])

    def test_edit_invoice_success_and_logs_activity(self):
        # Hàm này dùng để kiểm thử kịch bản nghiệp vụ: edit invoice success and logs activity. Input: đối tượng test case (self). Output: xác nhận (assert) kết quả phản hồi HTTP và trạng thái dữ liệu trong CSDL.
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
        # Hàm này dùng để kiểm thử kịch bản nghiệp vụ: edit invoice requires reason. Input: đối tượng test case (self). Output: xác nhận (assert) kết quả phản hồi HTTP và trạng thái dữ liệu trong CSDL.
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
        # Hàm này dùng để kiểm thử kịch bản nghiệp vụ: edit invoice requires items. Input: đối tượng test case (self). Output: xác nhận (assert) kết quả phản hồi HTTP và trạng thái dữ liệu trong CSDL.
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
        # Hàm này dùng để kiểm thử kịch bản nghiệp vụ: sales statistics api. Input: đối tượng test case (self). Output: xác nhận (assert) kết quả phản hồi HTTP và trạng thái dữ liệu trong CSDL.
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
        # Hàm này dùng để kiểm thử kịch bản nghiệp vụ: sales statistics export. Input: đối tượng test case (self). Output: xác nhận (assert) kết quả phản hồi HTTP và trạng thái dữ liệu trong CSDL.
        url = reverse('sales:statistics_export')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertIn('text/csv', response['Content-Type'])
        self.assertTrue(response.has_header('Content-Disposition'))

    def test_sales_statistics_print(self):
        # Hàm này dùng để kiểm thử kịch bản nghiệp vụ: sales statistics print. Input: đối tượng test case (self). Output: xác nhận (assert) kết quả phản hồi HTTP và trạng thái dữ liệu trong CSDL.
        url = reverse('sales:statistics_print')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'print-container')
        self.assertContains(response, 'summary-box')

    def test_delete_invoice_logs_reason_like_edit(self):
        # Hàm này dùng để kiểm thử kịch bản nghiệp vụ: delete invoice logs reason like edit. Input: đối tượng test case (self). Output: xác nhận (assert) kết quả phản hồi HTTP và trạng thái dữ liệu trong CSDL.
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
        # Hàm này dùng để kiểm thử kịch bản nghiệp vụ: table actions reserve transfer import combine split. Input: đối tượng test case (self). Output: xác nhận (assert) kết quả phản hồi HTTP và trạng thái dữ liệu trong CSDL.
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


class TableOrderSyncTests(TestCase):
    # Class này dùng để kiểm thử tự động việc đồng bộ đơn gọi món của bàn ăn và thêm món sau khi gửi bếp.
    def setUp(self):
        self.user = get_user_model().objects.create_user('cashier-sync', password='test-password')
        self.sales_group = Group.objects.create(name='Sales')
        self.user.groups.add(self.sales_group)
        self.category = Category.objects.create(name='Món hấp')
        self.product1 = Product.objects.create(category=self.category, code='BTHAP', name='Bạch tuộc hấp', unit='Phần', price=75000)
        self.product2 = Product.objects.create(category=self.category, code='THAP', name='Tôm hấp', unit='Phần', price=80000)
        self.product3 = Product.objects.create(category=self.category, code='NH', name='Nghêu hấp', unit='Phần', price=60000)
        self.area = Area.objects.create(name='Ngoài trời')
        self.table = DiningTable.objects.create(area=self.area, name='Bàn 1', code='NT-01')
        self.client.force_login(self.user)

    def test_sync_order_initial_and_subsequent_items(self):
        url = reverse('sales:table_order_sync_api')
        # 1. Thêm món ban đầu và gửi bếp
        resp1 = self.client.post(url, data=json.dumps({
            'table_id': self.table.pk,
            'items': [
                {'product_id': self.product1.pk, 'name': self.product1.name, 'quantity': 1, 'price': 75000},
                {'product_id': self.product2.pk, 'name': self.product2.name, 'quantity': 3, 'price': 80000},
            ],
            'is_kitchen_send': True,
        }), content_type='application/json')
        self.assertEqual(resp1.status_code, 200)
        self.assertTrue(resp1.json()['ok'])

        # Kiểm tra Order trong CSDL
        order = Order.objects.get(table=self.table, status=Order.Status.CONFIRMED)
        self.assertEqual(order.items.count(), 2)
        self.assertEqual(order.total_amount, 315000)
        self.table.refresh_from_db()
        self.assertEqual(self.table.status, DiningTable.Status.OCCUPIED)

        # 2. Khách gọi THÊM món sau khi đã gửi bếp: Thêm 1 Nghêu hấp (60.000)
        resp2 = self.client.post(url, data=json.dumps({
            'table_id': self.table.pk,
            'items': [
                {'product_id': self.product1.pk, 'name': self.product1.name, 'quantity': 1, 'price': 75000},
                {'product_id': self.product2.pk, 'name': self.product2.name, 'quantity': 3, 'price': 80000},
                {'product_id': self.product3.pk, 'name': self.product3.name, 'quantity': 1, 'price': 60000},
            ],
            'is_kitchen_send': True,
        }), content_type='application/json')
        self.assertEqual(resp2.status_code, 200)

        # Kiểm tra Order sau khi thêm món sau
        order.refresh_from_db()
        self.assertEqual(order.items.count(), 3)
        self.assertEqual(order.total_amount, 375000)

        # 3. Kiểm tra Admin xem chi tiết bàn nhận đủ 3 món
        self.user.is_superuser = True
        self.user.save()
        self.client.cookies["admin_sessionid"] = self.client.cookies["sessionid"].value
        admin_table_resp = self.client.get(f'/admin/table-detail/{self.table.pk}/', HTTP_HOST='127.0.0.1')
        self.assertEqual(admin_table_resp.status_code, 200)
        admin_data = admin_table_resp.json()
        self.assertTrue(admin_data['has_order'])
        self.assertEqual(len(admin_data['order']['items']), 3)
        self.assertEqual(admin_data['order']['total'], 375000)

        # 4. Thu ngân thanh toán hóa đơn hoàn tất
        checkout_resp = self.client.post(reverse('sales:checkout'), data=json.dumps({
            'table_id': self.table.pk,
            'payment_method': Payment.Method.CASH,
            'items': [
                {'product_id': self.product1.pk, 'quantity': 1},
                {'product_id': self.product2.pk, 'quantity': 3},
                {'product_id': self.product3.pk, 'quantity': 1},
            ],
        }), content_type='application/json')
        self.assertEqual(checkout_resp.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.PAID)
        self.assertEqual(order.total_amount, 375000)
        self.table.refresh_from_db()
        self.assertEqual(self.table.status, DiningTable.Status.AVAILABLE)

    def test_invoice_edit_adjusts_inventory_stock(self):
        # Hàm này dùng để kiểm thử tính năng: Sửa hóa đơn (trả món hoặc tăng số lượng) tự động hoàn trả hoặc trừ kho tương ứng.
        pepsi_ing = Ingredient.objects.create(
            code='NL-TEST-PEPSI',
            name='Nước ngọt Pepsi lon 320ml',
            unit='Thùng',
            unpacked_unit='lon',
            pack_size=Decimal('24'),
            current_stock=Decimal('5'),
            prep_stock=Decimal('48'),
            average_cost=Decimal('195000')
        )
        pepsi_prod = Product.objects.create(
            category=self.category,
            code='DU-PEPSI',
            name='Pepsi',
            unit='Lon',
            price=15000
        )
        recipe = Recipe.objects.create(product=pepsi_prod)
        RecipeItem.objects.create(recipe=recipe, ingredient=pepsi_ing, quantity=Decimal('1'), unit='lon')

        # 1. Bán 2 lon Pepsi
        checkout_resp = self.client.post(reverse('sales:checkout'), data=json.dumps({
            'table_id': self.table.pk,
            'payment_method': Payment.Method.CASH,
            'items': [{'product_id': pepsi_prod.pk, 'quantity': 2}],
        }), content_type='application/json')
        self.assertEqual(checkout_resp.status_code, 200)

        pepsi_ing.refresh_from_db()
        # 48 - 2 = 46 lon
        self.assertEqual(pepsi_ing.prep_stock, Decimal('46'))
        self.assertEqual(pepsi_ing.portions_wait_display, '46 lon đang chờ bán')

        invoice = Invoice.objects.filter(order__items__product=pepsi_prod).first()
        self.assertIsNotNone(invoice)

        # 2. Sửa hóa đơn: Giảm Pepsi từ 2 lon về 1 lon (trả 1 lon)
        edit_resp1 = self.client.post(reverse('sales:edit_invoice'), data=json.dumps({
            'invoice_code': invoice.invoice_code,
            'reason': 'Khách trả bớt 1 lon',
            'items': [{'product_id': pepsi_prod.pk, 'quantity': 1, 'unit_price': 15000}],
        }), content_type='application/json')
        self.assertEqual(edit_resp1.status_code, 200)

        pepsi_ing.refresh_from_db()
        # 46 + 1 = 47 lon
        self.assertEqual(pepsi_ing.prep_stock, Decimal('47'))
        self.assertEqual(pepsi_ing.portions_wait_display, '47 lon đang chờ bán')

        # 3. Sửa hóa đơn: Tăng Pepsi từ 1 lon lên 3 lon
        edit_resp2 = self.client.post(reverse('sales:edit_invoice'), data=json.dumps({
            'invoice_code': invoice.invoice_code,
            'reason': 'Khách lấy thêm 2 lon',
            'items': [{'product_id': pepsi_prod.pk, 'quantity': 3, 'unit_price': 15000}],
        }), content_type='application/json')
        self.assertEqual(edit_resp2.status_code, 200)

        pepsi_ing.refresh_from_db()
        # 47 - 2 = 45 lon
        self.assertEqual(pepsi_ing.prep_stock, Decimal('45'))
        self.assertEqual(pepsi_ing.portions_wait_display, '45 lon đang chờ bán')

        # 4. Sửa hóa đơn: Đổi sang món ăn Bạch tuộc hấp (Pepsi = 0)
        edit_resp3 = self.client.post(reverse('sales:edit_invoice'), data=json.dumps({
            'invoice_code': invoice.invoice_code,
            'reason': 'Khách đổi sang món ăn',
            'items': [
                {'product_id': pepsi_prod.pk, 'quantity': 0, 'unit_price': 15000},
                {'product_id': self.product1.pk, 'quantity': 1, 'unit_price': 75000},
            ],
        }), content_type='application/json')
        self.assertEqual(edit_resp3.status_code, 200)

        pepsi_ing.refresh_from_db()
        # Toàn bộ 3 lon đã hoàn trả về kho -> 45 + 3 = 48 lon
        self.assertEqual(pepsi_ing.prep_stock, Decimal('48'))
        self.assertEqual(pepsi_ing.portions_wait_display, '48 lon đang chờ bán')


class ThermalBillAndShiftReportTests(TestCase):
    # Class này dùng để kiểm thử tự động các chức năng in bill nhiệt K80: Thanh toán kèm mã QR cửa hàng, In lại hóa đơn, Báo cáo kết ca và Báo cáo cuối ngày cho cả 2 ca thungan1 & thungan2.
    def setUp(self):
        # Hàm này dùng để khởi tạo dữ liệu cho 2 thu ngân thungan1 và thungan2, bàn ăn và món ăn mẫu.
        User = get_user_model()
        self.cashier_group, _ = Group.objects.get_or_create(name='Cashier')
        self.sales_group, _ = Group.objects.get_or_create(name='Sales')

        self.thungan1 = User.objects.create_user('thungan1', password='123456', first_name='Thu Ngân', last_name='1')
        self.thungan1.groups.add(self.cashier_group, self.sales_group)

        self.thungan2 = User.objects.create_user('thungan2', password='123456', first_name='Thu Ngân', last_name='2')
        self.thungan2.groups.add(self.cashier_group, self.sales_group)

        self.category = Category.objects.create(name='Khai vị')
        self.dish1 = Product.objects.create(category=self.category, code='PTOM', name='Phồng tôm', unit='Phần', price=15000)
        self.dish2 = Product.objects.create(category=self.category, code='PTHS', name='Pad Thai hải sản', unit='Phần', price=90000)
        self.area = Area.objects.create(name='Ngoài trời')
        self.table = DiningTable.objects.create(area=self.area, name='2', code='NT-02')

    def test_checkout_returns_thermal_bill_with_qr_and_print_page_works(self):
        # Hàm này dùng để kiểm thử thanh toán trả về đầy đủ dữ liệu bill K80 kèm QR cửa hàng và trang in lại hóa đơn hoạt động chuẩn.
        self.client.force_login(self.thungan2)
        resp = self.client.post(
            reverse('sales:checkout'),
            data=json.dumps({
                'table_id': self.table.pk,
                'payment_method': Payment.Method.BANK,
                'discount_amount': 10500,
                'items': [
                    {'product_id': self.dish1.pk, 'quantity': 1, 'unit_price': 15000},
                    {'product_id': self.dish2.pk, 'quantity': 1, 'unit_price': 90000},
                ],
            }),
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn('bill', data)
        bill = data['bill']
        self.assertEqual(bill['table_display'], 'Bàn 2 (Ngoài trời)')
        self.assertEqual(bill['subtotal_formatted'], '105.000')
        self.assertEqual(bill['discount_formatted'], '10.500')
        self.assertEqual(bill['discount_percent_label'], '10%')
        self.assertEqual(bill['total_amount_formatted'], '94.500')
        self.assertEqual(bill['qr_info']['account_number'], '1903 6559 2140 22')
        self.assertEqual(bill['qr_info']['merchant_title'], 'HKD MIX FOOD')

        # Kiểm tra trang in bill K80 (/sales/invoices/print/<code/>)
        print_resp = self.client.get(reverse('sales:invoice_print', kwargs={'invoice_code': data['invoice_code']}))
        self.assertEqual(print_resp.status_code, 200)
        self.assertContains(print_resp, 'Bàn 2 (Ngoài trời)')
        self.assertContains(print_resp, 'PHỒNG TÔM (Phần)')
        self.assertContains(print_resp, '1903 6559 2140 22')
        self.assertContains(print_resp, 'HÂN HẠNH ĐƯỢC PHỤC VỤ QUÝ KHÁCH!')

    def test_close_shift_returns_thermal_shift_report_and_opens_next_shift(self):
        # Hàm này dùng để kiểm thử kết ca trả về phiếu nhiệt BÁO CÁO KẾT CA và tự động mở ca tiếp theo.
        from .models import Shift

        self.client.force_login(self.thungan1)
        self.client.post(
            reverse('sales:checkout'),
            data=json.dumps({
                'table_id': self.table.pk,
                'payment_method': Payment.Method.BANK,
                'items': [{'product_id': self.dish2.pk, 'quantity': 2}],
            }),
            content_type='application/json',
        )
        close_resp = self.client.post(
            reverse('dashboard:close_shift'),
            data=json.dumps({'unpaid_count': 4, 'unpaid_amount': 423400}),
            content_type='application/json',
        )
        self.assertEqual(close_resp.status_code, 200)
        res_data = close_resp.json()
        self.assertTrue(res_data['ok'])
        self.assertIn('shift_report', res_data)
        s_rep = res_data['shift_report']
        self.assertEqual(s_rep['title'], 'BÁO CÁO KẾT CA')
        self.assertEqual(s_rep['total_invoices'], 1)
        self.assertEqual(s_rep['total_revenue_formatted'], '180.000')
        self.assertEqual(s_rep['unpaid_count'], 4)
        self.assertEqual(s_rep['unpaid_amount_formatted'], '423.400')
        self.assertTrue(Shift.objects.filter(status=Shift.Status.OPEN).exists())

        # Kiểm tra trang in báo cáo kết ca
        shift_print_resp = self.client.get(s_rep['print_url'])
        self.assertEqual(shift_print_resp.status_code, 200)
        self.assertContains(shift_print_resp, 'BÁO CÁO KẾT CA')
        self.assertContains(shift_print_resp, '423.400')

    def test_end_of_day_report_includes_both_shifts_thungan1_and_thungan2(self):
        # Hàm này dùng để kiểm thử Báo cáo cuối ngày tổng hợp đầy đủ cả 2 ca thungan1 (Ca 1) và thungan2 (Ca 2).
        # Ca 1 (thungan1) bán 1 đơn 90.000 đ (Tiền mặt)
        self.client.force_login(self.thungan1)
        self.client.post(
            reverse('sales:checkout'),
            data=json.dumps({
                'table_id': self.table.pk,
                'payment_method': Payment.Method.CASH,
                'items': [{'product_id': self.dish2.pk, 'quantity': 1}],
            }),
            content_type='application/json',
        )

        # Ca 2 (thungan2) bán 1 đơn 180.000 đ (Chuyển khoản)
        self.client.force_login(self.thungan2)
        self.client.post(
            reverse('sales:checkout'),
            data=json.dumps({
                'table_id': self.table.pk,
                'payment_method': Payment.Method.BANK,
                'items': [{'product_id': self.dish2.pk, 'quantity': 2}],
            }),
            content_type='application/json',
        )

        eod_api_resp = self.client.get(reverse('sales:end_of_day_api'))
        self.assertEqual(eod_api_resp.status_code, 200)
        eod = eod_api_resp.json()
        self.assertTrue(eod['ok'])
        self.assertEqual(eod['total_invoices'], 2)
        self.assertEqual(eod['total_revenue_formatted'], '270.000')
        self.assertIn('shifts_by_key', eod)
        self.assertEqual(eod['shifts_by_key']['thungan1']['total_invoices'], 1)
        self.assertEqual(eod['shifts_by_key']['thungan1']['total_revenue_formatted'], '90.000')
        self.assertEqual(eod['shifts_by_key']['thungan2']['total_invoices'], 1)
        self.assertEqual(eod['shifts_by_key']['thungan2']['total_revenue_formatted'], '180.000')

        # Kiểm tra trang in Báo cáo cuối ngày hiển thị cả Ca 1 (thungan1) và Ca 2 (thungan2)
        eod_print_resp = self.client.get(reverse('sales:end_of_day_print'))
        self.assertEqual(eod_print_resp.status_code, 200)
        self.assertContains(eod_print_resp, 'Ca 1 - Thu Ngân 1 (thungan1)')
        self.assertContains(eod_print_resp, 'Ca 2 - Thu Ngân 2 (thungan2)')
        self.assertContains(eod_print_resp, '270.000 đ')


