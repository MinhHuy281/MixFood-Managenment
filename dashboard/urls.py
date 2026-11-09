# File này chịu trách nhiệm định tuyến URL cho màn hình Bán hàng trung tâm (POS Home), Kết ca làm việc và Báo cáo doanh thu.
from django.urls import path

from .views import close_shift, home, reports, shift_close_print_view

app_name = 'dashboard'

urlpatterns = [
    path('', home, name='home'),
    path('close-shift/', close_shift, name='close_shift'),
    path('close-shift/print/', shift_close_print_view, name='shift_close_print'),
    path('close-shift/print/<int:shift_id>/', shift_close_print_view, name='shift_close_print_detail'),
    path('reports/', reports, name='reports'),
]
