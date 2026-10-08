from decimal import Decimal
from django import template

register = template.Library()


@register.filter(name='vnd')
def vnd(value):
    """
    Định dạng số tiền theo chuẩn VNĐ có dấu chấm phân cách hàng nghìn.
    Ví dụ: 15000 -> 15.000, 75000 -> 75.000, 100000 -> 100.000, 0 -> 0.
    """
    if value is None or value == '':
        return '0'
    try:
        val = int(Decimal(str(value)))
        return f'{val:,d}'.replace(',', '.')
    except Exception:
        return str(value)


@register.filter(name='vnd_currency')
def vnd_currency(value):
    """
    Định dạng số tiền theo chuẩn VNĐ kèm đơn vị đ.
    Ví dụ: 15000 -> 15.000 đ
    """
    return f'{vnd(value)} đ'

