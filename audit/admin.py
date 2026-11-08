# File này chịu trách nhiệm đăng ký và cấu hình hiển thị bảng Nhật ký hoạt động (ActivityLog) trên Django Admin.
from django.contrib import admin

from .models import ActivityLog


@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):
    # Class này dùng để cấu hình giao diện tra cứu và lọc bảng Nhật ký hoạt động (ActivityLog) trong trang quản trị Django Admin.
    list_display = ('created_at', 'actor', 'action', 'description', 'status_code', 'ip_address')
    list_filter = ('action', 'status_code', 'created_at')
    search_fields = ('description', 'path', 'actor__username')
    readonly_fields = tuple(field.name for field in ActivityLog._meta.fields)
