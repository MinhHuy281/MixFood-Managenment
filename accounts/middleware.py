# File này chịu trách nhiệm tách biệt hoàn toàn phiên đăng nhập (Dual Session Isolation) giữa hệ thống POS bán hàng và trang Quản trị Admin.
import time
from importlib import import_module

from django.conf import settings
from django.contrib.sessions.backends.base import UpdateError
from django.contrib.sessions.exceptions import SessionInterrupted
from django.contrib.sessions.middleware import SessionMiddleware
from django.utils.cache import patch_vary_headers
from django.utils.http import http_date


class DualSessionMiddleware(SessionMiddleware):
    """
    Class này dùng để tách biệt Session cookie giữa giao diện Admin và hệ thống POS bán hàng.
    Khi request đi vào /admin/, middleware sử dụng cookie 'admin_sessionid'.
    Với các request bán hàng POS (/sales/, /dining/, v.v.), middleware sử dụng cookie 'sessionid' chuẩn.
    Nhờ đó Quản trị viên và Thu ngân có thể đăng nhập song song trên cùng một trình duyệt mà không bị đá phiên nhau.
    """

    ADMIN_COOKIE_NAME = 'admin_sessionid'

    def get_cookie_name(self, request):
        """
        Hàm này dùng để xác định tên cookie Session phù hợp theo đường dẫn URL của request.
        Input: request (HttpRequest).
        Output: str ('admin_sessionid' nếu request.path bắt đầu bằng '/admin/', ngược lại trả về settings.SESSION_COOKIE_NAME).
        """
        if request.path.startswith('/admin/'):
            return self.ADMIN_COOKIE_NAME
        return settings.SESSION_COOKIE_NAME

    def process_request(self, request):
        """
        Hàm này dùng để nạp phiên Session tương ứng từ cookie request.
        Input: request (HttpRequest).
        Output: None (gán đối tượng request.session và lưu _session_cookie_name).
        """
        cookie_name = self.get_cookie_name(request)
        request._session_cookie_name = cookie_name
        session_key = request.COOKIES.get(cookie_name)
        request.session = self.SessionStore(session_key)

    def process_response(self, request, response):
        """
        Hàm này dùng để lưu Session và ghi cookie phản hồi (admin_sessionid hoặc sessionid) độc lập cho client.
        Input: request (HttpRequest), response (HttpResponse).
        Output: HttpResponse (kèm Set-Cookie hoặc Delete-Cookie phù hợp).
        """
        try:
            accessed = request.session.accessed
            modified = request.session.modified
            empty = request.session.is_empty()
        except AttributeError:
            return response

        cookie_name = getattr(request, '_session_cookie_name', self.get_cookie_name(request))

        if cookie_name in request.COOKIES and empty:
            response.delete_cookie(
                cookie_name,
                path=settings.SESSION_COOKIE_PATH,
                domain=settings.SESSION_COOKIE_DOMAIN,
                samesite=settings.SESSION_COOKIE_SAMESITE,
            )
            need_vary_cookie = True
        else:
            need_vary_cookie = accessed
            if (modified or settings.SESSION_SAVE_EVERY_REQUEST) and not empty:
                if request.session.get_expire_at_browser_close():
                    max_age = None
                    expires = None
                else:
                    max_age = request.session.get_expiry_age()
                    expires_time = time.time() + max_age
                    expires = http_date(expires_time)

                if response.status_code < 500:
                    try:
                        request.session.save()
                    except UpdateError:
                        raise SessionInterrupted(
                            "The request's session was deleted before the "
                            "request completed. The user may have logged "
                            "out in a concurrent request, for example."
                        )
                    response.set_cookie(
                        cookie_name,
                        request.session.session_key,
                        max_age=max_age,
                        expires=expires,
                        domain=settings.SESSION_COOKIE_DOMAIN,
                        path=settings.SESSION_COOKIE_PATH,
                        secure=settings.SESSION_COOKIE_SECURE or None,
                        httponly=settings.SESSION_COOKIE_HTTPONLY or None,
                        samesite=settings.SESSION_COOKIE_SAMESITE,
                    )
                    need_vary_cookie = True

        if need_vary_cookie:
            patch_vary_headers(response, ("Cookie",))
        return response
