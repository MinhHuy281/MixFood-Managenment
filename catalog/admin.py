from django.contrib import admin

from .models import Category, Ingredient, Product


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
	list_display = ('name', 'display_order', 'is_active')
	list_filter = ('is_active',)
	search_fields = ('name',)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
	list_display = ('code', 'name', 'category', 'price', 'product_type', 'is_available', 'is_active')
	list_filter = ('category', 'product_type', 'is_available', 'is_active')
	search_fields = ('code', 'name')
	list_select_related = ('category',)


@admin.register(Ingredient)
class IngredientAdmin(admin.ModelAdmin):
	list_display = ('code', 'name', 'unit', 'current_stock', 'minimum_stock', 'is_active')
	list_filter = ('is_active', 'unit')
	search_fields = ('code', 'name', 'supplier')
