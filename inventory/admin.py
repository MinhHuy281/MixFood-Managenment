# File này chịu trách nhiệm cấu hình quản trị Django Admin cho Công thức món, Phiếu nhập kho, Phiếu xuất kho, Phiếu kiểm kê và Thẻ kho.
from django.contrib import admin

from .models import (
    Recipe, RecipeItem, StockReceipt, StockReceiptItem,
    StockTransaction, StockIssue, StockIssueItem, StockAdjustment, StockAdjustmentItem
)


class RecipeItemInline(admin.TabularInline):
    # Class này dùng để cấu hình bảng nhập liệu chi tiết trực tiếp (Inline) cho RecipeItem trên giao diện Django Admin.
    model = RecipeItem
    extra = 1


@admin.register(Recipe)
class RecipeAdmin(admin.ModelAdmin):
    # Class này dùng để cấu hình giao diện quản trị Django Admin cho model Recipe.
    list_display = ('product', 'is_active', 'updated_at')
    list_filter = ('is_active',)
    search_fields = ('product__name', 'product__code')
    inlines = (RecipeItemInline,)


class StockReceiptItemInline(admin.TabularInline):
    # Class này dùng để cấu hình bảng nhập liệu chi tiết trực tiếp (Inline) cho StockReceiptItem trên giao diện Django Admin.
    model = StockReceiptItem
    extra = 1


@admin.register(StockReceipt)
class StockReceiptAdmin(admin.ModelAdmin):
    # Class này dùng để cấu hình giao diện quản trị Django Admin cho model StockReceipt.
    list_display = ('receipt_code', 'supplier', 'total_amount', 'status', 'created_by', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('receipt_code', 'supplier')
    inlines = (StockReceiptItemInline,)


@admin.register(StockTransaction)
class StockTransactionAdmin(admin.ModelAdmin):
    # Class này dùng để cấu hình giao diện quản trị Django Admin cho model StockTransaction.
    list_display = ('ingredient', 'transaction_type', 'quantity', 'balance_after', 'created_by', 'created_at')
    list_filter = ('transaction_type', 'created_at')
    search_fields = ('ingredient__name', 'ingredient__code')
    readonly_fields = ('created_at',)

class StockIssueItemInline(admin.TabularInline):
    # Class này dùng để cấu hình bảng nhập liệu chi tiết trực tiếp (Inline) cho StockIssueItem trên giao diện Django Admin.
    model = StockIssueItem
    extra = 1


@admin.register(StockIssue)
class StockIssueAdmin(admin.ModelAdmin):
    # Class này dùng để cấu hình giao diện quản trị Django Admin cho model StockIssue.
    list_display = ('issue_code', 'issue_type', 'receiver', 'total_amount', 'status', 'created_by', 'created_at')
    list_filter = ('issue_type', 'status', 'created_at')
    search_fields = ('issue_code', 'receiver', 'note')
    inlines = (StockIssueItemInline,)


class StockAdjustmentItemInline(admin.TabularInline):
    # Class này dùng để cấu hình bảng nhập liệu chi tiết trực tiếp (Inline) cho StockAdjustmentItem trên giao diện Django Admin.
    model = StockAdjustmentItem
    extra = 0


@admin.register(StockAdjustment)
class StockAdjustmentAdmin(admin.ModelAdmin):
    # Class này dùng để cấu hình giao diện quản trị Django Admin cho model StockAdjustment.
    list_display = ('adjustment_code', 'total_diff_amount', 'created_by', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('adjustment_code', 'note')
    inlines = (StockAdjustmentItemInline,)
