#!/bin/sh
# File này chịu trách nhiệm khởi chạy tự động migrations, thu thập static files, tạo quyền mặc định và bật máy chủ Gunicorn khi chạy Docker container.
set -e

echo "=== [MixFood POS] Đang áp dụng Database Migrations ==="
python manage.py migrate --noinput

echo "=== [MixFood POS] Đang khởi tạo nhóm quyền mặc định ==="
python manage.py setup_roles

echo "=== [MixFood POS] Đang thu thập tài nguyên tĩnh (Static Files) ==="
python manage.py collectstatic --noinput

echo "=== [MixFood POS] Khởi động máy chủ Gunicorn trên cổng 8000 ==="
exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 3 --timeout 120
