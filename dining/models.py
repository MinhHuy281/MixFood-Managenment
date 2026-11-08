# File này chịu trách nhiệm định nghĩa model Khu vực phục vụ (Area) và Điểm bàn ăn (DiningTable) cùng các trạng thái bàn trên sơ đồ POS.
from django.db import models


class Area(models.Model):
    # Class này dùng để quản lý model Khu vực phục vụ bàn ăn trong nhà hàng (ví dụ: Tầng 1, Sân vườn, Phòng VIP).
    name = models.CharField('Tên khu vực', max_length=100, unique=True)
    area_type = models.CharField('Loại hình', max_length=100, default='Nhà hàng cafe', blank=True)
    description = models.TextField('Mô tả', blank=True)
    display_order = models.PositiveIntegerField('Thứ tự', default=0)
    is_active = models.BooleanField('Đang sử dụng', default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Class này dùng để khai báo metadata cấu hình (tên hiển thị, sắp xếp mặc định, ràng buộc dữ liệu) cho model/form chứa nó.
        ordering = ('display_order', 'name')
        verbose_name = 'Khu vực'
        verbose_name_plural = 'Khu vực'

    def __str__(self):
        # Hàm này dùng để trả về chuỗi biểu diễn tên định danh dễ đọc của đối tượng. Input: đối tượng hiện tại (self). Output: chuỗi ký tự (str) mô tả đối tượng.
        return self.name


class DiningTable(models.Model):
    # Class này dùng để quản lý model Bàn ăn / Điểm bán hàng trên sơ đồ POS (tên bàn, khu vực, sức chứa, trạng thái trống/đang phục vụ/đã đặt).
    class Status(models.TextChoices):
        # Class này dùng để định nghĩa tập hợp các trạng thái vòng đời hợp lệ của đối tượng dữ liệu.
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
        # Class này dùng để khai báo metadata cấu hình (tên hiển thị, sắp xếp mặc định, ràng buộc dữ liệu) cho model/form chứa nó.
        ordering = ('area__display_order', 'display_order', 'name')
        constraints = [models.UniqueConstraint(fields=('area', 'name'), name='unique_table_name_per_area')]
        indexes = [models.Index(fields=('area', 'status', 'is_active'))]
        verbose_name = 'Bàn'
        verbose_name_plural = 'Bàn'

    def __str__(self):
        # Hàm này dùng để trả về chuỗi biểu diễn tên định danh dễ đọc của đối tượng. Input: đối tượng hiện tại (self). Output: chuỗi ký tự (str) mô tả đối tượng.
        return f'{self.area.name} - {self.name}'
