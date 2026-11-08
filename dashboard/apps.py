# File này chịu trách nhiệm khai báo cấu hình ứng dụng DashboardConfig cho phân hệ Màn hình chính POS & Báo cáo.
from django.apps import AppConfig


class DashboardConfig(AppConfig):
    # Class này dùng để cấu hình thông tin ứng dụng Màn hình thu ngân POS & Báo cáo tổng quan (dashboard) trong Django.
    name = 'dashboard'
