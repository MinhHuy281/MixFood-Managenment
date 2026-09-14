from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

from catalog.models import Product
from dining.models import DiningTable


class Order(models.Model):
	class OrderType(models.TextChoices):
		DINE_IN = 'dine_in', 'Ăn tại quán'
		TAKEAWAY = 'takeaway', 'Mang về'
		DELIVERY = 'delivery', 'Giao hàng'

	class Status(models.TextChoices):
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
		ordering = ('-created_at',)
		indexes = [models.Index(fields=('status', 'created_at')), models.Index(fields=('table', 'status'))]
		verbose_name = 'Đơn hàng'
		verbose_name_plural = 'Đơn hàng'

	def __str__(self):
		return self.order_code


class OrderItem(models.Model):
	class Status(models.TextChoices):
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
		ordering = ('id',)
		verbose_name = 'Chi tiết đơn hàng'
		verbose_name_plural = 'Chi tiết đơn hàng'

	def save(self, *args, **kwargs):
		self.total_amount = (self.unit_price * self.quantity) - self.discount_amount
		super().save(*args, **kwargs)


class Invoice(models.Model):
	class Status(models.TextChoices):
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
		ordering = ('-paid_at',)
		indexes = [models.Index(fields=('paid_at', 'status'))]
		verbose_name = 'Hóa đơn'
		verbose_name_plural = 'Hóa đơn'

	def __str__(self):
		return self.invoice_code


class Payment(models.Model):
	class Method(models.TextChoices):
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
		ordering = ('-paid_at',)
		verbose_name = 'Thanh toán'
		verbose_name_plural = 'Thanh toán'
