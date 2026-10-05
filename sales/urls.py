from django.urls import path

from . import views

app_name = 'sales'

urlpatterns = [
    path('checkout/', views.checkout, name='checkout'),
    path('invoices/edit/', views.edit_invoice, name='edit_invoice'),
    path('invoices/delete/', views.delete_invoice, name='delete_invoice'),
    path('invoices/', views.invoice_list, name='invoices'),
]