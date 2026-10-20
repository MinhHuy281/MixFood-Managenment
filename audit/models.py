from django.conf import settings
from django.db import models


class ActivityLog(models.Model):
	class Action(models.TextChoices):
		RETURN_ITEM = 'return_item', 'Trả món'
		CANCEL_ITEM = 'cancel_item', 'Hủy món'
		EDIT_INVOICE = 'edit_invoice', 'Sửa hóa đơn'
		DELETE_INVOICE = 'delete_invoice', 'Xóa hóa đơn'
		MENU_UPDATE = 'menu_update', 'Cập nhật thực đơn'
		MAINTENANCE = 'maintenance', 'Bảo trì dữ liệu'
		TRANSFER_TABLE = 'transfer_table', 'Chuyển'
		RESERVE_TABLE = 'reserve_table', 'Đặt bàn'
		STOCK_RECEIPT = 'stock_receipt', 'Nhập'
		MERGE_TABLE = 'merge_table', 'Ghép'
		SPLIT_TABLE = 'split_table', 'Tách'
		SYSTEM = 'system', 'Hệ thống'
		EDIT_PRICE = 'edit_price', 'Sửa tiền món'
		DELETE_ORDER = 'delete_order', 'Xóa bỏ đơn'
		WAREHOUSE = 'warehouse', 'Quản lý kho'
		OTHER = 'other', 'Khác'
		SHIFT_CLOSE = 'shift_close', 'Kết ca'
		VIEW_REPORT = 'view_report', 'Xem báo cáo'
		DEBT = 'debt', 'Công nợ'
		# Backward compatibility choices
		CREATE = 'create', 'Thêm mới'
		UPDATE = 'update', 'Cập nhật'
		DELETE = 'delete', 'Xóa/Ngừng dùng'
		PAYMENT = 'payment', 'Thanh toán'
		LOGIN = 'login', 'Đăng nhập'

	actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='activity_logs')
	actor_name = models.CharField('Người thực hiện', max_length=150, blank=True, default='')
	action = models.CharField('Hoạt động', max_length=30, choices=Action.choices, default=Action.OTHER)
	method = models.CharField('HTTP method', max_length=10, blank=True)
	path = models.CharField('Đường dẫn', max_length=255, blank=True)
	object_type = models.CharField('Loại đối tượng', max_length=100, blank=True)
	object_id = models.PositiveBigIntegerField(null=True, blank=True)
	description = models.CharField('Chi tiết', max_length=1000)
	reason = models.CharField('Lý do', max_length=500, blank=True, default='')
	status_code = models.PositiveSmallIntegerField(default=200)
	ip_address = models.GenericIPAddressField(null=True, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ('-created_at',)
		indexes = [
			models.Index(fields=('created_at', 'action')),
			models.Index(fields=('actor', 'created_at')),
			models.Index(fields=('action',)),
		]
		verbose_name = 'Lịch sử hoạt động'
		verbose_name_plural = 'Lịch sử hoạt động'

	@property
	def formatted_time(self):
		return self.created_at.strftime('%d/%m/%Y %I:%M %p')

	@property
	def display_actor(self):
		if self.actor_name:
			return self.actor_name
		if self.actor:
			return self.actor.get_full_name() or self.actor.username
		return 'Hệ thống'

	@property
	def full_detail(self):
		if self.reason:
			if f'({self.reason})' in self.description or f'Lý do: {self.reason}' in self.description:
				return self.description
			return f"{self.description} (Lý do: {self.reason})"
		return self.description

	@property
	def action_color(self):
		color_map = {
			self.Action.CANCEL_ITEM: '#dc2626',      # Đỏ
			self.Action.DELETE_INVOICE: '#dc2626',   # Đỏ
			self.Action.DELETE_ORDER: '#dc2626',     # Đỏ
			self.Action.DELETE: '#dc2626',           # Đỏ
			self.Action.VIEW_REPORT: '#2563eb',      # Xanh dương
			self.Action.EDIT_INVOICE: '#7c3aed',     # Tím
			self.Action.EDIT_PRICE: '#d97706',       # Cam
			self.Action.SHIFT_CLOSE: '#16a34a',      # Xanh lá
			self.Action.PAYMENT: '#16a34a',          # Xanh lá
			self.Action.LOGIN: '#16a34a',            # Xanh lá
			self.Action.SYSTEM: '#0284c7',           # Xanh ngọc
			self.Action.MENU_UPDATE: '#0284c7',      # Xanh ngọc
			self.Action.CREATE: '#0284c7',           # Xanh ngọc
			self.Action.UPDATE: '#0284c7',           # Xanh ngọc
			self.Action.RETURN_ITEM: '#ea580c',      # Cam đậm
			self.Action.RESERVE_TABLE: '#0284c7',    # Xanh ngọc
			self.Action.TRANSFER_TABLE: '#1e293b',   # Đen / than
			self.Action.STOCK_RECEIPT: '#1e293b',
			self.Action.MERGE_TABLE: '#1e293b',
			self.Action.SPLIT_TABLE: '#1e293b',
			self.Action.OTHER: '#1e293b',
		}
		return color_map.get(self.action, '#475569')

	def __str__(self):
		return f"[{self.formatted_time}] {self.get_action_display()} - {self.display_actor}"


def log_activity(actor, action, description, reason='', request=None, object_type='', object_id=None, status_code=200):
	"""Hàm tiện ích ghi nhận nhật ký hoạt động vào database."""
	actor_name = ''
	ip = None
	method = ''
	path = ''

	if request:
		method = request.method
		path = request.path[:255]
		forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
		ip = forwarded.split(',')[0].strip() if forwarded else request.META.get('REMOTE_ADDR')
		if not actor and getattr(request, 'user', None) and request.user.is_authenticated:
			actor = request.user

	if actor:
		actor_name = actor.get_full_name() or actor.username

	return ActivityLog.objects.create(
		actor=actor if (actor and getattr(actor, 'is_authenticated', False)) else None,
		actor_name=actor_name,
		action=action,
		description=description,
		reason=reason,
		method=method,
		path=path,
		object_type=object_type,
		object_id=object_id,
		status_code=status_code,
		ip_address=ip,
	)

