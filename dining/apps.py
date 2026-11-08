# File này chịu trách nhiệm khai báo cấu hình ứng dụng DiningConfig cho phân hệ Khu vực & Bàn ăn.
from django.apps import AppConfig


class DiningConfig(AppConfig):
    # Class này dùng để cấu hình thông tin ứng dụng Quản lý Khu vực & Bàn ăn (dining) trong Django.
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'dining'
