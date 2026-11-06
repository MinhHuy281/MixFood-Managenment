"""
Module quy đổi đơn vị định lượng BOM, Tách Thùng -> Hộp (Quầy chờ bán) và Lưu kho (UoM Conversion) MixFood 2026
"""
from decimal import Decimal
import re


def normalize_unit(unit_str):
    if not unit_str:
        return ''
    u = unit_str.strip().lower()
    u = re.sub(r'\s+', ' ', u)
    return u


def _compute_base_sub_qty(ingredient, recipe_qty, recipe_unit):
    """
    Tính số lượng nguyên liệu theo đơn vị cơ sở đã tách lẻ (Hộp / Quả / Chai / Kg / Lít / Gói / Lon / Ổ).
    Nếu mặt hàng lưu kho theo Thùng / Vỉ / Bao (pack_size > 1), hàm convert_recipe_to_stock_qty
    sẽ chia tiếp cho pack_size để ra số Thùng / Vỉ cần trừ.
    """
    r_unit = normalize_unit(recipe_unit)
    s_unit = normalize_unit(getattr(ingredient, 'unit', ''))
    ing_name = (getattr(ingredient, 'name', '') or '').lower()
    ing_code = (getattr(ingredient, 'code', '') or '').upper()

    # 1. Cơm -> Gạo (1 chén cơm = 100g gạo = 0.1 kg / 0.1 hộp 1kg)
    if any(k in r_unit for k in ['chén', 'chen', 'bát', 'bat', 'phần', 'phan', 'dĩa', 'dia']) and ('gạo' in ing_name or 'gao' in ing_name or ing_code == 'NL-GAO'):
        if s_unit in ['g', 'gram', 'gr', 'gam']:
            return recipe_qty * Decimal('100')
        elif s_unit in ['lạng', 'lang']:
            return recipe_qty * Decimal('1')
        return recipe_qty * Decimal('0.1')

    # 2. Xôi -> Nếp / Gạo nếp (1 phần xôi = 100g nếp = 0.1 kg / 0.1 hộp 1kg)
    if any(k in r_unit for k in ['phần', 'phan', 'chén', 'chen', 'gói', 'goi']) and ('nếp' in ing_name or 'nep' in ing_name or ing_code == 'NL-NEP'):
        if s_unit in ['g', 'gram', 'gr', 'gam']:
            return recipe_qty * Decimal('100')
        elif s_unit in ['lạng', 'lang']:
            return recipe_qty * Decimal('1')
        return recipe_qty * Decimal('0.1')

    # 3. Cá nguyên con -> Kg (1 con ~ 800g = 0.8 kg)
    if 'con' in r_unit and ('cá' in ing_name or 'ca' in ing_name):
        return recipe_qty * Decimal('0.8')

    # 4. Bánh phồng tôm (1 Hộp = 100 cái bánh phồng = 10 phần ăn)
    if 'phồng tôm' in ing_name or 'phong tom' in ing_name or 'phongtom' in ing_code:
        if r_unit in ['cái', 'cai', 'bánh', 'banh', 'miếng', 'mieng']:
            if s_unit in ['cái', 'cai', 'bánh', 'banh']:
                return recipe_qty
            return recipe_qty / Decimal('100')
        elif r_unit in ['phần', 'phan', 'dĩa', 'dia', 'suất', 'suat']:
            if s_unit in ['cái', 'cai', 'bánh', 'banh']:
                return recipe_qty * Decimal('10')
            return recipe_qty * Decimal('0.1')
        elif r_unit in ['hộp', 'hop', 'gói', 'goi']:
            return recipe_qty

    # 5. Trứng gà (Đơn vị lẻ: Quả; Kho tổng có thể là Vỉ 30 quả hoặc Quả)
    if 'trứng' in ing_name or 'trung' in ing_name or ing_code == 'NL-TRUNGGA':
        if r_unit in ['quả', 'qua', 'trái', 'trai']:
            return recipe_qty
        elif r_unit in ['vỉ', 'vi']:
            return recipe_qty * Decimal('30')

    # 6. Sữa đặc Ông Thọ (1 Hộp = 380g)
    if 'sữa đặc' in ing_name or 'sua dac' in ing_name or ing_code == 'NL-SUA':
        if r_unit in ['g', 'gram', 'gr', 'gam', 'ml']:
            return recipe_qty / Decimal('380')
        elif r_unit in ['thìa', 'muỗng', 'thia', 'muong', 'shot']:
            return (recipe_qty * Decimal('15')) / Decimal('380')
        return recipe_qty

    # 7. Sữa tươi không đường 1L (1 Hộp = 1000ml)
    if 'sữa tươi' in ing_name or 'sua tuoi' in ing_name or ing_code == 'NL-SUATUOI':
        if r_unit in ['ml', 'mililit', 'cc']:
            return recipe_qty / Decimal('1000')
        return recipe_qty

    # 8. Gói trà Thái / Trà túi lọc (1 Gói/Hộp = 400g hoặc 50 túi lọc)
    if 'trà thái' in ing_name or 'tra thai' in ing_name or ing_code in ['NL-TRATHAID', 'NL-TRATHAIX', 'NL-TRADAO']:
        if r_unit in ['g', 'gram', 'gr', 'gam']:
            return recipe_qty / Decimal('400')
        elif r_unit in ['túi', 'tui', 'teabag']:
            return recipe_qty / Decimal('50')
        return recipe_qty

    # 9. Tương ớt Cholimex (1 Hộp/Chai = 270g)
    if 'tương ớt' in ing_name or 'tuong ot' in ing_name or ing_code == 'NL-TUONGOT':
        if r_unit in ['g', 'gram', 'gr', 'gam', 'ml']:
            return recipe_qty / Decimal('270')
        return recipe_qty

    # 10. Sốt Mayonnaise Kewpie (1 Hộp/Chai = 300g)
    if 'mayonnaise' in ing_name or 'kewpie' in ing_name or ing_code == 'NL-SOTMAYO':
        if r_unit in ['g', 'gram', 'gr', 'gam', 'ml']:
            return recipe_qty / Decimal('300')
        return recipe_qty

    # 11. Bơ lạt thơm béo (1 Hộp = 200g)
    if 'bơ lạt' in ing_name or 'bo lat' in ing_name or ing_code == 'NL-BOSUA':
        if r_unit in ['g', 'gram', 'gr', 'gam']:
            return recipe_qty / Decimal('200')
        return recipe_qty

    # 12. Dầu ăn Neptune Gold 5L (1 Hộp/Can = 5000ml = 5 Lít)
    if 'dầu ăn' in ing_name or 'dau an' in ing_name or ing_code == 'NL-DAUAN':
        if r_unit in ['ml', 'mililit', 'cc']:
            can_vol = Decimal('30000') if '30' in ing_name else Decimal('5000')
            if s_unit in ['l', 'lít', 'lit', 'liter']:
                return recipe_qty / Decimal('1000')
            return recipe_qty / can_vol
        elif r_unit in ['l', 'lít', 'lit', 'liter']:
            if s_unit in ['l', 'lít', 'lit', 'liter']:
                return recipe_qty
            can_vol = Decimal('30') if '30' in ing_name else Decimal('5')
            return recipe_qty / can_vol
        return recipe_qty

    # 13. Trái cây quả -> Kg
    if r_unit in ['quả', 'qua', 'trái', 'trai'] and s_unit in ['kg', 'kilogram']:
        if 'cam' in ing_name:
            return recipe_qty * Decimal('0.225')
        elif 'thơm' in ing_name or 'dứa' in ing_name:
            return recipe_qty * Decimal('0.6')
        elif 'dưa hấu' in ing_name:
            return recipe_qty * Decimal('2.0')
        return recipe_qty * Decimal('0.25')

    # 14. Khối lượng (g -> Kg / Hộp 1kg, lạng -> Kg)
    if r_unit in ['g', 'gram', 'gr', 'gam']:
        if s_unit in ['lạng', 'lang']:
            return recipe_qty / Decimal('100')
        elif s_unit in ['g', 'gram', 'gr', 'gam']:
            return recipe_qty
        return recipe_qty / Decimal('1000')

    if r_unit in ['kg', 'kilogram']:
        if s_unit in ['g', 'gram', 'gr', 'gam']:
            return recipe_qty * Decimal('1000')
        elif s_unit in ['lạng', 'lang']:
            return recipe_qty * Decimal('10')
        return recipe_qty

    if r_unit in ['lạng', 'lang']:
        if s_unit in ['g', 'gram', 'gr', 'gam']:
            return recipe_qty * Decimal('100')
        elif s_unit in ['lạng', 'lang']:
            return recipe_qty
        return recipe_qty / Decimal('10')

    # 15. Thể tích (ml -> Lít / Hộp 1L)
    if r_unit in ['ml', 'mililit', 'cc']:
        if s_unit in ['ml', 'mililit', 'cc']:
            return recipe_qty
        return recipe_qty / Decimal('1000')

    if r_unit in ['l', 'lít', 'lit', 'liter']:
        if s_unit in ['ml', 'mililit', 'cc']:
            return recipe_qty * Decimal('1000')
        return recipe_qty

    return recipe_qty


