# MixFood Manager

Hệ thống quản lý bán hàng cho cửa hàng đồ ăn Thái, xây dựng bằng Django và MySQL.

## Yêu cầu

- Python 3.14 hoặc mới hơn
- MySQL 8+

## Cài đặt

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Tạo database và user MySQL, sau đó cập nhật các giá trị trong `.env`:

```sql
CREATE DATABASE thai_food_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'mixfood'@'localhost' IDENTIFIED BY 'change-this-password';
GRANT ALL PRIVILEGES ON thai_food_manager.* TO 'mixfood'@'localhost';
FLUSH PRIVILEGES;
```

Đổi `DB_USER`, `DB_PASSWORD` trong `.env` thành tài khoản vừa tạo. Không commit `.env`.

## Khởi chạy Phase 1

```powershell
python manage.py migrate
python manage.py setup_roles
python manage.py createsuperuser
python manage.py runserver
```

Mở `http://127.0.0.1:8000/accounts/login/` để đăng nhập. Dashboard yêu cầu xác thực; tài khoản quản trị được tạo bằng `createsuperuser`.

## Kiểm tra

```powershell
python manage.py check
```

Lệnh kiểm tra cần MySQL đang chạy và các thông tin `DB_*` trong `.env` hợp lệ.

## Phạm vi Phase 1

- Django project và cấu hình MySQL.
- Biến môi trường cho secret key, host và database credentials.
- Đăng nhập, đăng xuất và CSRF.
- Nhóm quyền `Owner`, `Manager`, `Sales`, `Warehouse`.
- Layout responsive và dashboard nền.

Các module món ăn, POS, hóa đơn, kho và báo cáo sẽ được triển khai ở các phase tiếp theo.