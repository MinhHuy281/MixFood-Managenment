from django.core.validators import MinValueValidator
from django.db import models


class Category(models.Model):
	name = models.CharField('Tên danh mục', max_length=100, unique=True)
	description = models.TextField('Mô tả', blank=True)
	color = models.CharField('Màu hiển thị', max_length=20, default='#f5c92c')
	display_order = models.PositiveIntegerField('Thứ tự', default=0)
	is_active = models.BooleanField('Đang sử dụng', default=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ('display_order', 'name')
		verbose_name = 'Danh mục món'
		verbose_name_plural = 'Danh mục món'

	def __str__(self):
		return self.name


class Product(models.Model):
	class ProductType(models.TextChoices):
		FOOD = 'food', 'Món ăn'
		DRINK = 'drink', 'Đồ uống'
		TOPPING = 'topping', 'Topping'
		OTHER = 'other', 'Khác'

	category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name='products', verbose_name='Danh mục')
	code = models.CharField('Mã món', max_length=30, unique=True)
	name = models.CharField('Tên món', max_length=150)
	description = models.TextField('Mô tả', blank=True)
	unit = models.CharField('Đơn vị tính', max_length=30, default='Phần')
	price = models.DecimalField('Đơn giá', max_digits=12, decimal_places=0, validators=[MinValueValidator(0)])
	price_2 = models.DecimalField('Đơn giá 2', max_digits=12, decimal_places=0, default=0, validators=[MinValueValidator(0)])
	price_3 = models.DecimalField('Đơn giá 3', max_digits=12, decimal_places=0, default=0, validators=[MinValueValidator(0)])
	cost_price = models.DecimalField('Giá vốn', max_digits=12, decimal_places=0, default=0, validators=[MinValueValidator(0)])
	product_type = models.CharField('Loại món', max_length=20, choices=ProductType.choices, default=ProductType.FOOD)
	image = models.ImageField('Ảnh món', upload_to='products/', blank=True)
	is_available = models.BooleanField('Đang bán', default=True)
	is_active = models.BooleanField('Đang sử dụng', default=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ('category__display_order', 'name')
		indexes = [models.Index(fields=('name', 'is_active')), models.Index(fields=('category', 'is_active'))]
		verbose_name = 'Món ăn'
		verbose_name_plural = 'Món ăn'

	def __str__(self):
		return f'{self.code} - {self.name}'


class Ingredient(models.Model):
	code = models.CharField('Mã nguyên liệu', max_length=30, unique=True)
	name = models.CharField('Tên nguyên liệu', max_length=150)
	unit = models.CharField('Đơn vị tính', max_length=30, default='Kg')
	current_stock = models.DecimalField('Tồn hiện tại', max_digits=12, decimal_places=3, default=0, validators=[MinValueValidator(0)])
	minimum_stock = models.DecimalField('Tồn tối thiểu', max_digits=12, decimal_places=3, default=0, validators=[MinValueValidator(0)])
	average_cost = models.DecimalField('Giá vốn bình quân', max_digits=12, decimal_places=0, default=0, validators=[MinValueValidator(0)])
	supplier = models.CharField('Nhà cung cấp', max_length=150, blank=True)
	is_active = models.BooleanField('Đang sử dụng', default=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ('name',)
		indexes = [models.Index(fields=('name', 'is_active')), models.Index(fields=('current_stock', 'minimum_stock'))]
		verbose_name = 'Nguyên liệu'
		verbose_name_plural = 'Nguyên liệu'

	@property
	def is_low_stock(self):
		return self.current_stock <= self.minimum_stock

	def __str__(self):
		return f'{self.code} - {self.name}'
