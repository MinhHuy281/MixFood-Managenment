# File này chịu trách nhiệm khai báo cấu hình ứng dụng AccountsConfig cho phân hệ Quản lý Tài khoản.
from django.apps import AppConfig


class AccountsConfig(AppConfig):
    # Class này dùng để cấu hình thông tin ứng dụng Quản lý Tài khoản & Phân quyền (accounts) trong Django.
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'accounts'
