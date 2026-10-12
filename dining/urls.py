from django.urls import path

from . import views

app_name = 'dining'

urlpatterns = [
    path('', views.dining_home, name='home'),
    path('api/data/', views.dining_data_api, name='data_api'),
    path('api/save-area/', views.dining_save_area, name='save_area'),
    path('api/delete-area/<int:pk>/', views.dining_delete_area, name='delete_area'),
    path('api/save-table/', views.dining_save_table, name='save_table'),
    path('api/delete-table/<int:pk>/', views.dining_delete_table, name='delete_table'),
    path('export/', views.dining_export_excel, name='export_excel'),
    path('import/', views.dining_import_excel, name='import_excel'),
    # Legacy routes for compatibility
    path('areas/add/', views.area_create, name='area_create'),
    path('areas/<int:pk>/edit/', views.area_update, name='area_update'),
    path('areas/<int:pk>/delete/', views.area_delete, name='area_delete'),
    path('tables/add/', views.table_create, name='table_create'),
    path('tables/<int:pk>/edit/', views.table_update, name='table_update'),
    path('tables/<int:pk>/delete/', views.table_delete, name='table_delete'),
]