from django.urls import path

from . import views

app_name = 'sales'

urlpatterns = [
    path('checkout/', views.checkout, name='checkout'),
    path('invoices/', views.invoice_list, name='invoices'),
]