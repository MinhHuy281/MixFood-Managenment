# File này chịu trách nhiệm định nghĩa các model Kho hàng: Công thức định lượng (Recipe, RecipeItem), Nhập kho (StockReceipt), Xuất kho (StockIssue), Kiểm kê (StockAdjustment) và Giao dịch kho (StockTransaction).
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

from catalog.models import Ingredient, Product


class Recipe(models.Model):
    # Class này dùng để quản lý model Công thức định lượng (BOM Header) gắn kết 1-1 với một món ăn trên thực đơn.
    product = models.OneToOneField(Product, on_delete=models.PROTECT, related_name='recipe', verbose_name='Món ăn')
    description = models.TextField('Ghi chú', blank=True)
    is_active = models.BooleanField('Đang sử dụng', default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Class này dùng để khai báo metadata cấu hình (tên hiển thị, sắp xếp mặc định, ràng buộc dữ liệu) cho model/form chứa nó.
        verbose_name = 'Công thức món'
        verbose_name_plural = 'Công thức món'

    def __str__(self):
        # Hàm này dùng để trả về chuỗi biểu diễn tên định danh dễ đọc của đối tượng. Input: đối tượng hiện tại (self). Output: chuỗi ký tự (str) mô tả đối tượng.
        return f'Công thức: {self.product.name}'


class RecipeItem(models.Model):
    # Class này dùng để quản lý model Chi tiết từng nguyên liệu và định lượng tiêu hao cấu thành nên 1 phần món ăn.
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name='items')
    ingredient = models.ForeignKey(Ingredient, on_delete=models.PROTECT, related_name='recipe_items')
    quantity = models.DecimalField('Định lượng', max_digits=12, decimal_places=3, validators=[MinValueValidator(Decimal('0.001'))])
    unit = models.CharField('Đơn vị', max_length=30)

    class Meta:
        # Class này dùng để khai báo metadata cấu hình (tên hiển thị, sắp xếp mặc định, ràng buộc dữ liệu) cho model/form chứa nó.
        constraints = [models.UniqueConstraint(fields=('recipe', 'ingredient'), name='unique_ingredient_per_recipe')]
        verbose_name = 'Nguyên liệu trong công thức'
        verbose_name_plural = 'Nguyên liệu trong công thức'


class StockReceipt(models.Model):
    # Class này dùng để quản lý model Phiếu nhập kho nguyên vật liệu từ nhà cung cấp.
    class Status(models.TextChoices):
        # Class này dùng để định nghĩa tập hợp các trạng thái vòng đời hợp lệ của đối tượng dữ liệu.
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
        # Class này dùng để khai báo metadata cấu hình (tên hiển thị, sắp xếp mặc định, ràng buộc dữ liệu) cho model/form chứa nó.
        ordering = ('-created_at',)
        verbose_name = 'Phiếu nhập kho'
        verbose_name_plural = 'Phiếu nhập kho'


class StockReceiptItem(models.Model):
    # Class này dùng để quản lý model Chi tiết từng mặt hàng nguyên liệu, số lượng và đơn giá nhập trong một Phiếu nhập kho.
    receipt = models.ForeignKey(StockReceipt, on_delete=models.CASCADE, related_name='items')
    ingredient = models.ForeignKey(Ingredient, on_delete=models.PROTECT, related_name='receipt_items')
    quantity = models.DecimalField('Số lượng', max_digits=12, decimal_places=3, validators=[MinValueValidator(Decimal('0.001'))])
    unit_cost = models.DecimalField('Đơn giá nhập', max_digits=12, decimal_places=0, validators=[MinValueValidator(0)])
    total_cost = models.DecimalField('Thành tiền', max_digits=12, decimal_places=0, validators=[MinValueValidator(0)])

    def save(self, *args, **kwargs):
        # Hàm này dùng để ghi đè phương thức lưu model, tự động tính toán thành tiền/cập nhật dữ liệu liên quan trước khi lưu vào CSDL. Input: *args, **kwargs. Output: bản ghi đã được lưu.
        self.total_cost = self.quantity * self.unit_cost
        super().save(*args, **kwargs)


class StockTransaction(models.Model):
    # Class này dùng để quản lý model Thẻ kho / Lịch sử giao dịch biến động tồn kho (Nhập, Xuất bán, Xuất kho, Kiểm kê).
    class TransactionType(models.TextChoices):
        # Class này dùng để định nghĩa các loại giao dịch biến động tồn kho (Nhập kho, Xuất bán, Xuất kho, Kiểm kê tăng/giảm, Hủy hàng).
        RECEIPT = 'receipt', 'Nhập kho'
        SALE = 'sale', 'Xuất kho bán hàng'
        ISSUE = 'issue', 'Xuất kho thủ công'
        INCREASE = 'increase', 'Điều chỉnh tăng'
        DECREASE = 'decrease', 'Điều chỉnh giảm'
        RESTORE = 'restore', 'Hoàn kho (Hủy đơn/Hoàn tác)'

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
        # Class này dùng để khai báo metadata cấu hình (tên hiển thị, sắp xếp mặc định, ràng buộc dữ liệu) cho model/form chứa nó.
        ordering = ('-created_at',)
        indexes = [models.Index(fields=('ingredient', 'created_at')), models.Index(fields=('transaction_type', 'created_at'))]
        verbose_name = 'Biến động kho'
        verbose_name_plural = 'Biến động kho'

