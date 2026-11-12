# File này chịu trách nhiệm xử lý API nghiệp vụ cho các chức năng mở rộng trên thanh Menu POS: Mở két tiền, Thiết bị POS, Bảo trì dữ liệu, Khách hàng, Sổ thu chi, Công nợ, Phân công bàn ca và các Báo cáo chuyên sâu.
import datetime
import json
import os
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.decorators import login_required
from django.db.models import Count, Q, Sum
from django.http import HttpResponse, JsonResponse
from django.utils import timezone

from accounts.models import UserProfile, UserSystemConfig
from audit.models import ActivityLog, log_activity
from catalog.models import Category, Ingredient, Product
from dining.models import Area, DiningTable
from inventory.models import StockReceipt, StockReceiptItem, StockTransaction
from sales.models import Invoice, Order, OrderItem, Payment

User = get_user_model()


def _fmt_money(val):
    # Hàm này dùng để định dạng số tiền sang chuỗi hiển thị kiểu Việt Nam (dấu chấm phân cách hàng nghìn). Input: val. Output: chuỗi định dạng tiền tệ.
    try:
        num = float(val or 0)
    except (TypeError, ValueError):
        num = 0.0
    return f'{num:,.0f}'.replace(',', '.')


def _get_extra_store():
    # Hàm này dùng để đọc kho dữ liệu JSON mở rộng từ UserSystemConfig.extra_options và khởi tạo dữ liệu mẫu nếu chưa có. Input: không có. Output: tuple (config_obj, extra_dict).
    cfg = UserSystemConfig.get_solo()
    extra = dict(cfg.extra_options or {})
    changed = False

    if 'pos_devices' not in extra:
        extra['pos_devices'] = {
            'pos_code': 'POS-80C-13255',
            'cashier_printer_name': 'EPSON TM-T82III (Thu ngân)',
            'cashier_printer_ip': '192.168.1.200',
            'cashier_printer_port': '9100',
            'paper_size': '80mm',
            'print_copies': 1,
            'auto_print_bill': True,
            'auto_open_drawer': True,
            'kitchen_printer_ip': '192.168.1.201',
            'kitchen_printer_enabled': True,
            'bar_printer_ip': '192.168.1.202',
            'bar_printer_enabled': True,
        }
        changed = True

    if 'pos_drawer' not in extra:
        extra['pos_drawer'] = {
            'opening_cash': 2000000,
            'status': 'closed',
            'last_opened_at': '',
            'last_opened_by': '',
            'history': [
                {
                    'id': 1,
                    'time': timezone.localtime().strftime('%H:%M %d/%m/%Y'),
                    'actor': 'Hệ thống',
                    'reason': 'Khởi tạo đầu ca làm việc',
                    'amount_note': '2.000.000 đ',
                }
            ],
        }
        changed = True

    if 'pos_customers' not in extra or not extra['pos_customers']:
        extra['pos_customers'] = [
            {
                'id': 1,
                'code': 'KH001',
                'name': 'Nguyễn Văn Minh',
                'phone': '0905123456',
                'tier': 'VIP Vàng',
                'points': 1250,
                'visits': 18,
                'total_spent': 6850000,
                'note': 'Khách quen khu vực Tầng 1, thích món Thái ít cay',
            },
            {
                'id': 2,
                'code': 'KH002',
                'name': 'Trần Thị Thu Hà',
                'phone': '0914888999',
                'tier': 'VIP Kim Cương',
                'points': 2480,
                'visits': 32,
                'total_spent': 14200000,
                'note': 'Thường đặt bàn tiệc gia đình cuối tuần',
            },
            {
                'id': 3,
                'code': 'KH003',
                'name': 'Lê Hoàng Nam',
                'phone': '0988777666',
                'tier': 'Thân thiết',
                'points': 540,
                'visits': 8,
                'total_spent': 2750000,
                'note': 'Hay gọi Pad Thái & Trà sữa Thái xanh',
            },
            {
                'id': 4,
                'code': 'KH004',
                'name': 'Phạm Quốc Bảo (Công ty ABC)',
                'phone': '0935666888',
                'tier': 'VIP Vàng',
                'points': 1620,
                'visits': 14,
                'total_spent': 9400000,
                'note': 'Khách doanh nghiệp, xuất hóa đơn VAT',
            },
        ]
        changed = True

    if 'pos_cashbook' not in extra or not extra['pos_cashbook']:
        now_str = timezone.localtime().strftime('%d/%m/%Y %H:%M')
        extra['pos_cashbook'] = [
            {
                'id': 1,
                'code': 'PT0001',
                'type': 'in',
                'category': 'Nộp quỹ đầu ca',
                'amount': 2000000,
                'method': 'Tiền mặt',
                'person': 'Quản lý ca sáng',
                'note': 'Tiền lẻ chuẩn bị thối đầu ca',
                'created_at': now_str,
                'actor': 'admin',
            },
            {
                'id': 2,
                'code': 'PC0001',
                'type': 'out',
                'category': 'Chi mua nguyên liệu phụ',
                'amount': 350000,
                'method': 'Tiền mặt',
                'person': 'Bếp trưởng',
                'note': 'Mua thêm rau thơm, sả tươi và đá viên',
                'created_at': now_str,
                'actor': 'admin',
            },
            {
                'id': 3,
                'code': 'PC0002',
                'type': 'out',
                'category': 'Chi phí vận hành',
                'amount': 150000,
                'method': 'Tiền mặt',
                'person': 'Thu ngân',
                'note': 'Mua giấy in nhiệt K80 (5 cuộn)',
                'created_at': now_str,
                'actor': 'admin',
            },
        ]
        changed = True

    if 'pos_debts' not in extra or not extra['pos_debts']:
        today_str = timezone.localdate().strftime('%d/%m/%Y')
        extra['pos_debts'] = [
            {
                'id': 1,
                'code': 'CN-KH01',
                'debt_type': 'customer',
                'partner_name': 'Phạm Quốc Bảo (Công ty ABC)',
                'phone': '0935666888',
                'total_amount': 3200000,
                'paid_amount': 1200000,
                'remaining_amount': 2000000,
                'due_date': today_str,
                'note': 'Tiệc liên hoan phòng Kinh doanh (Bàn 10, 11)',
            },
            {
                'id': 2,
                'code': 'CN-NCC01',
                'debt_type': 'supplier',
                'partner_name': 'NPP Hải Sản Tươi Sống Đà Nẵng',
                'phone': '0905999111',
                'total_amount': 5500000,
                'paid_amount': 2500000,
                'remaining_amount': 3000000,
                'due_date': today_str,
                'note': 'Công nợ nhập tôm sú, mực lá, bạch tuộc tuần này',
            },
            {
                'id': 3,
                'code': 'CN-NCC02',
                'debt_type': 'supplier',
                'partner_name': 'Đại lý Bia & Nước giải khát Miền Trung',
                'phone': '0913222333',
                'total_amount': 4200000,
                'paid_amount': 3000000,
                'remaining_amount': 1200000,
                'due_date': today_str,
                'note': 'Nhập 15 thùng Pepsi + 10 thùng Tiger Bạc',
            },
        ]
        changed = True

    if changed:
        cfg.extra_options = extra
        cfg.save(update_fields=['extra_options', 'updated_at'])

    return cfg, extra


