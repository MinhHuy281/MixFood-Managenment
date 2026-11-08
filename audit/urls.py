# File này chịu trách nhiệm định tuyến URL cho trang tra cứu, API dữ liệu và xuất Excel của phân hệ Nhật ký hoạt động.
from django.urls import path

from .views import activity_list, activity_api, activity_export_excel

app_name = 'audit'

urlpatterns = [
    path('', activity_list, name='activity'),
    path('api/logs/', activity_api, name='activity_api'),
    path('export/', activity_export_excel, name='activity_export_excel'),
]
