# File này chịu trách nhiệm định tuyến URL cho màn hình Bán hàng trung tâm (POS Home), Kết ca làm việc và Báo cáo doanh thu.
from django.urls import path

from .views import close_shift, home, reports

app_name = 'dashboard'

urlpatterns = [
    path('', home, name='home'),
    path('close-shift/', close_shift, name='close_shift'),
    path('reports/', reports, name='reports'),
]
