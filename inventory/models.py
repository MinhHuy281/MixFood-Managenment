from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

from catalog.models import Ingredient, Product


class Recipe(models.Model):
	product = models.OneToOneField(Product, on_delete=models.PROTECT, related_name='recipe', verbose_name='Món ăn')
	description = models.TextField('Ghi chú', blank=True)
	is_active = models.BooleanField('Đang sử dụng', default=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		verbose_name = 'Công thức món'
		verbose_name_plural = 'Công thức món'

	def __str__(self):
		return f'Công thức: {self.product.name}'


class RecipeItem(models.Model):
	recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name='items')
	ingredient = models.ForeignKey(Ingredient, on_delete=models.PROTECT, related_name='recipe_items')
	quantity = models.DecimalField('Định lượng', max_digits=12, decimal_places=3, validators=[MinValueValidator(Decimal('0.001'))])
	unit = models.CharField('Đơn vị', max_length=30)

	class Meta:
		constraints = [models.UniqueConstraint(fields=('recipe', 'ingredient'), name='unique_ingredient_per_recipe')]
		verbose_name = 'Nguyên liệu trong công thức'
		verbose_name_plural = 'Nguyên liệu trong công thức'


class StockReceipt(models.Model):
	class Status(models.TextChoices):
		DRAFT = 'draft', 'Nháp'
		CONFIRMED = 'confirmed', 'Đã nhập kho'
		CANCELLED = 'cancelled', 'Đã hủy'

	receipt_code = models.CharField('Mã phiếu nhập', max_length=30, unique=True)
	supplier = models.CharField('Nhà cung cấp', max_length=150, blank=True)
	total_amount = models.DecimalField('Tổng tiền', max_digits=12, decimal_places=0, default=0, validators=[MinValueValidator(0)])
	note = models.TextField('Ghi chú', blank=True)
	status = models.CharField('Trạng thái', max_length=20, choices=Status.choices, default=Status.DRAFT)
	created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='stock_receipts')
	created_at = models.DateTimeField(auto_now_add=True)
	confirmed_at = models.DateTimeField(null=True, blank=True)

	class Meta:
		ordering = ('-created_at',)
		verbose_name = 'Phiếu nhập kho'
		verbose_name_plural = 'Phiếu nhập kho'


class StockReceiptItem(models.Model):
	receipt = models.ForeignKey(StockReceipt, on_delete=models.CASCADE, related_name='items')
	ingredient = models.ForeignKey(Ingredient, on_delete=models.PROTECT, related_name='receipt_items')
	quantity = models.DecimalField('Số lượng', max_digits=12, decimal_places=3, validators=[MinValueValidator(Decimal('0.001'))])
	unit_cost = models.DecimalField('Đơn giá nhập', max_digits=12, decimal_places=0, validators=[MinValueValidator(0)])
	total_cost = models.DecimalField('Thành tiền', max_digits=12, decimal_places=0, validators=[MinValueValidator(0)])

	def save(self, *args, **kwargs):
		self.total_cost = self.quantity * self.unit_cost
		super().save(*args, **kwargs)


class StockTransaction(models.Model):
	class TransactionType(models.TextChoices):
		RECEIPT = 'receipt', 'Nhập kho'
		SALE = 'sale', 'Xuất kho bán hàng'
		ISSUE = 'issue', 'Xuất kho thủ công'
		INCREASE = 'increase', 'Điều chỉnh tăng'
		DECREASE = 'decrease', 'Điều chỉnh giảm'

	ingredient = models.ForeignKey(Ingredient, on_delete=models.PROTECT, related_name='stock_transactions')
	transaction_type = models.CharField('Loại giao dịch', max_length=20, choices=TransactionType.choices)
	quantity = models.DecimalField('Số lượng biến động', max_digits=12, decimal_places=3)
	unit_cost = models.DecimalField('Đơn giá vốn', max_digits=12, decimal_places=0, default=0)
	balance_after = models.DecimalField('Tồn sau giao dịch', max_digits=12, decimal_places=3)
	reference_type = models.CharField('Loại tham chiếu', max_length=50, blank=True)
	reference_id = models.PositiveBigIntegerField(null=True, blank=True)
	note = models.CharField('Ghi chú', max_length=255, blank=True)
	created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='stock_transactions')
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ('-created_at',)
		indexes = [models.Index(fields=('ingredient', 'created_at')), models.Index(fields=('transaction_type', 'created_at'))]
		verbose_name = 'Biến động kho'
		verbose_name_plural = 'Biến động kho'
