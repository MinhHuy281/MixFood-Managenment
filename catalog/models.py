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
	subgroup = models.CharField('Nhóm con', max_length=100, blank=True, default='')
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

	@property
	def price_vnd(self):
		return f'{self.price:,.0f}'.replace(',', '.')

	@property
	def price_2_vnd(self):
		return f'{self.price_2:,.0f}'.replace(',', '.')

	@property
	def price_3_vnd(self):
		return f'{self.price_3:,.0f}'.replace(',', '.')


from decimal import Decimal

class Ingredient(models.Model):
	class StorageArea(models.TextChoices):
		FRESH = 'fresh', 'Kho 1: Tươi sống & Rau củ'
		DRY = 'dry', 'Kho 2: Nguyên liệu khô, Gia vị & Bao bì'
		BEVERAGE = 'beverage', 'Kho 3: Đồ uống & Trái cây'

	storage_area = models.CharField(
		'Khu vực kho',
		max_length=20,
		choices=StorageArea.choices,
		default=StorageArea.FRESH,
		db_index=True
	)
	group = models.CharField('Nhóm mặt hàng', max_length=100, blank=True, default='')
	code = models.CharField('Mã nguyên liệu', max_length=30, unique=True)
	name = models.CharField('Tên nguyên liệu', max_length=150)
	unit = models.CharField('Đơn vị tính', max_length=30, default='Kg')
	pack_size = models.DecimalField('Quy cách đóng gói (số ĐVT lẻ / 1 ĐVT kho)', max_digits=12, decimal_places=3, default=1, validators=[MinValueValidator(Decimal('0.001'))])
	unpacked_unit = models.CharField('Đơn vị sau khi tách (chờ bán)', max_length=30, blank=True, default='hộp')
	prep_stock = models.DecimalField('Số lượng đã tách đang chờ bán', max_digits=12, decimal_places=3, default=0, validators=[MinValueValidator(0)])
	current_stock = models.DecimalField('Tồn hiện tại', max_digits=12, decimal_places=3, default=0, validators=[MinValueValidator(0)])
	minimum_stock = models.DecimalField('Tồn tối thiểu', max_digits=12, decimal_places=3, default=0, validators=[MinValueValidator(0)])
	average_cost = models.DecimalField('Giá vốn bình quân', max_digits=12, decimal_places=0, default=0, validators=[MinValueValidator(0)])
	supplier = models.CharField('Nhà cung cấp', max_length=150, blank=True)
	is_active = models.BooleanField('Đang sử dụng', default=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ('storage_area', 'group', 'name')
		indexes = [
			models.Index(fields=('name', 'is_active')),
			models.Index(fields=('group', 'is_active')),
			models.Index(fields=('storage_area', 'is_active')),
			models.Index(fields=('current_stock', 'minimum_stock')),
		]
		verbose_name = 'Nguyên liệu'
		verbose_name_plural = 'Nguyên liệu'

	@property
	def is_low_stock(self):
		return self.current_stock <= self.minimum_stock

	@property
	def cost_vnd(self):
		return f'{self.average_cost:,.0f}'.replace(',', '.')

	@property
	def minimum_stock_formatted(self):
		return f'{self.minimum_stock:.3f}'

	@property
	def current_stock_formatted(self):
		return f'{self.current_stock:.3f}'

	@property
	def storage_area_display(self):
		return dict(self.StorageArea.choices).get(self.storage_area, 'Kho 1: Tươi sống & Rau củ')

	@property
	def storage_area_short(self):
		mapping = {
			self.StorageArea.FRESH: 'Kho 1: Tươi sống',
			self.StorageArea.DRY: 'Kho 2: Đồ khô & Gia vị',
			self.StorageArea.BEVERAGE: 'Kho 3: Đồ uống & Trái cây',
		}
		return mapping.get(self.storage_area, 'Kho 1')

	@property
	def pack_rule_display(self):
		ps = self.pack_size or Decimal('1')
		ps_str = f'{ps:.2f}'.rstrip('0').rstrip('.') if '.' in f'{ps:.2f}' else f'{ps:.0f}'
		sub_u = self.unpacked_unit or 'hộp'
		name = self.name.lower()
		if 'phồng tôm' in name or 'phongtom' in (self.code or '').lower():
			return f'1 {self.unit} = {ps_str} {sub_u} ({int(ps * 10)} cái bánh)'
		return f'1 {self.unit} = {ps_str} {sub_u}'

	@property
	def portions_wait_display(self):
		name = self.name.lower()
		prep = self.prep_stock or Decimal('0')
		sub_u = self.unpacked_unit or 'hộp'
		if prep > 0:
			prep_str = f'{prep:.2f}'.rstrip('0').rstrip('.') if '.' in f'{prep:.2f}' else f'{prep:.0f}'
			if 'phồng tôm' in name or 'phong tom' in name or 'phongtom' in (self.code or '').lower():
				cakes = int(round(prep * 10))
				return f'{prep_str} {sub_u} ({cakes} cái bánh) đang chờ bán'
			return f'{prep_str} {sub_u} đang chờ bán'
		if (self.current_stock or Decimal('0')) > 0:
			return f'0 {sub_u} (Chưa xuất tách)'
		return '0'

	def __str__(self):
		return f'{self.code} - {self.name}'