def convert_recipe_to_stock_qty(ingredient, recipe_qty, recipe_unit):
    """
    Quy đổi số lượng từ đơn vị định lượng món ăn sang đơn vị lưu kho tổng (ingredient.unit).
    Hỗ trợ tự động cả trường hợp kho tổng lưu theo Thùng / Vỉ / Bao (chia cho pack_size).
    """
    if recipe_qty is None:
        return Decimal('0')
    if not isinstance(recipe_qty, Decimal):
        recipe_qty = Decimal(str(recipe_qty))

    r_unit = normalize_unit(recipe_unit)
    s_unit = normalize_unit(getattr(ingredient, 'unit', ''))
    pack_size = getattr(ingredient, 'pack_size', None) or Decimal('1')
    if not isinstance(pack_size, Decimal):
        pack_size = Decimal(str(pack_size))
    if pack_size <= 0:
        pack_size = Decimal('1')

    # Nếu công thức ghi trực tiếp bằng đơn vị kho tổng (VD: Thùng -> Thùng, Vỉ -> Vỉ)
    if r_unit == s_unit and s_unit in ['thùng', 'thung', 'két', 'ket', 'vỉ', 'vi', 'bao']:
        return recipe_qty

    # Ngược lại nếu công thức là Thùng mà kho lưu Lon/Chai
    if r_unit in ['thùng', 'thung', 'két', 'ket'] and s_unit in ['lon', 'chai']:
        return recipe_qty * Decimal('24')

    sub_qty = _compute_base_sub_qty(ingredient, recipe_qty, recipe_unit)

    # Nếu đơn vị kho tổng là Thùng / Vỉ / Bao / Két và có pack_size > 1:
    # Chia sub_qty (số Hộp / Quả / Lon / Gói / Can) cho pack_size để ra số Thùng / Vỉ
    if s_unit in ['thùng', 'thung', 'két', 'ket', 'vỉ', 'vi', 'bao'] and pack_size > 1:
        return sub_qty / pack_size

    # Trường hợp đặc biệt Đồ uống: Kho lưu Thùng nhưng pack_size mặc định = 1
    if r_unit in ['lon', 'chai'] and s_unit in ['thùng', 'thung', 'két', 'ket'] and pack_size == 1:
        return sub_qty / Decimal('24')

    return sub_qty


