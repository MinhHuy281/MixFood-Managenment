# File này chịu trách nhiệm định tuyến URL gốc (Root URLconf), kết nối URL của tất cả các phân hệ chức năng và cấu hình trang xử lý lỗi 403/404/500.
from django.contrib import admin
from django.urls import include, path

from dashboard.admin_views import (
    admin_activity_view,
    admin_dining_save_api,
    admin_dining_view,
    admin_inventory_save_api,
    admin_inventory_view,
    admin_live_api,
    admin_live_dashboard,
    admin_login_view,
    admin_logout_view,
    admin_menu_save_api,
    admin_menu_view,
    admin_permissions_save_api,
    admin_permissions_view,
    admin_recipes_view,
    admin_table_detail_api,
    admin_users_delete_api,
    admin_users_save_api,
    admin_users_view,
)

urlpatterns = [
    # Admin Live Remote Dashboard (100% Mobile & Real-time Live User Monitoring)
    path('admin/login/', admin_login_view, name='admin_login'),
    path('admin/logout/', admin_logout_view, name='admin_logout'),
    path('admin/', admin_live_dashboard, name='admin_live_dashboard'),
    path('admin/live-api/', admin_live_api, name='admin_live_api'),
    path('admin/table-detail/<int:table_id>/', admin_table_detail_api, name='admin_table_detail_api'),

    # Phân hệ Quản trị Admin Mobile riêng biệt (100% Mobile-first, không dính phiên POS)
    path('admin/users/', admin_users_view, name='admin_users'),
    path('admin/api/users/save/', admin_users_save_api, name='admin_users_save_api'),
    path('admin/api/users/delete/<int:user_id>/', admin_users_delete_api, name='admin_users_delete_api'),

    path('admin/permissions/', admin_permissions_view, name='admin_permissions'),
    path('admin/api/permissions/save/', admin_permissions_save_api, name='admin_permissions_save_api'),

    path('admin/activity/', admin_activity_view, name='admin_activity'),

    path('admin/inventory/', admin_inventory_view, name='admin_inventory'),
    path('admin/api/inventory/save/', admin_inventory_save_api, name='admin_inventory_save_api'),

    path('admin/menu/', admin_menu_view, name='admin_menu'),
    path('admin/api/menu/save/', admin_menu_save_api, name='admin_menu_save_api'),

    path('admin/recipes/', admin_recipes_view, name='admin_recipes'),

    path('admin/dining/', admin_dining_view, name='admin_dining'),
    path('admin/api/dining/save/', admin_dining_save_api, name='admin_dining_save_api'),

    # Django Models Admin gốc (vẫn bảo toàn nguyên vẹn tại /admin/django/)
    path('admin/django/', admin.site.urls),

    path('accounts/', include('accounts.urls', namespace='accounts')),
    path('catalog/', include('catalog.urls', namespace='catalog')),
    path('dining/', include('dining.urls', namespace='dining')),
    path('sales/', include('sales.urls', namespace='sales')),
    path('inventory/', include('inventory.urls', namespace='inventory')),
    path('audit/', include('audit.urls', namespace='audit')),
    path('', include('dashboard.urls', namespace='dashboard')),
]

handler403 = 'config.views.permission_denied'
handler404 = 'config.views.page_not_found'
handler500 = 'config.views.server_error'
