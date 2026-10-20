from django.urls import path

from . import views

app_name = 'sales'

urlpatterns = [
    path('checkout/', views.checkout, name='checkout'),
    path('invoices/detail/<str:invoice_code>/', views.invoice_detail_api, name='invoice_detail_api'),
    path('invoices/edit/', views.edit_invoice, name='edit_invoice'),
    path('invoices/delete/', views.delete_invoice, name='delete_invoice'),
    path('invoices/undo/', views.undo_payment, name='undo_payment'),
    path('invoices/', views.invoice_list, name='invoices'),
    path('tables/action/', views.table_action_api, name='table_action_api'),
    path('statistics/api/', views.sales_statistics_api, name='statistics_api'),
    path('statistics/export/', views.sales_statistics_export_excel, name='statistics_export'),
    path('statistics/print/', views.sales_statistics_print, name='statistics_print'),
]