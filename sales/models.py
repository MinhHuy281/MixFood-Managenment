# File này chịu trách nhiệm định nghĩa các model nghiệp vụ Bán hàng: Đơn gọi món (Order, OrderItem), Hóa đơn (Invoice), Thanh toán (Payment) và Ca thu ngân (Shift).
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

from catalog.models import Product
from dining.models import DiningTable


class Order(models.Model):
    # Class này dùng để quản lý model Đơn hàng / Phiếu gọi món tại bàn hoặc mang về (trạng thái mở, đã gửi bếp, đã thanh toán, đã hủy).
    class OrderType(models.TextChoices):
        # Class này dùng để định nghĩa hình thức phục vụ của đơn hàng (Ăn tại bàn hoặc Mang về).
        DINE_IN = 'dine_in', 'Ăn tại quán'
        TAKEAWAY = 'takeaway', 'Mang về'
        DELIVERY = 'delivery', 'Giao hàng'

    class Status(models.TextChoices):
        # Class này dùng để định nghĩa tập hợp các trạng thái vòng đời hợp lệ của đối tượng dữ liệu.
        DRAFT = 'draft', 'Đang gọi món'
        CONFIRMED = 'confirmed', 'Đã xác nhận'
        PAID = 'paid', 'Đã thanh toán'
        CANCELLED = 'cancelled', 'Đã hủy'

    order_code = models.CharField('Mã đơn', max_length=30, unique=True)
    table = models.ForeignKey(DiningTable, on_delete=models.PROTECT, related_name='orders', null=True, blank=True)
    order_type = models.CharField('Loại đơn', max_length=20, choices=OrderType.choices, default=OrderType.DINE_IN)
    status = models.CharField('Trạng thái', max_length=20, choices=Status.choices, default=Status.DRAFT)
    note = models.TextField('Ghi chú', blank=True)
    subtotal = models.DecimalField('Tiền món', max_digits=12, decimal_places=0, default=0, validators=[MinValueValidator(0)])
    discount_amount = models.DecimalField('Giảm giá', max_digits=12, decimal_places=0, default=0, validators=[MinValueValidator(0)])
    surcharge_amount = models.DecimalField('Phụ thu', max_digits=12, decimal_places=0, default=0, validators=[MinValueValidator(0)])
    tax_amount = models.DecimalField('VAT', max_digits=12, decimal_places=0, default=0, validators=[MinValueValidator(0)])
    total_amount = models.DecimalField('Tổng tiền', max_digits=12, decimal_places=0, default=0, validators=[MinValueValidator(0)])
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='created_orders')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Class này dùng để khai báo metadata cấu hình (tên hiển thị, sắp xếp mặc định, ràng buộc dữ liệu) cho model/form chứa nó.
        ordering = ('-created_at',)
        indexes = [models.Index(fields=('status', 'created_at')), models.Index(fields=('table', 'status'))]
        verbose_name = 'Đơn hàng'
        verbose_name_plural = 'Đơn hàng'

    def __str__(self):
        # Hàm này dùng để trả về chuỗi biểu diễn tên định danh dễ đọc của đối tượng. Input: đối tượng hiện tại (self). Output: chuỗi ký tự (str) mô tả đối tượng.
        return self.order_code


