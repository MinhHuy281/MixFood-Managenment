# File này chịu trách nhiệm khai báo cấu hình ứng dụng SalesConfig cho phân hệ Bán hàng & Hóa đơn.
from django.apps import AppConfig


class SalesConfig(AppConfig):
    # Class này dùng để cấu hình thông tin ứng dụng Bán hàng, Hóa đơn & Thống kê doanh thu (sales) trong Django.
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'sales'
