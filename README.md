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

## Phase 2: Danh mục, món ăn và nguyên liệu

Sau khi cập nhật code Phase 2:

```powershell
python manage.py makemigrations catalog
python manage.py migrate
python manage.py test catalog
```

Các màn hình:

- `/catalog/`: tổng quan dữ liệu catalog.
- `/catalog/categories/`: thêm, sửa, tìm kiếm và ngừng sử dụng danh mục.
- `/catalog/products/`: quản lý mã món, giá bán, loại món và trạng thái bán.
- `/catalog/ingredients/`: quản lý tồn hiện tại, tồn tối thiểu và nhà cung cấp.

Dữ liệu được lưu trong các bảng `catalog_category`, `catalog_product` và `catalog_ingredient`. Xóa trên giao diện là ngừng sử dụng (`soft delete`) để không phá lịch sử bán hàng về sau.

## Phase 3: Khu vực, bàn và POS dùng dữ liệu thật

```powershell
python manage.py makemigrations dining
python manage.py migrate
python manage.py test catalog dining dashboard
```

Các màn hình:

- `/dining/`: quản lý khu vực và bàn.
- `/`: POS lấy danh sách khu vực, bàn, danh mục và món trực tiếp từ MySQL.

Để tạo nhanh dữ liệu minh họa trong môi trường phát triển:

```powershell
python manage.py seed_demo
```

Lệnh này có thể chạy nhiều lần và cập nhật theo mã/tên dữ liệu demo. Các đơn hàng, hóa đơn và thanh toán chưa được tạo ở Phase 3; chúng thuộc Phase 4.

## Phase 4: Đơn hàng, hóa đơn và thanh toán

```powershell
python manage.py makemigrations sales
python manage.py migrate
python manage.py test catalog dining dashboard sales
```

Luồng thanh toán POS:

1. Chọn bàn.
2. Chọn món, mỗi lần bấm món sẽ tăng số lượng trong giỏ.
3. Chọn phương thức thanh toán.
4. Bấm `Thanh toán`.

Hệ thống tạo `Order`, `OrderItem`, `Invoice` và `Payment` trong cùng một database transaction. Hóa đơn thành công được hiển thị tại `/sales/invoices/` và bàn được trả về trạng thái trống.

## Phase 5: Kho, công thức và tự động trừ nguyên liệu

```powershell
python manage.py makemigrations inventory
python manage.py migrate
python manage.py test catalog dining dashboard sales inventory
```

Các màn hình:

- `/inventory/`: tồn nguyên liệu và lịch sử biến động kho.
- `/inventory/recipes/`: danh sách công thức món.
- `/admin/inventory/recipe/add/`: tạo công thức và định lượng nguyên liệu.
- `/catalog/ingredients/`: cập nhật nguyên liệu, tồn tối thiểu và giá vốn.

Khi một món có công thức được thanh toán, hệ thống khóa các nguyên liệu liên quan, kiểm tra đủ tồn, trừ tồn và ghi `StockTransaction` trong cùng transaction với `Order`, `Invoice` và `Payment`. Nếu thiếu bất kỳ nguyên liệu nào, toàn bộ thanh toán bị rollback và tồn kho không thay đổi.

Phiếu nhập kho có thể tạo trong Django Admin tại `/admin/inventory/stockreceipt/add/`. Nghiệp vụ nhập kho cập nhật tồn, tính lại giá vốn bình quân và tạo lịch sử nhập kho.

## Phase 6: Nhật ký hoạt động và phân quyền

Phase này không tạo module quản lý nhân viên hoặc ca làm việc theo phạm vi đã thống nhất. Tài khoản Django chỉ được dùng để đăng nhập, phân quyền và xác định người thực hiện thao tác.

```powershell
python manage.py makemigrations audit
python manage.py migrate
python manage.py setup_roles
python manage.py test audit sales inventory
```

Nhật ký hoạt động:

- `/audit/`: xem, tìm kiếm và lọc lịch sử thao tác.
- `/admin/audit/activitylog/`: quản trị toàn bộ nhật ký.
- Các request `POST` có người đăng nhập được ghi lại cùng người thực hiện, đường dẫn, IP, mã trạng thái và thời điểm.

Các nhóm quyền:

- `Owner`: toàn quyền.
- `Manager`: catalog, bàn, bán hàng, kho và audit.
- `Sales`: catalog cơ bản, bàn và bán hàng.
- `Warehouse`: nguyên liệu, món và nghiệp vụ kho.

Phân quyền được kiểm tra trực tiếp tại view bằng `role_required`: thanh toán chỉ dành cho `Owner`, `Manager`, `Sales`; kho và công thức dành cho `Owner`, `Manager`, `Warehouse`; nhật ký hoạt động dành cho `Owner`, `Manager`. Tài khoản đăng nhập nhưng không có role phù hợp nhận HTTP 403.

## Phase 7: Dashboard và báo cáo

Màn hình báo cáo tại `/reports/` dùng dữ liệu hóa đơn đã thanh toán trong MySQL.

- Lọc từ ngày đến ngày.
- Tổng doanh thu.
- Số lượng hóa đơn.
- Giá trị đơn hàng trung bình.
- Doanh thu theo phương thức thanh toán.
- Doanh thu theo danh mục món.
- Top món bán chạy theo số lượng và doanh thu.

Quyền xem báo cáo dành cho `Owner` và `Manager`. Không có hóa đơn thì báo cáo hiển thị trạng thái trống, không dùng số liệu mẫu.

## Phase 8: Validation, bảo mật và xử lý lỗi

- Trang lỗi POS cho HTTP 403, 404 và 500.
- Checkout kiểm tra số lượng, món đang bán, bàn hợp lệ và giảm giá không vượt tiền món trước khi ghi database.
- Các dòng trùng món trong một request được gộp số lượng.
- Production bật cookie secure, HSTS, chống MIME sniffing và cấu hình CSRF trusted origins qua `.env`.
- Test toàn bộ nghiệp vụ trước khi phát hành.