class OrderItem(models.Model):
    # Class này dùng để quản lý model Chi tiết từng dòng món ăn được gọi trong đơn hàng (số lượng, đơn giá, giảm giá dòng, ghi chú bếp).
    class Status(models.TextChoices):
        # Class này dùng để định nghĩa tập hợp các trạng thái vòng đời hợp lệ của đối tượng dữ liệu.
        ACTIVE = 'active', 'Đang dùng'
        CANCELLED = 'cancelled', 'Đã hủy'

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='order_items')
    product_name = models.CharField('Tên món tại thời điểm bán', max_length=150)
    unit = models.CharField('Đơn vị', max_length=30)
    quantity = models.PositiveIntegerField('Số lượng', validators=[MinValueValidator(1)])
    unit_price = models.DecimalField('Đơn giá', max_digits=12, decimal_places=0, validators=[MinValueValidator(0)])
    discount_amount = models.DecimalField('Giảm giá', max_digits=12, decimal_places=0, default=0, validators=[MinValueValidator(0)])
    total_amount = models.DecimalField('Thành tiền', max_digits=12, decimal_places=0, validators=[MinValueValidator(0)])
    note = models.CharField('Ghi chú', max_length=255, blank=True)
    status = models.CharField('Trạng thái', max_length=20, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        # Class này dùng để khai báo metadata cấu hình (tên hiển thị, sắp xếp mặc định, ràng buộc dữ liệu) cho model/form chứa nó.
        ordering = ('id',)
        verbose_name = 'Chi tiết đơn hàng'
        verbose_name_plural = 'Chi tiết đơn hàng'

    def save(self, *args, **kwargs):
        # Hàm này dùng để ghi đè phương thức lưu model, tự động tính toán thành tiền/cập nhật dữ liệu liên quan trước khi lưu vào CSDL. Input: *args, **kwargs. Output: bản ghi đã được lưu.
        self.total_amount = (self.unit_price * self.quantity) - self.discount_amount
        super().save(*args, **kwargs)


class Invoice(models.Model):
    # Class này dùng để quản lý model Hóa đơn thanh toán chính thức (mã hóa đơn, tổng tiền hàng, giảm giá, phụ phí, thuế VAT, tổng thanh toán).
    class Status(models.TextChoices):
        # Class này dùng để định nghĩa tập hợp các trạng thái vòng đời hợp lệ của đối tượng dữ liệu.
        PAID = 'paid', 'Đã thanh toán'
        CANCELLED = 'cancelled', 'Đã hủy'

    invoice_code = models.CharField('Mã hóa đơn', max_length=30, unique=True)
    order = models.OneToOneField(Order, on_delete=models.PROTECT, related_name='invoice')
    cashier = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='processed_invoices')
    subtotal = models.DecimalField('Tiền món', max_digits=12, decimal_places=0, validators=[MinValueValidator(0)])
    discount_amount = models.DecimalField('Giảm giá', max_digits=12, decimal_places=0, default=0, validators=[MinValueValidator(0)])
    surcharge_amount = models.DecimalField('Phụ thu', max_digits=12, decimal_places=0, default=0, validators=[MinValueValidator(0)])
    tax_amount = models.DecimalField('VAT', max_digits=12, decimal_places=0, default=0, validators=[MinValueValidator(0)])
    total_amount = models.DecimalField('Tổng tiền', max_digits=12, decimal_places=0, validators=[MinValueValidator(0)])
    status = models.CharField('Trạng thái', max_length=20, choices=Status.choices, default=Status.PAID)
    paid_at = models.DateTimeField(auto_now_add=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancel_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        # Class này dùng để khai báo metadata cấu hình (tên hiển thị, sắp xếp mặc định, ràng buộc dữ liệu) cho model/form chứa nó.
        ordering = ('-paid_at',)
        indexes = [models.Index(fields=('paid_at', 'status'))]
        verbose_name = 'Hóa đơn'
        verbose_name_plural = 'Hóa đơn'

    def __str__(self):
        # Hàm này dùng để trả về chuỗi biểu diễn tên định danh dễ đọc của đối tượng. Input: đối tượng hiện tại (self). Output: chuỗi ký tự (str) mô tả đối tượng.
        return self.invoice_code

    @classmethod
    def next_invoice_code(cls):
        # Hàm này dùng để thực hiện xử lý nghiệp vụ hỗ trợ 'next_invoice_code' trong module models.py. Input: không có tham số đầu vào trực tiếp. Output: trả về dữ liệu đã chuẩn hóa/tính toán theo logic nghiệp vụ.
        existing_codes = set(cls.objects.values_list('invoice_code', flat=True))
        numeric_vals = [int(c) for c in existing_codes if c and str(c).isdigit()]
        next_num = (max(numeric_vals) if numeric_vals else cls.objects.count()) + 1
        while f'{next_num:04d}' in existing_codes:
            next_num += 1
        return f'{next_num:04d}'


class Shift(models.Model):
    # Class này dùng để quản lý model Ca làm việc của thu ngân (tiền đầu ca, tiền kết ca, thời gian mở/đóng ca).
    class Status(models.TextChoices):
        # Class này dùng để định nghĩa tập hợp các trạng thái vòng đời hợp lệ của đối tượng dữ liệu.
        OPEN = 'open', 'Đang mở'
        CLOSED = 'closed', 'Đã kết'

    status = models.CharField('Trạng thái', max_length=10, choices=Status.choices, default=Status.OPEN)
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    opened_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='opened_shifts')
    closed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name='closed_shifts')

    class Meta:
        # Class này dùng để khai báo metadata cấu hình (tên hiển thị, sắp xếp mặc định, ràng buộc dữ liệu) cho model/form chứa nó.
        ordering = ('-started_at',)
        verbose_name = 'Ca làm việc'
        verbose_name_plural = 'Ca làm việc'


class Payment(models.Model):
    # Class này dùng để quản lý model Giao dịch thanh toán của hóa đơn (phương thức Tiền mặt, Chuyển khoản/QR, Thẻ ngân hàng).
    class Method(models.TextChoices):
        # Class này dùng để định nghĩa các phương thức thanh toán được chấp nhận tại quầy thu ngân POS.
        CASH = 'cash', 'Tiền mặt'
        BANK = 'bank', 'Chuyển khoản'
        CARD = 'card', 'Thẻ ngân hàng'
        E_WALLET = 'e_wallet', 'Ví điện tử'
        OTHER = 'other', 'Khác'

    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name='payments')
    method = models.CharField('Phương thức', max_length=20, choices=Method.choices)
    amount = models.DecimalField('Số tiền', max_digits=12, decimal_places=0, validators=[MinValueValidator(Decimal('0'))])
    reference_code = models.CharField('Mã tham chiếu', max_length=100, blank=True)
    note = models.CharField('Ghi chú', max_length=255, blank=True)
    paid_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='recorded_payments')

    class Meta:
        # Class này dùng để khai báo metadata cấu hình (tên hiển thị, sắp xếp mặc định, ràng buộc dữ liệu) cho model/form chứa nó.
        ordering = ('-paid_at',)
        verbose_name = 'Thanh toán'
        verbose_name_plural = 'Thanh toán'
