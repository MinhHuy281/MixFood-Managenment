from django.contrib import admin

from .models import ActivityLog


@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):
	list_display = ('created_at', 'actor', 'action', 'description', 'status_code', 'ip_address')
	list_filter = ('action', 'status_code', 'created_at')
	search_fields = ('description', 'path', 'actor__username')
	readonly_fields = tuple(field.name for field in ActivityLog._meta.fields)
