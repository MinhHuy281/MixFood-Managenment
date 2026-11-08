# File này chịu trách nhiệm định tuyến URL (URL Routing) cho các trang và API thuộc phân hệ Tài khoản & Phân quyền.
from django.urls import path

from .views import (
    AccountLoginView,
    AccountLogoutView,
    AccountPasswordChangeView,
    api_change_password,
    api_forgot_password,
    api_register_user,
    permission_api_clear_elevation,
    permission_api_get,
    permission_api_save,
    permission_api_verify,
    user_api_delete,
    user_api_list,
    user_api_save,
    user_api_toggle_config,
    user_list_view,
)

app_name = 'accounts'

urlpatterns = [
    path('login/', AccountLoginView.as_view(), name='login'),
    path('logout/', AccountLogoutView.as_view(), name='logout'),
    path('change-password/', AccountPasswordChangeView.as_view(), name='change_password'),
    path('users/', user_list_view, name='user_list'),
    path('api/users/', user_api_list, name='user_api_list'),
    path('api/users/save/', user_api_save, name='user_api_save'),
    path('api/users/delete/<int:user_id>/', user_api_delete, name='user_api_delete'),
    path('api/users/config/', user_api_toggle_config, name='user_api_toggle_config'),
    path('api/permissions/', permission_api_get, name='permission_api_get'),
    path('api/permissions/save/', permission_api_save, name='permission_api_save'),
    path('api/permissions/verify/', permission_api_verify, name='permission_api_verify'),
    path('api/permissions/clear-elevation/', permission_api_clear_elevation, name='permission_api_clear_elevation'),
    path('api/forgot-password/', api_forgot_password, name='api_forgot_password'),
    path('api/change-password/', api_change_password, name='api_change_password'),
    path('api/register/', api_register_user, name='api_register_user'),
]
