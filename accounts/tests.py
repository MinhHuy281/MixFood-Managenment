# File này chịu trách nhiệm kiểm thử tự động các luồng nghiệp vụ Đăng nhập, Đăng xuất và bảo toàn dữ liệu người dùng.
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse


class LogoutTests(TestCase):
    # Class này dùng để đóng gói bộ kịch bản kiểm thử tự động (Unit/Integration Tests) cho nhóm chức năng LogoutTests.
    def test_logout_redirects_to_login_without_deleting_user_data(self):
        # Hàm này dùng để kiểm thử kịch bản nghiệp vụ: logout redirects to login without deleting user data. Input: đối tượng test case (self). Output: xác nhận (assert) kết quả phản hồi HTTP và trạng thái dữ liệu trong CSDL.
        user = get_user_model().objects.create_user(username='cashier', password='safe-password')
        self.client.force_login(user)

        response = self.client.post(reverse('accounts:logout'))

        self.assertRedirects(response, reverse('accounts:login'))
        self.assertFalse('_auth_user_id' in self.client.session)
        self.assertTrue(get_user_model().objects.filter(pk=user.pk).exists())


class WarehouseAndCashierPermissionTests(TestCase):
    # Class này dùng để kiểm thử phân quyền Thu ngân (thungan1) bị chặn 4 chức năng kho và tài khoản Quản lý kho hàng (quanlykho) có toàn quyền xuất nhập kho.
    def setUp(self):
        # Hàm này dùng để khởi tạo tài khoản thungan1, quanlykho và admin phục vụ kiểm thử phân quyền. Input: self. Output: CSDL test.
        from accounts.models import UserProfile, UserSystemConfig
        User = get_user_model()
        self.cashier = User.objects.create_user(username='thungan1', password='123456')
        UserProfile.objects.create(user=self.cashier, full_name='Thu Ngân 1', department=UserProfile.Department.CASHIER)

        self.warehouse_user = User.objects.create_user(username='quanlykho', password='123456')
        UserProfile.objects.create(user=self.warehouse_user, full_name='Quản Lý Kho Hàng', department=UserProfile.Department.WAREHOUSE)

        self.admin_user = User.objects.create_superuser(username='admin', password='123456', email='admin@mixfood.vn')
        UserProfile.objects.create(user=self.admin_user, full_name='Quản Trị Viên', department=UserProfile.Department.ADMIN)
        self.cfg = UserSystemConfig.get_solo()

    def test_cashier_requires_elevation_for_4_inventory_modules_until_verified(self):
        # Hàm này dùng để kiểm thử thungan1 phải xác thực quyền Admin / Quản lý kho mới truy cập được Mặt hàng, Định lượng, Quản lý kho và Xuất nhập tồn.
        cashier_perms = self.cfg.get_user_permissions(self.cashier)
        self.assertFalse(cashier_perms['manage_inventory'])

        self.client.force_login(self.cashier)
        protected_urls = [
            reverse('catalog:ingredient_data_api'),
            reverse('inventory:recipe_data_api'),
            reverse('inventory:dashboard_api'),
        ]
        for url in protected_urls:
            resp = self.client.get(url)
            self.assertEqual(resp.status_code, 403)
            self.assertTrue(resp.json().get('require_elevation'))

        # Xác thực nâng quyền tạm thời bằng tài khoản quanlykho
        verify_resp = self.client.post(
            reverse('accounts:permission_api_verify'),
            data='{"username": "quanlykho", "password": "123456", "permission_key": "manage_inventory"}',
            content_type='application/json',
        )
        self.assertEqual(verify_resp.status_code, 200)
        self.assertTrue(verify_resp.json().get('authorized'))

        # Sau khi xác thực, thungan1 truy cập được cả 4 API kho
        for url in protected_urls:
            resp_ok = self.client.get(url)
            self.assertEqual(resp_ok.status_code, 200)

    def test_warehouse_manager_has_direct_inventory_access(self):
        # Hàm này dùng để kiểm thử tài khoản quanlykho truy cập trực tiếp Mặt hàng, Định lượng, Quản lý kho và Xuất nhập tồn không cần nâng quyền.
        wh_perms = self.cfg.get_user_permissions(self.warehouse_user)
        self.assertTrue(wh_perms['manage_inventory'])

        self.client.force_login(self.warehouse_user)
        for url in (
            reverse('catalog:ingredient_data_api'),
            reverse('inventory:recipe_data_api'),
            reverse('inventory:dashboard_api'),
            reverse('inventory:manage'),
            reverse('inventory:home'),
        ):
            resp = self.client.get(url)
            self.assertEqual(resp.status_code, 200)

    def test_pos_extra_features_apis_work(self):
        # Hàm này dùng để kiểm thử các API chức năng mở rộng trên POS (Mở két tiền, Thiết bị POS, Bảo trì, Khách hàng, Sổ thu chi, Công nợ, Báo cáo).
        self.client.force_login(self.admin_user)
        api_url = reverse('sales:pos_features_api')
        for mod in ('drawer', 'device', 'maintenance', 'customers', 'cashbook', 'debt', 'shift_assign', 'customer_revenue', 'purchases', 'cash_stats'):
            r = self.client.get(f'{api_url}?module={mod}')
            self.assertEqual(r.status_code, 200)
            self.assertTrue(r.json().get('ok'))

