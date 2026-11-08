# File này chịu trách nhiệm định nghĩa các bộ lọc định dạng tiền tệ VNĐ (vnd, vnd_Input) dùng trong các template HTML.
from decimal import Decimal
from django import template

register = template.Library()


@register.filter(name='vnd')
def vnd(value):
    # Hàm này dùng để: Định dạng số tiền theo chuẩn VNĐ có dấu chấm phân cách hàng nghìn. Ví dụ: 15000 -> 15.000, 75000 -> 75.000, 100000 -> 100.000, 0 -> 0. (Input: value; Output: kết quả xử lý hoặc HttpResponse/JsonResponse tương ứng).
    if value is None or value == '':
        return '0'
    try:
        val = int(Decimal(str(value)))
        return f'{val:,d}'.replace(',', '.')
    except Exception:
        return str(value)


@register.filter(name='vnd_currency')
def vnd_currency(value):
    # Hàm này dùng để: Định dạng số tiền theo chuẩn VNĐ kèm đơn vị đ. Ví dụ: 15000 -> 15.000 đ (Input: value; Output: kết quả xử lý hoặc HttpResponse/JsonResponse tương ứng).
    return f'{vnd(value)} đ'