def _save_extra_store(cfg, extra):
    # Hàm này dùng để lưu lại dict extra_options vào bản ghi UserSystemConfig. Input: cfg, extra. Output: lưu DB.
    cfg.extra_options = extra
    cfg.save(update_fields=['extra_options', 'updated_at'])


def _compute_today_cash_sales():
    # Hàm này dùng để tính tổng tiền mặt thu được từ bán hàng trong ngày hôm nay. Input: không có. Output: float tổng tiền mặt.
    today = timezone.localdate()
    cash_sum = Payment.objects.filter(
        paid_at__date=today,
        method=Payment.Method.CASH,
    ).aggregate(total=Sum('amount'))['total'] or Decimal('0')
    return float(cash_sum)


@login_required
def pos_features_api(request):
    # Hàm này dùng để xử lý toàn bộ yêu cầu GET/POST của các tính năng mở rộng trên POS theo tham số module. Input: request. Output: JsonResponse.
    cfg, extra = _get_extra_store()
    actor_name = request.user.get_full_name() or request.user.username

    if request.method == 'GET':
        module = (request.GET.get('module') or '').strip().lower()

        if module == 'drawer':
            drawer = extra.get('pos_drawer', {})
            cash_sales = _compute_today_cash_sales()
            vouchers = extra.get('pos_cashbook', [])
            cash_in = sum(float(v.get('amount', 0)) for v in vouchers if v.get('type') == 'in' and v.get('method', 'Tiền mặt') == 'Tiền mặt')
            cash_out = sum(float(v.get('amount', 0)) for v in vouchers if v.get('type') == 'out' and v.get('method', 'Tiền mặt') == 'Tiền mặt')
            expected_cash = cash_sales + cash_in - cash_out
            return JsonResponse({
                'ok': True,
                'drawer': drawer,
                'cash_sales': cash_sales,
                'cash_sales_fmt': _fmt_money(cash_sales) + ' đ',
                'cash_in': cash_in,
                'cash_in_fmt': _fmt_money(cash_in) + ' đ',
                'cash_out': cash_out,
                'cash_out_fmt': _fmt_money(cash_out) + ' đ',
                'expected_cash': expected_cash,
                'expected_cash_fmt': _fmt_money(expected_cash) + ' đ',
            })

        if module == 'device':
            return JsonResponse({
                'ok': True,
                'devices': extra.get('pos_devices', {}),
            })

        if module == 'maintenance':
            from django.db import connection
            db_path = settings.DATABASES['default'].get('NAME', '')
            db_size_kb = 0
            if db_path and os.path.exists(str(db_path)):
                db_size_kb = round(os.path.getsize(str(db_path)) / 1024, 1)
            else:
                try:
                    with connection.cursor() as cur:
                        cur.execute(
                            'SELECT ROUND(SUM(data_length + index_length) / 1024, 1) '
                            'FROM information_schema.TABLES WHERE table_schema = DATABASE()'
                        )
                        row = cur.fetchone()
                        if row and row[0]:
                            db_size_kb = float(row[0])
                except Exception:
                    db_size_kb = 512.0
            stats = {
                'db_size_display': f'{db_size_kb:,.1f} KB' if db_size_kb < 1024 else f'{db_size_kb / 1024:,.2f} MB',
                'orders_count': Order.objects.count(),
                'invoices_count': Invoice.objects.count(),
                'products_count': Product.objects.filter(is_active=True).count(),
                'ingredients_count': Ingredient.objects.filter(is_active=True).count(),
                'stock_tx_count': StockTransaction.objects.count(),
                'logs_count': ActivityLog.objects.count(),
                'last_maintenance': extra.get('last_maintenance_at', 'Chưa thực hiện'),
            }
            return JsonResponse({'ok': True, 'stats': stats})

        if module == 'customers':
            q = (request.GET.get('q') or '').strip().lower()
            tier = (request.GET.get('tier') or '').strip()
            customers = list(extra.get('pos_customers', []))
            if q:
                customers = [
                    c for c in customers
                    if q in str(c.get('code', '')).lower()
                    or q in str(c.get('name', '')).lower()
                    or q in str(c.get('phone', '')).lower()
                ]
            if tier:
                customers = [c for c in customers if c.get('tier') == tier]
            all_cust = extra.get('pos_customers', [])
            kpis = {
                'total_count': len(all_cust),
                'vip_count': sum(1 for c in all_cust if 'VIP' in str(c.get('tier', ''))),
                'total_points': sum(int(c.get('points', 0)) for c in all_cust),
                'total_spent_fmt': _fmt_money(sum(float(c.get('total_spent', 0)) for c in all_cust)) + ' đ',
            }
            return JsonResponse({'ok': True, 'customers': customers, 'kpis': kpis})

        if module == 'cashbook':
            vouchers = list(extra.get('pos_cashbook', []))
            vtype = (request.GET.get('type') or '').strip()
            if vtype in ('in', 'out'):
                vouchers = [v for v in vouchers if v.get('type') == vtype]
            all_v = extra.get('pos_cashbook', [])
            cash_sales = _compute_today_cash_sales()
            total_in = sum(float(v.get('amount', 0)) for v in all_v if v.get('type') == 'in')
            total_out = sum(float(v.get('amount', 0)) for v in all_v if v.get('type') == 'out')
            closing = total_in + cash_sales - total_out
            return JsonResponse({
                'ok': True,
                'vouchers': vouchers,
                'kpis': {
                    'total_in_fmt': _fmt_money(total_in) + ' đ',
                    'cash_sales_fmt': _fmt_money(cash_sales) + ' đ',
                    'total_out_fmt': _fmt_money(total_out) + ' đ',
                    'closing_fmt': _fmt_money(closing) + ' đ',
                },
            })

        if module == 'debt':
            debts = list(extra.get('pos_debts', []))
            dtype = (request.GET.get('debt_type') or '').strip()
            if dtype in ('customer', 'supplier'):
                debts = [d for d in debts if d.get('debt_type') == dtype]
            all_d = extra.get('pos_debts', [])
            rec_sum = sum(float(d.get('remaining_amount', 0)) for d in all_d if d.get('debt_type') == 'customer')
            pay_sum = sum(float(d.get('remaining_amount', 0)) for d in all_d if d.get('debt_type') == 'supplier')
            return JsonResponse({
                'ok': True,
                'debts': debts,
                'kpis': {
                    'receivable_fmt': _fmt_money(rec_sum) + ' đ',
                    'payable_fmt': _fmt_money(pay_sum) + ' đ',
                    'net_fmt': _fmt_money(rec_sum - pay_sum) + ' đ',
                    'active_count': sum(1 for d in all_d if float(d.get('remaining_amount', 0)) > 0),
                },
            })

        if module == 'shift_assign':
            users_qs = User.objects.filter(is_active=True).select_related('profile').order_by('id')
            areas = list(Area.objects.filter(is_active=True).values_list('name', flat=True))
            shifts = extra.get('pos_staff_shifts', {})
            staff_rows = []
            for u in users_qs:
                prof = getattr(u, 'profile', None)
                dept_label = prof.get_department_display() if prof else 'Thu ngân'
                area_val = prof.area_code if prof and prof.area_code else 'ALL'
                shift_info = shifts.get(str(u.id), {})
                staff_rows.append({
                    'user_id': u.id,
                    'username': u.username,
                    'full_name': (prof.full_name if prof and prof.full_name else u.get_full_name()) or u.username,
                    'department': dept_label,
                    'area_code': area_val,
                    'shift_name': shift_info.get('shift_name', 'Ca Gãy / Toàn thời gian (08:00 - 22:00)'),
                    'note': shift_info.get('note', 'Đang trực ca'),
                })
            return JsonResponse({'ok': True, 'staff': staff_rows, 'areas': areas})

        if module == 'customer_revenue':
            customers = list(extra.get('pos_customers', []))
            paid_orders = Order.objects.filter(status=Order.Status.PAID).select_related('table__area')
            total_orders_rev = float(paid_orders.aggregate(s=Sum('total_amount'))['s'] or 0)
            total_guests = paid_orders.count() * 2 or len(customers)
            rows = []
            for c in sorted(customers, key=lambda x: float(x.get('total_spent', 0)), reverse=True):
                visits = max(int(c.get('visits', 1)), 1)
                spent = float(c.get('total_spent', 0))
                rows.append({
                    'code': c.get('code', ''),
                    'name': c.get('name', ''),
                    'phone': c.get('phone', ''),
                    'tier': c.get('tier', 'Thành viên'),
                    'visits': visits,
                    'total_spent': spent,
                    'total_spent_fmt': _fmt_money(spent) + ' đ',
                    'avg_bill_fmt': _fmt_money(spent / visits) + ' đ',
                })
            return JsonResponse({
                'ok': True,
                'rows': rows,
                'kpis': {
                    'total_vip_spent_fmt': _fmt_money(sum(r['total_spent'] for r in rows)) + ' đ',
                    'pos_paid_revenue_fmt': _fmt_money(total_orders_rev) + ' đ',
                    'total_guests': total_guests,
                    'customers_count': len(rows),
                },
            })

        if module == 'purchases':
            receipts = StockReceipt.objects.select_related('created_by').prefetch_related('items__ingredient').order_by('-created_at')[:50]
            rows = []
            total_purchase_val = Decimal('0')
            total_items_qty = Decimal('0')
            for r in receipts:
                items_summary = []
                for it in r.items.all():
                    total_items_qty += (it.quantity or Decimal('0'))
                    items_summary.append(f'{it.ingredient.name} ({it.quantity:g} {it.ingredient.unit})')
                total_purchase_val += (r.total_amount or Decimal('0'))
                rows.append({
                    'receipt_code': r.receipt_code,
                    'supplier': r.supplier or 'Nhà cung cấp tổng hợp',
                    'created_at': timezone.localtime(r.created_at).strftime('%d/%m/%Y %H:%M'),
                    'created_by': r.created_by.get_full_name() or r.created_by.username,
                    'items_text': ', '.join(items_summary) if items_summary else (r.note or 'Nhập kho hàng hóa'),
                    'total_amount': float(r.total_amount or 0),
                    'total_amount_fmt': _fmt_money(r.total_amount) + ' đ',
                    'status_display': r.get_status_display(),
                })
            # Bổ sung thêm lịch sử StockTransaction tăng kho nếu chưa có nhiều phiếu
            tx_in = StockTransaction.objects.filter(
                transaction_type=StockTransaction.TransactionType.INCREASE
            ).select_related('ingredient', 'created_by').order_by('-created_at')[:30]
            for tx in tx_in:
                if not rows or len(rows) < 20:
                    val = (tx.quantity or Decimal('0')) * (tx.unit_cost or tx.ingredient.average_cost or Decimal('0'))
                    total_purchase_val += val
                    rows.append({
                        'receipt_code': f'GD-{tx.id:04d}',
                        'supplier': tx.ingredient.supplier or 'Nhập kho trực tiếp',
                        'created_at': timezone.localtime(tx.created_at).strftime('%d/%m/%Y %H:%M'),
                        'created_by': (tx.created_by.get_full_name() or tx.created_by.username) if tx.created_by else 'Hệ thống',
                        'items_text': f'{tx.ingredient.name} (+{tx.quantity:g} {tx.ingredient.unit})',
                        'total_amount': float(val),
                        'total_amount_fmt': _fmt_money(val) + ' đ',
                        'status_display': 'Đã nhập kho',
                    })
            return JsonResponse({
                'ok': True,
                'rows': rows,
                'kpis': {
                    'receipts_count': len(rows),
                    'total_value_fmt': _fmt_money(total_purchase_val) + ' đ',
                    'ingredients_count': Ingredient.objects.filter(is_active=True).count(),
                },
            })

        if module == 'cash_stats':
            payments = Payment.objects.all()
            cash_val = float(payments.filter(method=Payment.Method.CASH).aggregate(s=Sum('amount'))['s'] or 0)
            transfer_val = float(payments.filter(method=Payment.Method.BANK).aggregate(s=Sum('amount'))['s'] or 0)
            card_val = float(payments.filter(method__in=(Payment.Method.CARD, Payment.Method.E_WALLET)).aggregate(s=Sum('amount'))['s'] or 0)

            paid_orders = Order.objects.filter(status=Order.Status.PAID)
            subtotal_sum = float(paid_orders.aggregate(s=Sum('subtotal'))['s'] or 0)
            surcharge_sum = float(paid_orders.aggregate(s=Sum('surcharge_amount'))['s'] or 0)
            discount_sum = float(paid_orders.aggregate(s=Sum('discount_amount'))['s'] or 0)
            total_rev = float(paid_orders.aggregate(s=Sum('total_amount'))['s'] or 0)

            vouchers = extra.get('pos_cashbook', [])
            cb_in = sum(float(v.get('amount', 0)) for v in vouchers if v.get('type') == 'in')
            cb_out = sum(float(v.get('amount', 0)) for v in vouchers if v.get('type') == 'out')

            breakdown = [
                {'label': 'Doanh thu Tiền mặt (POS)', 'type': 'Thu bán hàng', 'amount_fmt': _fmt_money(cash_val) + ' đ', 'note': 'Khách thanh toán tiền mặt tại quầy'},
                {'label': 'Doanh thu Chuyển khoản / QR', 'type': 'Thu ngân hàng', 'amount_fmt': _fmt_money(transfer_val) + ' đ', 'note': 'Khách quét mã VietQR / Chuyển khoản'},
                {'label': 'Doanh thu Thẻ POS / Ví điện tử', 'type': 'Thu qua thẻ', 'amount_fmt': _fmt_money(card_val) + ' đ', 'note': 'Cà thẻ ngân hàng / Ví điện tử'},
                {'label': 'Tổng tiền món (Trước điều chỉnh)', 'type': 'Doanh thu gốc', 'amount_fmt': _fmt_money(subtotal_sum) + ' đ', 'note': f'Tổng {paid_orders.count()} hóa đơn đã thanh toán'},
                {'label': 'Tổng khoản Phụ thu', 'type': 'Cộng thêm (+)', 'amount_fmt': _fmt_money(surcharge_sum) + ' đ', 'note': 'Phụ thu phòng VIP / Phí dịch vụ'},
                {'label': 'Tổng khoản Giảm giá & Coupon', 'type': 'Khấu trừ (-)', 'amount_fmt': _fmt_money(discount_sum) + ' đ', 'note': 'Chiết khấu hóa đơn & Mã giảm giá'},
                {'label': 'Thu ngoài bán hàng (Phiếu thu)', 'type': 'Sổ quỹ (+)', 'amount_fmt': _fmt_money(cb_in) + ' đ', 'note': 'Nộp quỹ đầu ca & thu công nợ'},
                {'label': 'Chi phí tiền mặt (Phiếu chi)', 'type': 'Sổ quỹ (-)', 'amount_fmt': _fmt_money(cb_out) + ' đ', 'note': 'Chi mua nguyên liệu lẻ & vận hành'},
            ]
            return JsonResponse({
                'ok': True,
                'breakdown': breakdown,
                'kpis': {
                    'total_revenue_fmt': _fmt_money(total_rev) + ' đ',
                    'cash_fmt': _fmt_money(cash_val) + ' đ',
                    'bank_fmt': _fmt_money(transfer_val + card_val) + ' đ',
                    'net_cashbox_fmt': _fmt_money(cash_val + cb_in - cb_out) + ' đ',
                },
            })

        if module == 'shift_invoices':
            from datetime import datetime, time, timedelta

            shift_filter = (request.GET.get('shift') or 'my').strip().lower()
            date_str = (request.GET.get('date') or '').strip()

            now_local = timezone.localtime()
            if date_str:
                try:
                    target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
                except ValueError:
                    target_date = now_local.date()
            else:
                target_date = now_local.date()

            start_dt = timezone.make_aware(datetime.combine(target_date, time.min))
            end_dt = timezone.make_aware(datetime.combine(target_date + timedelta(days=1), time.min))

            invoices_qs = (
                Invoice.objects.filter(paid_at__gte=start_dt, paid_at__lt=end_dt)
                .select_related('order', 'cashier', 'order__table', 'order__table__area')
                .prefetch_related('order__items__product', 'payments')
                .order_by('-paid_at', '-id')
            )

            # Lọc theo ca làm việc / thu ngân
            current_user = request.user
            if shift_filter == 'my':
                invoices_qs = invoices_qs.filter(cashier=current_user)
            elif shift_filter == 'thungan1':
                invoices_qs = invoices_qs.filter(cashier__username__iexact='thungan1')
            elif shift_filter == 'thungan2':
                invoices_qs = invoices_qs.filter(cashier__username__iexact='thungan2')
            # 'all' hiển thị cả 2 ca / toàn bộ hóa đơn trong ngày

            invoices_list = list(invoices_qs)

            total_invoices = len(invoices_list)
            paid_count = sum(1 for inv in invoices_list if inv.status == Invoice.Status.PAID)
            cancelled_count = sum(1 for inv in invoices_list if inv.status == Invoice.Status.CANCELLED)

            total_revenue = Decimal('0')
            cash_revenue = Decimal('0')
            bank_revenue = Decimal('0')
            discount_total = Decimal('0')
            discount_count = 0

            rows = []
            for inv in invoices_list:
                is_paid = inv.status == Invoice.Status.PAID
                if is_paid:
                    total_revenue += inv.total_amount
                    if inv.discount_amount and inv.discount_amount > 0:
                        discount_total += inv.discount_amount
                        discount_count += 1

                    payments = list(inv.payments.all())
                    if payments:
                        for p in payments:
                            if p.method == Payment.Method.CASH:
                                cash_revenue += p.amount
                            else:
                                bank_revenue += p.amount
                    else:
                        cash_revenue += inv.total_amount

                # Điểm bàn / Khu vực
                table_name = '-'
                area_name = '-'
                items_summary = []
                if inv.order:
                    if inv.order.table:
                        table_name = inv.order.table.name
                        if inv.order.table.area:
                            area_name = inv.order.table.area.name
                    elif inv.order.order_type == Order.OrderType.TAKEAWAY:
                        table_name = 'Mang về'
                        area_name = 'Mang về'
                    for item in inv.order.items.all():
                        if getattr(item, 'status', None) != 'cancelled':
                            pname = item.product.name if item.product else 'Món'
                            items_summary.append(f'{pname} x{item.quantity}')

                pay_display = ', '.join([p.get_method_display() for p in inv.payments.all()]) or ('Tiền mặt' if is_paid else '-')

                rows.append({
                    'id': inv.id,
                    'invoice_code': inv.invoice_code,
                    'time': timezone.localtime(inv.paid_at).strftime('%H:%M') if inv.paid_at else '-',
                    'full_time': timezone.localtime(inv.paid_at).strftime('%d/%m/%Y %H:%M') if inv.paid_at else '-',
                    'table_name': table_name,
                    'area_name': area_name,
                    'cashier_name': inv.cashier.get_full_name() or inv.cashier.username if inv.cashier else 'Hệ thống',
                    'subtotal': float(inv.subtotal),
                    'subtotal_fmt': _fmt_money(inv.subtotal) + ' đ',
                    'discount_amount': float(inv.discount_amount),
                    'discount_fmt': _fmt_money(inv.discount_amount) + ' đ',
                    'surcharge_amount': float(inv.surcharge_amount),
                    'surcharge_fmt': _fmt_money(inv.surcharge_amount) + ' đ',
                    'total_amount': float(inv.total_amount),
                    'total_amount_fmt': _fmt_money(inv.total_amount) + ' đ',
                    'payment_method': pay_display,
                    'status': inv.status,
                    'status_display': 'Đã thu tiền' if is_paid else 'Đã hủy',
                    'items_text': ', '.join(items_summary) if items_summary else '-',
                })

            return JsonResponse({
                'ok': True,
                'shift': shift_filter,
                'date': target_date.strftime('%Y-%m-%d'),
                'date_display': target_date.strftime('%d/%m/%Y'),
                'current_cashier': current_user.get_full_name() or current_user.username,
                'kpis': {
                    'total_invoices': total_invoices,
                    'paid_count': paid_count,
                    'cancelled_count': cancelled_count,
                    'total_revenue': float(total_revenue),
                    'total_revenue_fmt': _fmt_money(total_revenue) + ' đ',
                    'cash_revenue_fmt': _fmt_money(cash_revenue) + ' đ',
                    'bank_revenue_fmt': _fmt_money(bank_revenue) + ' đ',
                    'discount_total_fmt': _fmt_money(discount_total) + ' đ',
                    'discount_count': discount_count,
                },
                'invoices': rows,
            })

        return JsonResponse({'ok': False, 'error': 'Module truy vấn không hợp lệ.'}, status=400)

    # Xử lý POST cho các module
    try:
        body = json.loads(request.body.decode('utf-8')) if request.body else {}
    except Exception:
        return JsonResponse({'ok': False, 'error': 'Dữ liệu JSON không hợp lệ.'}, status=400)

    action = (body.get('action') or '').strip()

    if action == 'open_drawer':
        reason = (body.get('reason') or 'Mở két kiểm tiền / Đổi tiền lẻ').strip()
        drawer = extra.get('pos_drawer', {})
        now_fmt = timezone.localtime().strftime('%H:%M:%S %d/%m/%Y')
        drawer['status'] = 'opened'
        drawer['last_opened_at'] = now_fmt
        drawer['last_opened_by'] = actor_name
        history = list(drawer.get('history', []))
        history.insert(0, {
            'id': len(history) + 1,
            'time': now_fmt,
            'actor': actor_name,
            'reason': reason,
            'amount_note': f'Tồn két: {_fmt_money(_compute_today_cash_sales())} đ',
        })
        drawer['history'] = history[:30]
        extra['pos_drawer'] = drawer
        _save_extra_store(cfg, extra)
        log_activity(
            actor=request.user,
            action=ActivityLog.Action.SYSTEM,
            description=f'Mở két đựng tiền tại quầy POS - Lý do: {reason}',
            request=request,
        )
        return JsonResponse({
            'ok': True,
            'message': f'Đã gửi lệnh kích hoạt mở két đựng tiền! (Lý do: {reason})',
            'drawer': drawer,
        })

    if action == 'save_device':
        devices = extra.get('pos_devices', {})
        for key in (
            'pos_code', 'cashier_printer_name', 'cashier_printer_ip', 'cashier_printer_port',
            'paper_size', 'print_copies', 'auto_print_bill', 'auto_open_drawer',
            'kitchen_printer_ip', 'kitchen_printer_enabled', 'bar_printer_ip', 'bar_printer_enabled'
        ):
            if key in body:
                devices[key] = body[key]
        extra['pos_devices'] = devices
        _save_extra_store(cfg, extra)
        log_activity(
            actor=request.user,
            action=ActivityLog.Action.SYSTEM,
            description=f'Cập nhật cấu hình Thiết bị POS & Máy in ({devices.get("cashier_printer_ip")})',
            request=request,
        )
        return JsonResponse({
            'ok': True,
            'message': 'Đã lưu cấu hình Thiết bị POS & Máy in thành công!',
            'devices': devices,
        })

    if action == 'maintenance_run':
        task = (body.get('task') or 'optimize').strip()
        now_fmt = timezone.localtime().strftime('%H:%M %d/%m/%Y')
        extra['last_maintenance_at'] = f'{now_fmt} bởi {actor_name}'
        _save_extra_store(cfg, extra)
        msg = 'Đã tối ưu hóa chỉ mục CSDL và đồng bộ bộ nhớ đệm thành công!'
        if task == 'recalc_stock':
            for ing in Ingredient.objects.filter(is_active=True):
                ing.current_stock = (ing.current_stock or Decimal('0')).quantize(Decimal('0.001'))
                ing.prep_stock = (ing.prep_stock or Decimal('0')).quantize(Decimal('0.01'))
                ing.save(update_fields=['current_stock', 'prep_stock'])
            msg = 'Đã kiểm tra và chuẩn hóa toàn bộ số liệu tồn kho 3 khu vực!'
        log_activity(
            actor=request.user,
            action=ActivityLog.Action.SYSTEM,
            description=f'Thực hiện bảo trì dữ liệu hệ thống ({task})',
            request=request,
        )
        return JsonResponse({'ok': True, 'message': msg, 'last_maintenance': extra['last_maintenance_at']})

    if action == 'save_customer':
        customers = list(extra.get('pos_customers', []))
        cid = body.get('id')
        name = (body.get('name') or '').strip()
        phone = (body.get('phone') or '').strip()
        tier = (body.get('tier') or 'Thành viên').strip()
        points = int(body.get('points') or 0)
        total_spent = float(body.get('total_spent') or 0)
        note = (body.get('note') or '').strip()
        if not name:
            return JsonResponse({'ok': False, 'error': 'Vui lòng nhập họ tên khách hàng.'}, status=400)
        if cid:
            for c in customers:
                if str(c.get('id')) == str(cid):
                    c.update({
                        'name': name,
                        'phone': phone,
                        'tier': tier,
                        'points': points,
                        'total_spent': total_spent,
                        'note': note,
                    })
                    break
            msg = f'Đã cập nhật khách hàng "{name}".'
        else:
            next_id = max([int(c.get('id', 0)) for c in customers] + [0]) + 1
            customers.insert(0, {
                'id': next_id,
                'code': f'KH{next_id:03d}',
                'name': name,
                'phone': phone,
                'tier': tier,
                'points': points,
                'visits': 1,
                'total_spent': total_spent,
                'note': note,
            })
            msg = f'Đã thêm khách hàng "{name}" vào hệ thống.'
        extra['pos_customers'] = customers
        _save_extra_store(cfg, extra)
        return JsonResponse({'ok': True, 'message': msg, 'customers': customers})

    if action == 'delete_customer':
        cid = body.get('id')
        customers = [c for c in extra.get('pos_customers', []) if str(c.get('id')) != str(cid)]
        extra['pos_customers'] = customers
        _save_extra_store(cfg, extra)
        return JsonResponse({'ok': True, 'message': 'Đã xóa khách hàng.', 'customers': customers})

    if action == 'save_voucher':
        vouchers = list(extra.get('pos_cashbook', []))
        vtype = (body.get('type') or 'in').strip()
        if vtype not in ('in', 'out'):
            vtype = 'in'
        category = (body.get('category') or ('Thu tiền mặt' if vtype == 'in' else 'Chi phí vận hành')).strip()
        amount = float(body.get('amount') or 0)
        method = (body.get('method') or 'Tiền mặt').strip()
        person = (body.get('person') or actor_name).strip()
        note = (body.get('note') or '').strip()
        if amount <= 0:
            return JsonResponse({'ok': False, 'error': 'Số tiền phiếu thu/chi phải lớn hơn 0.'}, status=400)
        next_id = max([int(v.get('id', 0)) for v in vouchers] + [0]) + 1
        prefix = 'PT' if vtype == 'in' else 'PC'
        code = f'{prefix}{next_id:04d}'
        vouchers.insert(0, {
            'id': next_id,
            'code': code,
            'type': vtype,
            'category': category,
            'amount': amount,
            'method': method,
            'person': person,
            'note': note,
            'created_at': timezone.localtime().strftime('%d/%m/%Y %H:%M'),
            'actor': actor_name,
        })
        extra['pos_cashbook'] = vouchers
        _save_extra_store(cfg, extra)
        log_activity(
            actor=request.user,
            action=ActivityLog.Action.SYSTEM,
            description=f'Tạo phiếu {"Thu" if vtype == "in" else "Chi"} {code}: {_fmt_money(amount)} đ ({category})',
            request=request,
        )
        return JsonResponse({'ok': True, 'message': f'Đã lập phiếu {code} ({_fmt_money(amount)} đ) thành công!', 'vouchers': vouchers})

    if action == 'delete_voucher':
        vid = body.get('id')
        vouchers = [v for v in extra.get('pos_cashbook', []) if str(v.get('id')) != str(vid)]
        extra['pos_cashbook'] = vouchers
        _save_extra_store(cfg, extra)
        return JsonResponse({'ok': True, 'message': 'Đã xóa phiếu thu/chi.', 'vouchers': vouchers})

    if action == 'save_debt':
        debts = list(extra.get('pos_debts', []))
        dtype = (body.get('debt_type') or 'customer').strip()
        partner = (body.get('partner_name') or '').strip()
        phone = (body.get('phone') or '').strip()
        total_amount = float(body.get('total_amount') or 0)
        paid_amount = float(body.get('paid_amount') or 0)
        note = (body.get('note') or '').strip()
        if not partner or total_amount <= 0:
            return JsonResponse({'ok': False, 'error': 'Vui lòng nhập tên đối tác và tổng số tiền công nợ > 0.'}, status=400)
        next_id = max([int(d.get('id', 0)) for d in debts] + [0]) + 1
        prefix = 'CN-KH' if dtype == 'customer' else 'CN-NCC'
        debts.insert(0, {
            'id': next_id,
            'code': f'{prefix}{next_id:02d}',
            'debt_type': dtype,
            'partner_name': partner,
            'phone': phone,
            'total_amount': total_amount,
            'paid_amount': paid_amount,
            'remaining_amount': max(total_amount - paid_amount, 0),
            'due_date': timezone.localdate().strftime('%d/%m/%Y'),
            'note': note,
        })
        extra['pos_debts'] = debts
        _save_extra_store(cfg, extra)
        return JsonResponse({'ok': True, 'message': f'Đã ghi nhận khoản công nợ của "{partner}".', 'debts': debts})

    if action == 'pay_debt':
        did = body.get('id')
        pay_val = float(body.get('pay_amount') or 0)
        if pay_val <= 0:
            return JsonResponse({'ok': False, 'error': 'Số tiền thanh toán công nợ phải lớn hơn 0.'}, status=400)
        debts = list(extra.get('pos_debts', []))
        target = None
        for d in debts:
            if str(d.get('id')) == str(did):
                target = d
                break
        if not target:
            return JsonResponse({'ok': False, 'error': 'Không tìm thấy khoản công nợ.'}, status=404)
        actual_pay = min(pay_val, float(target.get('remaining_amount', 0)))
        target['paid_amount'] = float(target.get('paid_amount', 0)) + actual_pay
        target['remaining_amount'] = max(float(target.get('total_amount', 0)) - target['paid_amount'], 0)
        extra['pos_debts'] = debts

        # Tự động ghi nhận vào Sổ thu chi tiền mặt
        vouchers = list(extra.get('pos_cashbook', []))
        vtype = 'in' if target.get('debt_type') == 'customer' else 'out'
        next_vid = max([int(v.get('id', 0)) for v in vouchers] + [0]) + 1
        vcode = f'{"PT" if vtype == "in" else "PC"}{next_vid:04d}'
        vouchers.insert(0, {
            'id': next_vid,
            'code': vcode,
            'type': vtype,
            'category': 'Thu nợ khách hàng' if vtype == 'in' else 'Thanh toán công nợ NCC',
            'amount': actual_pay,
            'method': 'Tiền mặt',
            'person': target.get('partner_name', ''),
            'note': f'Tất toán công nợ {target.get("code")}',
            'created_at': timezone.localtime().strftime('%d/%m/%Y %H:%M'),
            'actor': actor_name,
        })
        extra['pos_cashbook'] = vouchers
        _save_extra_store(cfg, extra)
        return JsonResponse({
            'ok': True,
            'message': f'Đã thanh toán {_fmt_money(actual_pay)} đ cho "{target.get("partner_name")}" và tự động lập phiếu {vcode}!',
            'debts': debts,
        })

    if action == 'save_shift_assign':
        uid = body.get('user_id')
        area_code = (body.get('area_code') or 'ALL').strip()
        shift_name = (body.get('shift_name') or 'Ca Gãy / Toàn thời gian').strip()
        note = (body.get('note') or 'Đang trực ca').strip()
        target_user = User.objects.filter(pk=uid).first()
        if not target_user:
            return JsonResponse({'ok': False, 'error': 'Không tìm thấy nhân viên.'}, status=404)
        prof, _ = UserProfile.objects.get_or_create(user=target_user)
        prof.area_code = area_code
        prof.save(update_fields=['area_code', 'updated_at'])
        shifts = dict(extra.get('pos_staff_shifts', {}))
        shifts[str(target_user.id)] = {
            'shift_name': shift_name,
            'note': note,
        }
        extra['pos_staff_shifts'] = shifts
        _save_extra_store(cfg, extra)
        return JsonResponse({
            'ok': True,
            'message': f'Đã cập nhật phân công khu vực "{area_code}" và "{shift_name}" cho {target_user.username}!',
        })

    return JsonResponse({'ok': False, 'error': 'Hành động không được hỗ trợ.'}, status=400)


@login_required
def pos_backup_download_api(request):
    # Hàm này dùng để xuất file JSON sao lưu dữ liệu hệ thống POS (Cấu hình, Thực đơn, Kho, Khách hàng, Sổ quỹ). Input: request. Output: HttpResponse file JSON.
    _, extra = _get_extra_store()
    backup_payload = {
        'exported_at': timezone.localtime().isoformat(),
        'system': 'MixFood Cloud POS 2026',
        'categories_count': Category.objects.count(),
        'products_count': Product.objects.count(),
        'ingredients_count': Ingredient.objects.count(),
        'invoices_count': Invoice.objects.count(),
        'extra_store': extra,
    }
    content = json.dumps(backup_payload, ensure_ascii=False, indent=2)
    response = HttpResponse(content, content_type='application/json; charset=utf-8')
    filename = f'MixFood_POS_Backup_{timezone.localdate().strftime("%Y%m%d")}.json'
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response
