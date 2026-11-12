# MixFood Management

> Hệ thống quản lý bán hàng (POS) và quản lý kho nhà hàng, xây dựng trên nền tảng Python/Django kết hợp MySQL và giao diện thuần HTML/CSS/JavaScript.

Dự án tập trung giải quyết bài toán kiểm soát nguyên vật liệu thực tế cho mô hình F&B: từ lúc nhập hàng vào kho, thiết lập định lượng công thức cho từng món ăn (BOM), đến khi thu ngân thanh toán trên POS và tự động khấu trừ tồn kho theo thời gian thực.

---

## Tính năng chính

- **Tự động trừ kho khi bán hàng:** Ngay khi đơn hàng được thanh toán, hệ thống tự tính và trừ lượng nguyên vật liệu tương ứng trong kho. Nếu thu ngân chỉnh sửa, hủy hoặc trả món, phần nguyên liệu đã trừ sẽ được hoàn lại tự động.
- **Định lượng công thức món (BOM):** Cho phép khai báo chi tiết thành phần nguyên liệu cho từng món ăn, thức uống theo đơn vị tính (gram, ml, cái, phần...). Hỗ trợ sao chép nhanh công thức giữa các món và import/export bằng file Excel.
- **Quản lý kho theo danh mục:** Phân nhóm nguyên liệu rõ ràng (thực phẩm tươi sống, hàng khô/đóng gói, đồ uống...), theo dõi phiếu nhập kho, xuất kho, lịch sử biến động và tồn kho hiện tại.
- **Bán hàng POS & Sơ đồ bàn:** Hỗ trợ chọn bàn theo khu vực, gọi món, báo bếp, tách/gộp bàn, áp dụng mã giảm giá và in hóa đơn khổ K80 kèm mã QR.
- **Phân quyền & Nhật ký thao tác:** Chia tách quyền hạn rõ ràng theo từng vị trí (`Owner`, `Manager`, `Sales`, `Warehouse`), lưu lại lịch sử thao tác quan trọng và tách riêng phiên đăng nhập giữa màn hình thu ngân với trang quản trị (`/admin/`).

---

## Công nghệ sử dụng

- **Backend:** Python 3.12+, Django 5.2
- **Frontend:** HTML5, CSS3, JavaScript (thuần, không dùng framework ngoài)
- **Cơ sở dữ liệu:** MySQL 8.0+ (sử dụng driver `PyMySQL`)
- **Static & Triển khai:** WhiteNoise, Gunicorn, Docker, Vercel

---

## Cấu trúc dự án

Mã nguồn được tổ chức theo hướng **Modular**, mỗi nghiệp vụ nằm trong một app Django riêng biệt. Giao diện (`templates/`) và tài nguyên tĩnh (`static/`) được tách hoàn toàn khỏi phần xử lý logic ở Backend. Các class và function quan trọng đều có comment giải thích rõ ràng.

```text
MixFood-Management/
├── accounts/           # Đăng nhập, phân quyền và quản lý phiên (DualSessionMiddleware)
├── audit/              # Lưu nhật ký hoạt động của nhân viên
├── catalog/            # Quản lý danh mục, thực đơn món ăn và nguyên vật liệu
├── dining/             # Quản lý khu vực và sơ đồ bàn ăn
├── inventory/          # Quản lý kho, phiếu nhập/xuất và công thức món (BOM)
├── sales/              # Xử lý gọi món POS, thanh toán, hóa đơn và in bill K80
├── dashboard/          # Màn hình POS chính và trang quản trị Mobile (/admin/)
├── config/             # Cấu hình chung của Django (settings, urls, wsgi)
├── templates/          # Giao diện HTML chia theo từng phân hệ
├── static/             # CSS, JS và hình ảnh dùng chung cho Frontend
├── scripts/            # Các script phục vụ khởi tạo và chạy Docker
├── Dockerfile
├── docker-compose.yml
├── vercel.json
├── requirements.txt
└── manage.py
```

---

## Cài đặt môi trường

### Yêu cầu trước khi cài đặt
- Python 3.12 trở lên
- MySQL 8.0 trở lên
- Git

### Các bước thực hiện

**1. Tải mã nguồn về máy**
```bash
git clone https://github.com/MinhHuy281/MixFood-Managenment.git
cd MixFood-Management
```

**2. Tạo môi trường ảo và cài đặt thư viện**

> Nên chạy dự án trong môi trường ảo (`.venv`) để tránh xung đột với các thư viện Python khác trên máy.

```powershell
# Windows (PowerShell)
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

```bash
# macOS / Linux
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

**3. Cấu hình biến môi trường và Database**

Tạo file `.env` từ file mẫu:
```bash
cp .env.example .env
```
Mở `.env` và điền thông tin kết nối MySQL của bạn (`DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`). Sau đó tạo database trống trong MySQL:
```sql
CREATE DATABASE mixfood_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

**4. Khởi tạo bảng dữ liệu và phân quyền**
```bash
python manage.py migrate
python manage.py setup_roles
python manage.py createsuperuser
```

---

## Hướng dẫn sử dụng

Khởi chạy server phát triển ở Local:
```bash
python manage.py runserver
```

Sau khi chạy lệnh trên, truy cập vào trình duyệt:
- Màn hình bán hàng POS & Kho: `http://127.0.0.1:8000/`
- Trang quản trị Admin: `http://127.0.0.1:8000/admin/`

Để chạy bộ kiểm thử tự động (Unit Tests) kiểm tra lại toàn bộ nghiệp vụ:
```bash
python manage.py check
python manage.py test accounts audit catalog dining dashboard sales inventory
```

Hoặc chạy nhanh toàn bộ hệ thống (gồm Web và MySQL) bằng Docker:
```bash
docker-compose up --build -d
```

---
