from functools import wraps

from django.core.exceptions import PermissionDenied
from django.http import JsonResponse


def role_required(*roles):
    allowed_roles = set(roles)
    if 'Sales' in allowed_roles or 'Cashier' in allowed_roles:
        allowed_roles.update({'Sales', 'Cashier'})

    def decorator(view_func):
        @wraps(view_func)
        def wrapped(request, *args, **kwargs):
            if not request.user.is_authenticated:
                if request.headers.get('Content-Type') == 'application/json' or '/api/' in request.path or request.path.startswith('/sales/'):
                    return JsonResponse({'error': 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'}, status=401)
                raise PermissionDenied

            # Nếu đã xác thực tạm thời qua popup "Yêu cầu quyền hạn" trên POS
            if request.session.get('pos_elevated_auth'):
                return view_func(request, *args, **kwargs)

            # Nếu view cho phép Sales/Cashier thì mọi nhân viên POS đã đăng nhập đều được phép thao tác
            if 'Sales' in allowed_roles and request.user.is_active:
                return view_func(request, *args, **kwargs)

            if request.user.is_superuser or request.user.groups.filter(name__in=allowed_roles).exists():
                return view_func(request, *args, **kwargs)

            if request.headers.get('Content-Type') == 'application/json' or '/api/' in request.path or request.path.startswith('/sales/'):
                return JsonResponse({'error': 'Tài khoản của bạn chưa được cấp quyền thực hiện thao tác này.', 'require_elevation': True}, status=403)
            raise PermissionDenied

        return wrapped

    return decorator