def convert_recipe_to_prep_qty(ingredient, recipe_qty, recipe_unit):
    """
    Quy đổi số lượng từ đơn vị định lượng món ăn sang đơn vị chờ bán đã tách lẻ (ingredient.unpacked_unit).
    Công thức phổ quát: prep_qty = stock_qty * pack_size.
    Ví dụ:
      - Phồng tôm (unit=Hộp, pack_size=10 phần): 10 cái -> stock_qty=0.1 Hộp -> prep_qty = 1 phần.
      - Trứng gà (unit=Vỉ, pack_size=30 quả): 1 quả -> stock_qty=1/30 Vỉ -> prep_qty = 1 quả.
      - Khoai tây (unit=Kg, pack_size=10 phần): 100g -> stock_qty=0.1 Kg -> prep_qty = 1 phần.
    """
    stock_qty = convert_recipe_to_stock_qty(ingredient, recipe_qty, recipe_unit)
    pack_size = getattr(ingredient, 'pack_size', None) or Decimal('1')
    if not isinstance(pack_size, Decimal):
        pack_size = Decimal(str(pack_size))
    if pack_size <= 0:
        pack_size = Decimal('1')
    return stock_qty * pack_size


def calculate_recipe_item_cost(ingredient, recipe_qty, recipe_unit):
    """Tính giá vốn nguyên liệu trong công thức (VND) sau khi quy đổi đơn vị."""
    stock_qty = convert_recipe_to_stock_qty(ingredient, recipe_qty, recipe_unit)
    avg_cost = getattr(ingredient, 'average_cost', Decimal('0'))
    if not isinstance(avg_cost, Decimal):
        avg_cost = Decimal(str(avg_cost))
    return (stock_qty * avg_cost).quantize(Decimal('1'))
