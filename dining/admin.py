from django.contrib import admin

from .models import Area, DiningTable


@admin.register(Area)
class AreaAdmin(admin.ModelAdmin):
	list_display = ('name', 'display_order', 'is_active')
	list_filter = ('is_active',)
	search_fields = ('name',)


@admin.register(DiningTable)
class DiningTableAdmin(admin.ModelAdmin):
	list_display = ('code', 'name', 'area', 'capacity', 'status', 'is_active')
	list_filter = ('area', 'status', 'is_active')
	search_fields = ('code', 'name')
	list_select_related = ('area',)
