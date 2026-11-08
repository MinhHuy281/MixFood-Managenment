# File này chịu trách nhiệm làm điểm khởi chạy dòng lệnh (CLI Entrypoint) của Django để quản trị dự án, chạy máy chủ, tạo migration và kiểm thử.
import os
import sys


def main():
    # Hàm này dùng để khởi chạy trình quản lý lệnh hành chính của Django (Input: tham số dòng lệnh sys.argv; Output: thực thi lệnh hệ thống tương ứng).
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
