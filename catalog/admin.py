# File này chịu trách nhiệm cấu hình quản trị Django Admin cho Nhóm danh mục (Category), Món ăn (Product) và Nguyên liệu (Ingredient).
from django.contrib import admin

from .models import Category, Ingredient, Product


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    # Class này dùng để cấu hình hiển thị và tìm kiếm Nhóm danh mục (Category) trên trang Django Admin.
    list_display = ('name', 'display_order', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('name',)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    # Class này dùng để cấu hình hiển thị, lọc và tìm kiếm Món ăn (Product) trên trang Django Admin.
    list_display = ('code', 'name', 'category', 'price', 'product_type', 'is_available', 'is_active')
    list_filter = ('category', 'product_type', 'is_available', 'is_active')
    search_fields = ('code', 'name')
    list_select_related = ('category',)


@admin.register(Ingredient)
class IngredientAdmin(admin.ModelAdmin):
    # Class này dùng để cấu hình hiển thị và quản lý Mặt hàng Nguyên liệu (Ingredient) trên trang Django Admin.
    list_display = ('code', 'name', 'unit', 'current_stock', 'minimum_stock', 'is_active')
    list_filter = ('is_active', 'unit')
    search_fields = ('code', 'name', 'supplier')
