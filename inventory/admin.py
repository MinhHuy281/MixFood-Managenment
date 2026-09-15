from django.contrib import admin

from .models import Recipe, RecipeItem, StockReceipt, StockReceiptItem, StockTransaction


class RecipeItemInline(admin.TabularInline):
	model = RecipeItem
	extra = 1


@admin.register(Recipe)
class RecipeAdmin(admin.ModelAdmin):
	list_display = ('product', 'is_active', 'updated_at')
	list_filter = ('is_active',)
	search_fields = ('product__name', 'product__code')
	inlines = (RecipeItemInline,)


class StockReceiptItemInline(admin.TabularInline):
	model = StockReceiptItem
	extra = 1


@admin.register(StockReceipt)
class StockReceiptAdmin(admin.ModelAdmin):
	list_display = ('receipt_code', 'supplier', 'total_amount', 'status', 'created_by', 'created_at')
	list_filter = ('status', 'created_at')
	search_fields = ('receipt_code', 'supplier')
	inlines = (StockReceiptItemInline,)


@admin.register(StockTransaction)
class StockTransactionAdmin(admin.ModelAdmin):
	list_display = ('ingredient', 'transaction_type', 'quantity', 'balance_after', 'created_by', 'created_at')
	list_filter = ('transaction_type', 'created_at')
	search_fields = ('ingredient__name', 'ingredient__code')
	readonly_fields = ('created_at',)
