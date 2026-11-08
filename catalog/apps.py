# File này chịu trách nhiệm khai báo cấu hình ứng dụng CatalogConfig cho phân hệ Danh mục Thực đơn & Mặt hàng.
from django.apps import AppConfig


class CatalogConfig(AppConfig):
    # Class này dùng để cấu hình thông tin ứng dụng Danh mục Thực đơn & Nguyên liệu (catalog) trong Django.
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'catalog'
