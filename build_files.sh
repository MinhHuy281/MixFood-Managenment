#!/bin/bash
# File này chịu trách nhiệm thực thi quá trình build trên Vercel: cài đặt dependencies và thu thập static files.
set -e

echo "=== [Vercel Build] Đang cài đặt thư viện Python ==="
if command -v uv >/dev/null 2>&1; then
    uv pip install -r requirements.txt --system || python3 -m pip install -r requirements.txt --break-system-packages
else
    python3 -m pip install -r requirements.txt --break-system-packages || python3 -m pip install -r requirements.txt
fi

echo "=== [Vercel Build] Đang thu thập static files (collectstatic) ==="
python3 manage.py collectstatic --noinput --clear

echo "=== [Vercel Build] Build hoàn tất thành công! ==="
