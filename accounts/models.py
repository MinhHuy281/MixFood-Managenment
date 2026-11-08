# File này chịu trách nhiệm định nghĩa các model dữ liệu Hồ sơ người dùng (UserProfile), Vai trò, Bộ phận và Cấu hình phân quyền hệ thống (UserSystemConfig).
from django.conf import settings
from django.db import models


DEFAULT_PERMISSION_MATRIX = {
    'admin': {
        'cancel_received_item': True,
        'edit_item_price': True,
        'edit_delete_invoice': True,
        'reprint_invoice': True,
        'view_sales_report': True,
        'manage_inventory': True,
        'manage_cashbook': True,
        'manage_staff_shift': True,
        'manage_customers': True,
        'business_settings': True,
        'system_settings': True,
        'super_admin': True,
    },
    'manager': {
        'cancel_received_item': True,
        'edit_item_price': True,
        'edit_delete_invoice': True,
        'reprint_invoice': True,
        'view_sales_report': True,
        'manage_inventory': True,
        'manage_cashbook': True,
        'manage_staff_shift': True,
        'manage_customers': True,
        'business_settings': False,
        'system_settings': False,
        'super_admin': False,
    },
    'accountant': {
        'cancel_received_item': True,
        'edit_item_price': True,
        'edit_delete_invoice': True,
        'reprint_invoice': True,
        'view_sales_report': True,
        'manage_inventory': True,
        'manage_cashbook': True,
        'manage_staff_shift': False,
        'manage_customers': False,
        'business_settings': False,
        'system_settings': False,
        'super_admin': False,
    },
    'warehouse': {
        'cancel_received_item': False,
        'edit_item_price': False,
        'edit_delete_invoice': False,
        'reprint_invoice': False,
        'view_sales_report': False,
        'manage_inventory': True,
        'manage_cashbook': False,
        'manage_staff_shift': False,
        'manage_customers': False,
        'business_settings': False,
        'system_settings': False,
        'super_admin': False,
    },
    'cashier': {
        'cancel_received_item': True,
        'edit_item_price': True,
        'edit_delete_invoice': True,
        'reprint_invoice': True,
        'view_sales_report': True,
        'manage_inventory': False,
        'manage_cashbook': False,
        'manage_staff_shift': False,
        'manage_customers': False,
        'business_settings': False,
        'system_settings': False,
        'super_admin': False,
    },
    'kitchen': {
        'cancel_received_item': False,
        'edit_item_price': False,
        'edit_delete_invoice': False,
        'reprint_invoice': False,
        'view_sales_report': False,
        'manage_inventory': False,
        'manage_cashbook': False,
        'manage_staff_shift': False,
        'manage_customers': False,
        'business_settings': False,
        'system_settings': False,
        'super_admin': False,
    },
    'waiter': {
        'cancel_received_item': False,
        'edit_item_price': False,
        'edit_delete_invoice': False,
        'reprint_invoice': False,
        'view_sales_report': False,
        'manage_inventory': False,
        'manage_cashbook': False,
        'manage_staff_shift': False,
        'manage_customers': False,
        'business_settings': False,
        'system_settings': False,
        'super_admin': False,
    },
}

DEFAULT_EXTRA_OPTIONS = {
    'tablet_lock_transfer_split': False,
    'tablet_lock_receive_print': False,
    'tablet_lock_payment': False,
    'tablet_lock_discount_vip': False,
    'lock_edit_price_all_roles': False,
    'hide_shift_close_numbers': False,
}


