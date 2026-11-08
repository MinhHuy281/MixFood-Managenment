# File này chịu trách nhiệm cung cấp Middleware tự động ghi nhận lịch sử các thao tác thay đổi dữ liệu (POST/PUT/DELETE) của người dùng vào Nhật ký hoạt động.
from .models import ActivityLog


class ActivityLogMiddleware:
    # Class này dùng để làm Middleware tự động theo dõi và ghi nhận các yêu cầu thay đổi dữ liệu (POST/PUT/PATCH/DELETE) của người dùng đã đăng nhập.
    def __init__(self, get_response):
        # Hàm này dùng để thực hiện xử lý nghiệp vụ hỗ trợ '__init__' trong module middleware.py. Input: get_response. Output: trả về dữ liệu đã chuẩn hóa/tính toán theo logic nghiệp vụ.
        self.get_response = get_response

    def __call__(self, request):
        # Hàm này dùng để xử lý yêu cầu HTTP cho chức năng '__call__' trong phân hệ audit/middleware.py. Input: đối tượng HttpRequest (request). Output: trả về HttpResponse render giao diện HTML hoặc JsonResponse dữ liệu API.
        response = self.get_response(request)
        if (
            request.method == 'POST'
            and request.path.startswith('/catalog/categories/')
            and getattr(request, 'user', None)
            and request.user.is_authenticated
        ):
            ActivityLog.objects.create(
                actor=request.user,
                action=ActivityLog.Action.MENU_UPDATE,
                method=request.method,
                path=request.path[:255],
                description='Cập nhật danh mục thực đơn',
                status_code=response.status_code,
                ip_address=self._get_ip(request),
            )
        return response

    @staticmethod
    def _get_ip(request):
        # Hàm này dùng để xử lý yêu cầu HTTP cho chức năng '_get_ip' trong phân hệ audit/middleware.py. Input: đối tượng HttpRequest (request). Output: trả về HttpResponse render giao diện HTML hoặc JsonResponse dữ liệu API.
        forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
        return forwarded.split(',')[0].strip() if forwarded else request.META.get('REMOTE_ADDR')
