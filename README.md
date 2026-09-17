# MixFood Manager

Hệ thống quản lý bán hàng cho cửa hàng đồ ăn Thái, xây dựng bằng Django,
MySQL, HTML/CSS và JavaScript. Dữ liệu món ăn, bàn, đơn hàng, hóa đơn, kho
và báo cáo đều được lưu trong cơ sở dữ liệu.

## Chức năng đã hoàn thành

- Đăng nhập, phân quyền `Owner`, `Manager`, `Sales`, `Warehouse` và nhật ký hoạt động.
- Quản lý danh mục, món ăn, nguyên liệu, khu vực và bàn.
- POS: chọn bàn/món, thanh toán, tạo đơn hàng, hóa đơn và thanh toán.
- Công thức món, nhập kho và tự động trừ nguyên liệu khi thanh toán.
- Danh sách hóa đơn, dashboard và báo cáo doanh thu theo khoảng ngày.
- Validation checkout, trang lỗi 403/404/500 và cấu hình bảo mật production.

## Yêu cầu

- Python 3.14+ (hoặc phiên bản tương thích với các package trong `requirements.txt`)
- MySQL 8+
- Pip và MySQL client development libraries (cần thiết để cài `mysqlclient`)

## Cài đặt môi trường phát triển

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Tạo cơ sở dữ liệu và tài khoản MySQL, sau đó thay các giá trị `DB_*` trong
`.env`. Không commit file `.env`.

```sql
CREATE DATABASE thai_food_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'mixfood'@'localhost' IDENTIFIED BY 'a-strong-password';
GRANT ALL PRIVILEGES ON thai_food_manager.* TO 'mixfood'@'localhost';
FLUSH PRIVILEGES;
```

Chạy migration, tạo nhóm quyền và tài khoản quản trị:

```powershell
python manage.py migrate
python manage.py setup_roles
python manage.py createsuperuser
python manage.py seed_demo
python manage.py runserver
```

Truy cập `http://127.0.0.1:8000/accounts/login/` để đăng nhập. `seed_demo`
là tùy chọn và có thể chạy lại an toàn để tạo dữ liệu minh họa.

## Kiểm thử

```powershell
python manage.py check
python manage.py test accounts audit catalog dining dashboard sales inventory
```

Các test kiểm tra phân quyền, CRUD chính, POS checkout, chống tạo dữ liệu dở
dang khi request lỗi, trừ kho theo công thức, báo cáo và nhật ký hoạt động.

## Chuẩn bị triển khai

1. Sao chép `.env.example` thành `.env`; đặt `DEBUG=False`, secret key mới,
   `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS` và thông tin MySQL production.
2. Chạy migration và thu thập static:

```bash
python manage.py migrate
python manage.py collectstatic --noinput
python manage.py check --deploy
```

3. Đặt Django sau reverse proxy HTTPS (ví dụ Nginx). Khi HTTPS đã hoạt động,
   giữ `SECURE_SSL_REDIRECT=True`; khi chưa có HTTPS, đặt nó là `False` để
   tránh vòng chuyển hướng.
4. Trên Linux, có thể chạy ứng dụng bằng Gunicorn:

```bash
gunicorn config.wsgi:application --bind 127.0.0.1:8000 --workers 3
```

Nginx/IIS cần phục vụ thư mục `staticfiles/` và chuyển request ứng dụng đến
Gunicorn (hoặc WSGI server tương đương). Không chạy `runserver` trong môi
trường production.

## Lệnh hữu ích

```powershell
python manage.py makemigrations
python manage.py migrate
python manage.py test
python manage.py check --deploy
```
