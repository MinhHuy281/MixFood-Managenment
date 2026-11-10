#!/bin/bash
# File này chịu trách nhiệm thực thi quá trình build trên Vercel: cài đặt dependencies và thu thập static files.
set -e

echo "=== [Vercel Build] Đang cài đặt thư viện Python ==="
python3 -m pip install -r requirements.txt

echo "=== [Vercel Build] Đang thu thập static files (collectstatic) ==="
python3 manage.py collectstatic --noinput --clear

echo "=== [Vercel Build] Build hoàn tất thành công! ==="
