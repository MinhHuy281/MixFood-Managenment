# File này chịu trách nhiệm cấu hình giao thức ASGI phục vụ triển khai máy chủ bất đồng bộ cho dự án.
import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
application = get_asgi_application()
