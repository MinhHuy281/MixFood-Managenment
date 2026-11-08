# File này chịu trách nhiệm cấu hình giao thức WSGI phục vụ triển khai ứng dụng lên máy chủ sản xuất (Production Server).
import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
application = get_wsgi_application()
