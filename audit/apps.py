# File này chịu trách nhiệm khai báo cấu hình ứng dụng AuditConfig cho phân hệ Nhật ký hoạt động.
from django.apps import AppConfig


class AuditConfig(AppConfig):
    # Class này dùng để cấu hình thông tin ứng dụng Nhật ký hoạt động & Kiểm toán (audit) trong Django.
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'audit'
