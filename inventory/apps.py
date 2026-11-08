# File này chịu trách nhiệm khai báo cấu hình ứng dụng InventoryConfig cho phân hệ Quản lý Kho hàng.
from django.apps import AppConfig


class InventoryConfig(AppConfig):
    # Class này dùng để cấu hình thông tin ứng dụng Quản lý Kho hàng & Định lượng nguyên liệu (inventory) trong Django.
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'inventory'
