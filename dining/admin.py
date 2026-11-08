# File này chịu trách nhiệm cấu hình quản trị Django Admin cho Khu vực phục vụ (Area) và Bàn ăn (DiningTable).
from django.contrib import admin

from .models import Area, DiningTable


@admin.register(Area)
class AreaAdmin(admin.ModelAdmin):
    # Class này dùng để cấu hình hiển thị danh sách Khu vực phục vụ (Area) trong Django Admin.
    list_display = ('name', 'display_order', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('name',)


@admin.register(DiningTable)
class DiningTableAdmin(admin.ModelAdmin):
    # Class này dùng để cấu hình hiển thị và lọc danh sách Bàn ăn (DiningTable) trong Django Admin.
    list_display = ('code', 'name', 'area', 'capacity', 'status', 'is_active')
    list_filter = ('area', 'status', 'is_active')
    search_fields = ('code', 'name')
    list_select_related = ('area',)
