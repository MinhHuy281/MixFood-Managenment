from django.conf import settings
from django.db import models


class ActivityLog(models.Model):
	class Action(models.TextChoices):
		CREATE = 'create', 'Thêm mới'
		UPDATE = 'update', 'Cập nhật'
		DELETE = 'delete', 'Xóa/Ngừng dùng'
		PAYMENT = 'payment', 'Thanh toán'
		LOGIN = 'login', 'Đăng nhập'
		OTHER = 'other', 'Khác'

	actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='activity_logs')
	action = models.CharField('Hoạt động', max_length=20, choices=Action.choices, default=Action.OTHER)
	method = models.CharField('HTTP method', max_length=10, blank=True)
	path = models.CharField('Đường dẫn', max_length=255)
	object_type = models.CharField('Loại đối tượng', max_length=100, blank=True)
	object_id = models.PositiveBigIntegerField(null=True, blank=True)
	description = models.CharField('Chi tiết', max_length=500)
	status_code = models.PositiveSmallIntegerField(default=200)
	ip_address = models.GenericIPAddressField(null=True, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ('-created_at',)
		indexes = [models.Index(fields=('created_at', 'action')), models.Index(fields=('actor', 'created_at'))]
		verbose_name = 'Lịch sử hoạt động'
		verbose_name_plural = 'Lịch sử hoạt động'
