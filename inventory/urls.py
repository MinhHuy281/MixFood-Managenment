# File này chịu trách nhiệm định tuyến URL cho Quản lý Kho hàng, Xuất - Nhập - Tồn, Định lượng nguyên liệu (Recipes) và toàn bộ API kho.
from django.urls import path

from . import views

app_name = 'inventory'

urlpatterns = [
    # Báo cáo Xuất - Nhập - Tồn (Giữ nguyên)
    path('', views.inventory_home, name='home'),
    path('api/dashboard/', views.inventory_dashboard_api, name='dashboard_api'),
    path('api/receipts/', views.stock_receipts_api, name='receipts_api'),
    path('api/issues/', views.stock_issues_api, name='issues_api'),
    path('api/adjustments/', views.stock_adjustments_api, name='adjustments_api'),
    path('api/ledger/', views.stock_ledger_api, name='ledger_api'),
    path('export/', views.stock_export_excel, name='export_excel'),

    # Quản lý kho hàng: Nhập kho & Xuất từ Thùng tách ra Đồ hộp / Suất chờ bán
    path('manage/', views.warehouse_manage, name='manage'),
    path('api/manage-action/', views.warehouse_manage_action_api, name='manage_action_api'),

    # Định lượng món (Recipes / BOM)
    path('recipes/', views.recipe_list, name='recipes'),
    path('recipes/api/data/', views.recipe_data_api, name='recipe_data_api'),
    path('recipes/api/save-item/', views.recipe_save_item_api, name='recipe_save_item_api'),
    path('recipes/api/delete-item/<int:pk>/', views.recipe_delete_item_api, name='recipe_delete_item_api'),
    path('recipes/api/delete-recipe/<int:product_id>/', views.recipe_delete_recipe_api, name='recipe_delete_recipe_api'),
    path('recipes/api/copy-recipe/', views.recipe_copy_api, name='recipe_copy_api'),
    path('recipes/export/', views.recipe_export_excel, name='recipe_export_excel'),
    path('recipes/import/', views.recipe_import_excel, name='recipe_import_excel'),
]