class UserProfile(models.Model):
    # Class này dùng để quản lý model Hồ sơ mở rộng của người dùng (bộ phận làm việc, số điện thoại, trạng thái hoạt động).
    class Department(models.TextChoices):
        # Class này dùng để định nghĩa danh sách các bộ phận làm việc của nhân viên trong nhà hàng (Quản lý, Thu ngân, Phục vụ, Pha chế, Bếp).
        UNDEFINED = 'undefined', 'Không xác định'
        ADMIN = 'admin', 'Quản trị'
        MANAGER = 'manager', 'Quản lý'
        ACCOUNTANT = 'accountant', 'Kế toán'
        CASHIER = 'cashier', 'Thu ngân'
        KITCHEN = 'kitchen', 'Chế biến'
        WAITER = 'waiter', 'Phục vụ'
        WAREHOUSE = 'warehouse', 'Quản lý kho hàng'

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='profile',
        verbose_name='Tài khoản',
    )
    full_name = models.CharField('Họ tên', max_length=150, blank=True, default='')
    phone = models.CharField('Số điện thoại', max_length=30, blank=True, default='')
    department = models.CharField(
        'Bộ phận',
        max_length=50,
        choices=Department.choices,
        default=Department.UNDEFINED,
    )
    area_code = models.CharField('Khu vực / Mã', max_length=150, default='ALL', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Class này dùng để khai báo metadata cấu hình (tên hiển thị, sắp xếp mặc định, ràng buộc dữ liệu) cho model/form chứa nó.
        ordering = ('user__id',)
        verbose_name = 'Hồ sơ người dùng'
        verbose_name_plural = 'Hồ sơ người dùng'

    def __str__(self):
        # Hàm này dùng để trả về chuỗi biểu diễn tên định danh dễ đọc của đối tượng. Input: đối tượng hiện tại (self). Output: chuỗi ký tự (str) mô tả đối tượng.
        return f'{self.user.username} ({self.get_department_display()})'


class UserSystemConfig(models.Model):
    # Class này dùng để quản lý model Cấu hình phân quyền theo vai trò và các tùy chọn vận hành toàn hệ thống POS (Singleton).
    allow_numeric_password_only = models.BooleanField(
        'Cho phép chỉ cần nhập mật khẩu (dạng số) để truy cập',
        default=False,
    )
    permission_matrix = models.JSONField(
        'Ma trận phân quyền theo cấp bậc',
        default=dict,
        blank=True,
    )
    extra_options = models.JSONField(
        'Tùy chọn khóa mở rộng',
        default=dict,
        blank=True,
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Class này dùng để khai báo metadata cấu hình (tên hiển thị, sắp xếp mặc định, ràng buộc dữ liệu) cho model/form chứa nó.
        verbose_name = 'Cấu hình truy cập người dùng'
        verbose_name_plural = 'Cấu hình truy cập người dùng'

    @classmethod
    def get_solo(cls):
        # Hàm này dùng để thực hiện xử lý nghiệp vụ hỗ trợ 'get_solo' trong module models.py. Input: không có tham số đầu vào trực tiếp. Output: trả về dữ liệu đã chuẩn hóa/tính toán theo logic nghiệp vụ.
        obj, _ = cls.objects.get_or_create(pk=1)
        changed = False
        if not obj.permission_matrix:
            obj.permission_matrix = DEFAULT_PERMISSION_MATRIX
            changed = True
        else:
            # Đảm bảo đủ tất cả role & key mặc định
            merged = {}
            for role_key, defaults in DEFAULT_PERMISSION_MATRIX.items():
                current_role = obj.permission_matrix.get(role_key, {})
                merged[role_key] = {**defaults, **current_role}
                if role_key == 'admin':
                    # Quản trị luôn có toàn quyền
                    merged['admin'] = {k: True for k in defaults}
            if merged != obj.permission_matrix:
                obj.permission_matrix = merged
                changed = True

        if not obj.extra_options:
            obj.extra_options = DEFAULT_EXTRA_OPTIONS
            changed = True
        else:
            merged_extra = {**DEFAULT_EXTRA_OPTIONS, **obj.extra_options}
            if merged_extra != obj.extra_options:
                obj.extra_options = merged_extra
                changed = True

        if changed:
            obj.save()
        return obj

    def get_user_permissions(self, user):
        # Hàm này dùng để: Trả về dict quyền hạn của một user dựa trên bộ phận (department). (Input: user; Output: kết quả xử lý hoặc HttpResponse/JsonResponse tương ứng).
        if not user or not user.is_authenticated:
            return {k: False for k in DEFAULT_PERMISSION_MATRIX['admin']}
        if user.is_superuser or user.username.lower() == 'admin':
            perms = dict(DEFAULT_PERMISSION_MATRIX['admin'])
        else:
            profile = getattr(user, 'profile', None)
            dept = profile.department if profile else 'cashier'
            if dept == 'undefined':
                dept = 'cashier'
            matrix = self.permission_matrix or DEFAULT_PERMISSION_MATRIX
            if dept == 'warehouse' or user.groups.filter(name='Warehouse').exists():
                perms = dict(matrix.get('warehouse', DEFAULT_PERMISSION_MATRIX['warehouse']))
                perms['manage_inventory'] = True
            else:
                perms = dict(matrix.get(dept, DEFAULT_PERMISSION_MATRIX['cashier']))
                if dept == 'cashier' or user.username.lower().startswith('thungan'):
                    perms['manage_inventory'] = False
                    perms['business_settings'] = False
                    perms['system_settings'] = False
                    perms['super_admin'] = False

        extra = self.extra_options or DEFAULT_EXTRA_OPTIONS
        if extra.get('lock_edit_price_all_roles'):
            perms['edit_item_price'] = False
        return perms
