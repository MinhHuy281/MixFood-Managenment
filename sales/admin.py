from django.contrib import admin

from .models import Invoice, Order, OrderItem, Payment


class OrderItemInline(admin.TabularInline):
	model = OrderItem
	extra = 0
	readonly_fields = ('product_name', 'unit', 'unit_price', 'total_amount')


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
	list_display = ('order_code', 'table', 'status', 'total_amount', 'created_by', 'created_at')
	list_filter = ('status', 'order_type')
	search_fields = ('order_code',)
	inlines = (OrderItemInline,)


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
	list_display = ('invoice_code', 'order', 'total_amount', 'status', 'cashier', 'paid_at')
	list_filter = ('status', 'paid_at')
	search_fields = ('invoice_code', 'order__order_code')


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
	list_display = ('invoice', 'method', 'amount', 'created_by', 'paid_at')
	list_filter = ('method', 'paid_at')
