# File này chịu trách nhiệm định nghĩa cấu hình đóng gói Docker Image cho ứng dụng Django MixFood-Management.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=config.settings

WORKDIR /app

# Cài đặt các gói hệ thống cần thiết cho mysqlclient và Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    default-libmysqlclient-dev \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Cài đặt thư viện Python
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r /app/requirements.txt

# Sao chép toàn bộ mã nguồn dự án
COPY . /app/

# Phân quyền thực thi cho script khởi chạy và kiểm tra collectstatic
RUN chmod +x /app/scripts/entrypoint.sh && \
    SECRET_KEY="docker-build-temp-secret" DEBUG="False" ALLOWED_HOSTS="127.0.0.1,localhost" \
    python manage.py collectstatic --noinput

EXPOSE 8000

ENTRYPOINT ["/app/scripts/entrypoint.sh"]
