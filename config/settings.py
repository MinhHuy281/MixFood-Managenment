# File này chịu trách nhiệm thiết lập toàn bộ cấu hình hệ thống Django: cơ sở dữ liệu, ứng dụng cài đặt, middleware, templates, static files và bảo mật.
import os
from pathlib import Path

from dotenv import load_dotenv

# Đường dẫn thư mục gốc của dự án
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env')

# Cấu hình bảo mật và môi trường thực thi
SECRET_KEY = os.getenv('SECRET_KEY', 'django-insecure-development-only-change-me')
DEBUG = os.getenv('DEBUG', 'True').lower() in {'1', 'true', 'yes'}
ALLOWED_HOSTS = [host.strip() for host in os.getenv('ALLOWED_HOSTS', '127.0.0.1,localhost,testserver').split(',') if host.strip()]
if '.vercel.app' not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append('.vercel.app')

raw_csrf = os.getenv('CSRF_TRUSTED_ORIGINS', 'https://*.vercel.app')
CSRF_TRUSTED_ORIGINS = [origin.strip() for origin in raw_csrf.split(',') if origin.strip()]
if 'https://*.vercel.app' not in CSRF_TRUSTED_ORIGINS:
    CSRF_TRUSTED_ORIGINS.append('https://*.vercel.app')

# Danh sách các ứng dụng (Phân hệ chức năng) trong hệ thống
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'accounts',
    'dashboard',
    'catalog',
    'dining',
    'sales',
    'inventory',
    'audit',
]

# Chuỗi Middleware xử lý request/response
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'accounts.middleware.DualSessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'audit.middleware.ActivityLogMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

# Cấu hình hệ thống Template HTML
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# Cấu hình kết nối Cơ sở dữ liệu MySQL
db_options = {'charset': 'utf8mb4'}
db_host = os.getenv('DB_HOST', '127.0.0.1')
if os.getenv('DB_SSL', 'False').lower() in {'1', 'true', 'yes'} or 'aivencloud.com' in db_host:
    db_options['ssl'] = {'check_hostname': False}

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': os.getenv('DB_NAME', 'mixfood_manager'),
        'USER': os.getenv('DB_USER', 'root'),
        'PASSWORD': os.getenv('DB_PASSWORD', ''),
        'HOST': db_host,
        'PORT': os.getenv('DB_PORT', '3306'),
        'OPTIONS': db_options,
    }
}

# Bộ kiểm tra độ mạnh mật khẩu
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# Cấu hình Ngôn ngữ, Múi giờ và Kiểu khóa chính mặc định
LANGUAGE_CODE = 'vi'
TIME_ZONE = 'Asia/Ho_Chi_Minh'
USE_I18N = True
USE_TZ = True
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Cấu hình đường dẫn Static Files (CSS, JS) và WhiteNoise cho Vercel / Production
STATIC_URL = 'static/'
STATICFILES_DIRS = [BASE_DIR / 'static']
STATIC_ROOT = BASE_DIR / 'staticfiles_build' / 'static'

STORAGES = {
    'default': {
        'BACKEND': 'django.core.files.storage.FileSystemStorage',
    },
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedStaticFilesStorage',
    },
}

# Đường dẫn điều hướng Xác thực người dùng
LOGIN_URL = 'accounts:login'
LOGIN_REDIRECT_URL = 'dashboard:home'
LOGOUT_REDIRECT_URL = 'accounts:login'

# Hỗ trợ nhận diện HTTPS và Host qua Reverse Proxy (Vercel, Nginx, Docker)
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_X_FORWARDED_HOST = True
USE_X_FORWARDED_PORT = True

if not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_SSL_REDIRECT = os.getenv('SECURE_SSL_REDIRECT', 'False').lower() in {'1', 'true', 'yes'}
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = 'DENY'
