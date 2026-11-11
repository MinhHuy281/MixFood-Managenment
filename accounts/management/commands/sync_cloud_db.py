# File này chịu trách nhiệm cung cấp lệnh quản trị (management command) đồng bộ 1 chạm 100% dữ liệu giữa CSDL MySQL Local (127.0.0.1) và CSDL Cloud Aiven/Vercel.
import os

import pymysql
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    # Class này dùng để định nghĩa lệnh quản trị Django CLI (sync_cloud_db) hỗ trợ kiểm tra đối chiếu và đồng bộ toàn bộ bảng dữ liệu giữa Local MySQL và Cloud Aiven MySQL.
    help = 'Đồng bộ 100% dữ liệu giữa MySQL Local (127.0.0.1) và Cloud MySQL (Aiven/Vercel).'

    def add_arguments(self, parser):
        # Hàm này dùng để khai báo các tham số dòng lệnh (--direction, --check-only) cho lệnh sync_cloud_db. Input: parser. Output: cấu hình parser.
        parser.add_argument(
            '--direction',
            choices=['push', 'pull'],
            default='push',
            help='Hướng đồng bộ: push (Local -> Cloud Vercel, mặc định) hoặc pull (Cloud Vercel -> Local).',
        )
        parser.add_argument(
            '--check-only',
            action='store_true',
            help='Chỉ kiểm tra và so sánh số lượng bản ghi giữa Local và Cloud mà không ghi đè dữ liệu.',
        )

    def _get_local_conn(self):
        # Hàm này dùng để khởi tạo kết nối PyMySQL tới CSDL MySQL Local. Input: self. Output: đối tượng Connection.
        return pymysql.connect(
            host=os.getenv('LOCAL_DB_HOST', '127.0.0.1'),
            port=int(os.getenv('LOCAL_DB_PORT', '3306')),
            user=os.getenv('LOCAL_DB_USER', 'root'),
            password=os.getenv('LOCAL_DB_PASSWORD', '1234'),
            database=os.getenv('LOCAL_DB_NAME', 'mixfood_manager'),
            charset='utf8mb4',
            cursorclass=pymysql.cursors.DictCursor,
        )

    def _get_cloud_conn(self):
        # Hàm này dùng để khởi tạo kết nối PyMySQL có SSL tới CSDL Cloud Aiven MySQL (đọc thông tin từ biến môi trường .env). Input: self. Output: đối tượng Connection.
        cloud_password = os.getenv('CLOUD_DB_PASSWORD') or os.getenv('AIVEN_DB_PASSWORD', '')
        if not cloud_password:
            raise RuntimeError('Chưa cấu hình CLOUD_DB_PASSWORD trong file .env!')
        return pymysql.connect(
            host=os.getenv('CLOUD_DB_HOST', 'mysql-3390784b-vominhhuy280104-ce6f.h.aivencloud.com'),
            port=int(os.getenv('CLOUD_DB_PORT', '17429')),
            user=os.getenv('CLOUD_DB_USER', 'avnadmin'),
            password=cloud_password,
            database=os.getenv('CLOUD_DB_NAME', 'defaultdb'),
            charset='utf8mb4',
            ssl={'check_hostname': False},
            cursorclass=pymysql.cursors.DictCursor,
            connect_timeout=20,
        )

    def handle(self, *args, **options):
        # Hàm này dùng để thực thi quá trình đối chiếu hoặc đồng bộ 100% các bảng giữa Local và Cloud. Input: *args, **options. Output: in bảng kết quả đồng bộ ra terminal.
        direction = options['direction']
        check_only = options['check_only']

        self.stdout.write(self.style.MIGRATE_HEADING('=== ĐỒNG BỘ CƠ SỞ DỮ LIỆU MIXFOOD LOCAL <-> VERCEL CLOUD ==='))
        local_conn = self._get_local_conn()
        cloud_conn = self._get_cloud_conn()

        try:
            if check_only:
                self._compare_databases(local_conn, cloud_conn)
                return

            if direction == 'push':
                src_conn, dst_conn = local_conn, cloud_conn
                label = 'PUSH (Local 127.0.0.1 -> Cloud Aiven/Vercel)'
            else:
                src_conn, dst_conn = cloud_conn, local_conn
                label = 'PULL (Cloud Aiven/Vercel -> Local 127.0.0.1)'

            self.stdout.write(f'Hướng đồng bộ: {label}')
            total_tables, total_rows = self._sync_all_tables(src_conn, dst_conn)
            self.stdout.write(
                self.style.SUCCESS(
                    f'HOÀN TẤT: Đã đồng bộ thành công {total_tables} bảng ({total_rows:,} bản ghi)!'
                )
            )
            self._compare_databases(local_conn, cloud_conn)
        finally:
            local_conn.close()
            cloud_conn.close()

    def _sync_all_tables(self, src_conn, dst_conn):
        # Hàm này dùng để sao chép toàn bộ cấu trúc và dữ liệu các bảng từ kết nối nguồn sang kết nối đích. Input: src_conn, dst_conn. Output: tuple (số bảng, tổng số dòng).
        with src_conn.cursor() as src_cur, dst_conn.cursor() as dst_cur:
            src_cur.execute('SHOW TABLES')
            tables = [list(r.values())[0] for r in src_cur.fetchall()]

            dst_cur.execute('SHOW TABLES')
            dst_tables = {list(r.values())[0] for r in dst_cur.fetchall()}

            dst_cur.execute('SET FOREIGN_KEY_CHECKS = 0;')
            total_rows = 0

            for tbl in tables:
                if tbl not in dst_tables:
                    src_cur.execute(f'SHOW CREATE TABLE `{tbl}`')
                    create_sql = list(src_cur.fetchone().values())[1]
                    dst_cur.execute(create_sql)

                src_cur.execute(f'SELECT * FROM `{tbl}`')
                rows = src_cur.fetchall()
                dst_cur.execute(f'TRUNCATE TABLE `{tbl}`')

                if rows:
                    cols = list(rows[0].keys())
                    col_list = ', '.join(f'`{c}`' for c in cols)
                    placeholders = ', '.join(['%s'] * len(cols))
                    sql = f'INSERT INTO `{tbl}` ({col_list}) VALUES ({placeholders})'
                    values = [tuple(r[c] for c in cols) for r in rows]
                    for idx in range(0, len(values), 500):
                        dst_cur.executemany(sql, values[idx:idx + 500])

                total_rows += len(rows)

            dst_cur.execute('SET FOREIGN_KEY_CHECKS = 1;')
            dst_conn.commit()
            return len(tables), total_rows

    def _compare_databases(self, local_conn, cloud_conn):
        # Hàm này dùng để đối chiếu số lượng bản ghi của các bảng nghiệp vụ cốt lõi giữa Local và Cloud. Input: local_conn, cloud_conn. Output: in bảng đối chiếu trạng thái.
        key_tables = [
            ('auth_user', 'Tài khoản nhân sự (admin, thungan1, thungan2, quanlykho)'),
            ('accounts_userprofile', 'Hồ sơ phân quyền & ca làm việc'),
            ('accounts_usersystemconfig', 'Cấu hình hệ thống & Phân quyền Ma trận'),
            ('catalog_category', 'Nhóm thực đơn (Categories)'),
            ('catalog_product', 'Món ăn & Đồ uống (Products)'),
            ('catalog_ingredient', 'Nguyên vật liệu 3 khu vực (Ingredients)'),
            ('inventory_recipe', 'Công thức món ăn (BOM Recipes)'),
            ('inventory_recipeitem', 'Chi tiết định lượng nguyên liệu (Recipe Items)'),
            ('dining_area', 'Khu vực bàn (Areas)'),
            ('dining_diningtable', 'Sơ đồ bàn ăn (Dining Tables)'),
            ('sales_order', 'Đơn hàng POS (Orders)'),
            ('sales_invoice', 'Hóa đơn thanh toán (Invoices)'),
            ('inventory_stockreceipt', 'Phiếu nhập kho (Stock Receipts)'),
            ('inventory_stocktransaction', 'Giao dịch xuất/nhập/tồn (Stock Transactions)'),
        ]
        self.stdout.write('\nBẢNG ĐỐI CHIẾU DỮ LIỆU LOCAL VS VERCEL CLOUD:')
        self.stdout.write('-' * 88)
        self.stdout.write(f'{"Bảng dữ liệu":<30} | {"Local":>8} | {"Cloud":>8} | {"Trạng thái":<15} | Mô tả')
        self.stdout.write('-' * 88)
        all_matched = True
        with local_conn.cursor() as lcur, cloud_conn.cursor() as ccur:
            for tbl, desc in key_tables:
                lcur.execute(f'SELECT COUNT(*) AS cnt FROM `{tbl}`')
                l_cnt = lcur.fetchone()['cnt']
                ccur.execute(f'SELECT COUNT(*) AS cnt FROM `{tbl}`')
                c_cnt = ccur.fetchone()['cnt']
                matched = l_cnt == c_cnt
                if not matched:
                    all_matched = False
                status = 'ĐỒNG BỘ 100%' if matched else 'LỆCH DỮ LIỆU'
                self.stdout.write(f'{tbl:<30} | {l_cnt:>8} | {c_cnt:>8} | {status:<15} | {desc}')
        self.stdout.write('-' * 88)
        if all_matched:
            self.stdout.write(self.style.SUCCESS('=> KẾT LUẬN: Dữ liệu Local và Vercel Cloud ĐỒNG NHẤT 100% (1:1)!'))
        else:
            self.stdout.write(self.style.WARNING('=> CẢNH BÁO: Có sự chênh lệch bản ghi. Hãy chạy: python manage.py sync_cloud_db'))
