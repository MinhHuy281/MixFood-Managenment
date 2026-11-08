# File này chịu trách nhiệm cấu hình quản trị Django Admin cho Đơn hàng (Order), Hóa đơn (Invoice), Thanh toán (Payment) và Ca làm việc (Shift).
from django.contrib import admin

from .models import Invoice, Order, OrderItem, Payment, Shift


class OrderItemInline(admin.TabularInline):
    # Class này dùng để cấu hình bảng nhập liệu chi tiết trực tiếp (Inline) cho OrderItem trên giao diện Django Admin.
    model = OrderItem
    extra = 0
    readonly_fields = ('product_name', 'unit', 'unit_price', 'total_amount')


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    # Class này dùng để cấu hình giao diện quản trị Django Admin cho model Order.
    list_display = ('order_code', 'table', 'status', 'total_amount', 'created_by', 'created_at')
    list_filter = ('status', 'order_type')
    search_fields = ('order_code',)
    inlines = (OrderItemInline,)


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    # Class này dùng để cấu hình giao diện quản trị Django Admin cho model Invoice.
    list_display = ('invoice_code', 'order', 'total_amount', 'status', 'cashier', 'paid_at')
    list_filter = ('status', 'paid_at')
    search_fields = ('invoice_code', 'order__order_code')


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    # Class này dùng để cấu hình giao diện quản trị Django Admin cho model Payment.
    list_display = ('invoice', 'method', 'amount', 'created_by', 'paid_at')
    list_filter = ('method', 'paid_at')


@admin.register(Shift)
class ShiftAdmin(admin.ModelAdmin):
    # Class này dùng để cấu hình giao diện quản trị Django Admin cho model Shift.
    list_display = ('started_at', 'ended_at', 'status', 'opened_by', 'closed_by')
    list_filter = ('status', 'started_at')
