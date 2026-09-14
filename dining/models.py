from django.db import models


class Area(models.Model):
	name = models.CharField('Tên khu vực', max_length=100, unique=True)
	description = models.TextField('Mô tả', blank=True)
	display_order = models.PositiveIntegerField('Thứ tự', default=0)
	is_active = models.BooleanField('Đang sử dụng', default=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ('display_order', 'name')
		verbose_name = 'Khu vực'
		verbose_name_plural = 'Khu vực'

	def __str__(self):
		return self.name


class DiningTable(models.Model):
	class Status(models.TextChoices):
		AVAILABLE = 'available', 'Trống'
		OCCUPIED = 'occupied', 'Đang phục vụ'
		RESERVED = 'reserved', 'Đã đặt'
		MAINTENANCE = 'maintenance', 'Bảo trì'

	area = models.ForeignKey(Area, on_delete=models.PROTECT, related_name='tables', verbose_name='Khu vực')
	name = models.CharField('Tên bàn', max_length=50)
	code = models.CharField('Mã bàn', max_length=30)
	capacity = models.PositiveSmallIntegerField('Số chỗ', default=4)
	status = models.CharField('Trạng thái', max_length=20, choices=Status.choices, default=Status.AVAILABLE)
	display_order = models.PositiveIntegerField('Thứ tự', default=0)
	is_active = models.BooleanField('Đang sử dụng', default=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ('area__display_order', 'display_order', 'name')
		constraints = [models.UniqueConstraint(fields=('area', 'name'), name='unique_table_name_per_area')]
		indexes = [models.Index(fields=('area', 'status', 'is_active'))]
		verbose_name = 'Bàn'
		verbose_name_plural = 'Bàn'

	def __str__(self):
		return f'{self.area.name} - {self.name}'