class StockIssue(models.Model):
    # Class này dùng để quản lý model Phiếu xuất kho (xuất tách ra quầy/bếp chờ bán, xuất hủy hàng hỏng, xuất nội bộ).
    class IssueType(models.TextChoices):
        # Class này dùng để định nghĩa các lý do xuất kho (Xuất sử dụng chế biến / tách lẻ chờ bán, Xuất hủy, Xuất khác).
        MANUAL = 'manual', 'Xuất thủ công'
        WASTE = 'waste', 'Xuất hủy / hỏng / hết hạn'
        INTERNAL = 'internal', 'Xuất dùng nội bộ'
        RETURN = 'return', 'Xuất trả nhà cung cấp'

    class Status(models.TextChoices):
        # Class này dùng để định nghĩa tập hợp các trạng thái vòng đời hợp lệ của đối tượng dữ liệu.
        CONFIRMED = 'confirmed', 'Đã xuất kho'
        CANCELLED = 'cancelled', 'Đã hủy'

    issue_code = models.CharField('Mã phiếu xuất', max_length=30, unique=True)
    issue_type = models.CharField('Loại xuất', max_length=20, choices=IssueType.choices, default=IssueType.MANUAL)
    receiver = models.CharField('Người / Bộ phận nhận', max_length=150, blank=True)
    total_amount = models.DecimalField('Tổng giá trị xuất', max_digits=12, decimal_places=0, default=0, validators=[MinValueValidator(0)])
    note = models.TextField('Ghi chú lý do xuất', blank=True)
    status = models.CharField('Trạng thái', max_length=20, choices=Status.choices, default=Status.CONFIRMED)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='stock_issues')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Class này dùng để khai báo metadata cấu hình (tên hiển thị, sắp xếp mặc định, ràng buộc dữ liệu) cho model/form chứa nó.
        ordering = ('-created_at',)
        verbose_name = 'Phiếu xuất kho'
        verbose_name_plural = 'Phiếu xuất kho'

    def __str__(self):
        # Hàm này dùng để trả về chuỗi biểu diễn tên định danh dễ đọc của đối tượng. Input: đối tượng hiện tại (self). Output: chuỗi ký tự (str) mô tả đối tượng.
        return f'{self.issue_code} ({self.get_issue_type_display()})'


class StockIssueItem(models.Model):
    # Class này dùng để quản lý model Chi tiết từng mặt hàng nguyên liệu và số lượng xuất trong một Phiếu xuất kho.
    issue = models.ForeignKey(StockIssue, on_delete=models.CASCADE, related_name='items')
    ingredient = models.ForeignKey(Ingredient, on_delete=models.PROTECT, related_name='issue_items')
    quantity = models.DecimalField('Số lượng', max_digits=12, decimal_places=3, validators=[MinValueValidator(Decimal('0.001'))])
    unit_cost = models.DecimalField('Đơn giá vốn', max_digits=12, decimal_places=0, validators=[MinValueValidator(0)])
    total_cost = models.DecimalField('Thành tiền', max_digits=12, decimal_places=0, validators=[MinValueValidator(0)])

    def save(self, *args, **kwargs):
        # Hàm này dùng để ghi đè phương thức lưu model, tự động tính toán thành tiền/cập nhật dữ liệu liên quan trước khi lưu vào CSDL. Input: *args, **kwargs. Output: bản ghi đã được lưu.
        self.total_cost = self.quantity * self.unit_cost
        super().save(*args, **kwargs)


class StockAdjustment(models.Model):
    # Class này dùng để quản lý model Phiếu kiểm kê cân đối kho định kỳ hoặc cuối ngày.
    adjustment_code = models.CharField('Mã kiểm kê', max_length=30, unique=True)
    note = models.TextField('Ghi chú kiểm kê / lý do cân đối', blank=True)
    total_diff_amount = models.DecimalField('Tổng giá trị chênh lệch', max_digits=12, decimal_places=0, default=0)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='stock_adjustments')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Class này dùng để khai báo metadata cấu hình (tên hiển thị, sắp xếp mặc định, ràng buộc dữ liệu) cho model/form chứa nó.
        ordering = ('-created_at',)
        verbose_name = 'Phiếu kiểm kê điều chỉnh kho'
        verbose_name_plural = 'Phiếu kiểm kê điều chỉnh kho'

    def __str__(self):
        # Hàm này dùng để trả về chuỗi biểu diễn tên định danh dễ đọc của đối tượng. Input: đối tượng hiện tại (self). Output: chuỗi ký tự (str) mô tả đối tượng.
        return f'Kiểm kê {self.adjustment_code}'


class StockAdjustmentItem(models.Model):
    # Class này dùng để quản lý model Chi tiết chênh lệch giữa tồn kho sổ sách và tồn kho thực tế của từng nguyên liệu khi kiểm kê.
    adjustment = models.ForeignKey(StockAdjustment, on_delete=models.CASCADE, related_name='items')
    ingredient = models.ForeignKey(Ingredient, on_delete=models.PROTECT, related_name='adjustment_items')
    system_stock = models.DecimalField('Tồn hệ thống', max_digits=12, decimal_places=3)
    actual_stock = models.DecimalField('Tồn thực tế', max_digits=12, decimal_places=3)
    diff_quantity = models.DecimalField('Chênh lệch số lượng', max_digits=12, decimal_places=3)
    unit_cost = models.DecimalField('Đơn giá vốn', max_digits=12, decimal_places=0, default=0)
    diff_amount = models.DecimalField('Giá trị chênh lệch', max_digits=12, decimal_places=0, default=0)
