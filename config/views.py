# File này chịu trách nhiệm xử lý và hiển thị các trang thông báo lỗi hệ thống tùy chỉnh (403 Forbidden, 404 Not Found, 500 Server Error).
from django.shortcuts import render


def permission_denied(request, exception=None):
    # Hàm này dùng để xử lý yêu cầu HTTP cho chức năng 'permission_denied' trong phân hệ config/views.py. Input: đối tượng HttpRequest (request, exception). Output: trả về HttpResponse render giao diện HTML hoặc JsonResponse dữ liệu API.
    return render(request, 'errors/403.html', status=403)


def page_not_found(request, exception=None):
    # Hàm này dùng để xử lý yêu cầu HTTP cho chức năng 'page_not_found' trong phân hệ config/views.py. Input: đối tượng HttpRequest (request, exception). Output: trả về HttpResponse render giao diện HTML hoặc JsonResponse dữ liệu API.
    return render(request, 'errors/404.html', status=404)


def server_error(request):
    # Hàm này dùng để xử lý yêu cầu HTTP cho chức năng 'server_error' trong phân hệ config/views.py. Input: đối tượng HttpRequest (request). Output: trả về HttpResponse render giao diện HTML hoặc JsonResponse dữ liệu API.
    return render(request, 'errors/500.html', status=500)
