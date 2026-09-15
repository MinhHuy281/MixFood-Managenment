from functools import wraps

from django.core.exceptions import PermissionDenied


def role_required(*roles):
    allowed_roles = set(roles)

    def decorator(view_func):
        @wraps(view_func)
        def wrapped(request, *args, **kwargs):
            if not request.user.is_authenticated:
                raise PermissionDenied
            if request.user.is_superuser or request.user.groups.filter(name__in=allowed_roles).exists():
                return view_func(request, *args, **kwargs)
            raise PermissionDenied

        return wrapped

    return decorator