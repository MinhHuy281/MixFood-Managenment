from .models import ActivityLog


class ActivityLogMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.method == 'POST' and getattr(request, 'user', None) and request.user.is_authenticated:
            action = ActivityLog.Action.PAYMENT if request.path.endswith('/checkout/') else ActivityLog.Action.OTHER
            description = f'{request.method} {request.path}'
            if action == ActivityLog.Action.PAYMENT:
                description = 'Thực hiện thanh toán tại POS'
            ActivityLog.objects.create(
                actor=request.user,
                action=action,
                method=request.method,
                path=request.path[:255],
                description=description,
                status_code=response.status_code,
                ip_address=self._get_ip(request),
            )
        return response

    @staticmethod
    def _get_ip(request):
        forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
        return forwarded.split(',')[0].strip() if forwarded else request.META.get('REMOTE_ADDR')