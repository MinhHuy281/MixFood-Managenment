from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from audit.models import ActivityLog, log_activity
from catalog.models import Ingredient

from .conversions import convert_recipe_to_prep_qty, convert_recipe_to_stock_qty
from .models import (
    Recipe, RecipeItem, StockReceipt, StockReceiptItem, StockTransaction,
    StockIssue, StockIssueItem, StockAdjustment, StockAdjustmentItem
)


@transaction.atomic
def deduct_for_sale(order_items, user, reference_id):
    """
    Tự động quét định lượng (BOM), áp dụng quy đổi đơn vị (UoM Conversion)
    và ưu tiên trừ vào lượng hàng đã tách chờ bán tại Quầy/Bếp (prep_stock),
    nếu thiếu mới trừ tiếp vào Kho tổng (current_stock).
    """
    required = {}
    for order_item in order_items:
        recipe_items = RecipeItem.objects.filter(
            recipe__product_id=order_item.product_id,
            recipe__is_active=True,
        ).select_related('ingredient')
        for recipe_item in recipe_items:
            stock_unit_qty = convert_recipe_to_stock_qty(
                recipe_item.ingredient,
                recipe_item.quantity,
                recipe_item.unit
            )
            prep_unit_qty = convert_recipe_to_prep_qty(
                recipe_item.ingredient,
                recipe_item.quantity,
                recipe_item.unit
            )
            order_qty = Decimal(str(order_item.quantity))
            entry = required.setdefault(recipe_item.ingredient_id, {
                'ingredient': recipe_item.ingredient,
                'quantity': Decimal('0'),
                'prep_quantity': Decimal('0'),
            })
            entry['quantity'] += stock_unit_qty * order_qty
            entry['prep_quantity'] += prep_unit_qty * order_qty

    if not required:
        return []

    ingredient_ids = list(required)
    locked = {
        ingredient.pk: ingredient
        for ingredient in Ingredient.objects.select_for_update().filter(pk__in=ingredient_ids)
    }
    for ingredient_id, data in required.items():
        ingredient = locked.get(ingredient_id)
        if ingredient is None:
            raise ValidationError(f"Không tìm thấy nguyên liệu: {data['ingredient'].name}")

        pack_size = ingredient.pack_size if ingredient.pack_size and ingredient.pack_size > 0 else Decimal('1')
        prep_in_stock_units = (ingredient.prep_stock or Decimal('0')) / pack_size
        total_available = (ingredient.current_stock or Decimal('0')) + prep_in_stock_units

        if total_available < data['quantity']:
            name = data['ingredient'].name
            curr = ingredient.current_stock or Decimal('0')
            prep = ingredient.prep_stock or Decimal('0')
            unit = ingredient.unit or ''
            sub_u = ingredient.unpacked_unit or unit
            req = data['quantity']
            raise ValidationError(
                f'Không đủ tồn kho nguyên liệu: {name} '
                f'(Kho tổng: {curr:.2f} {unit}, Chờ bán: {prep:.2f} {sub_u}, cần: {req:.2f} {unit}).'
            )

    transactions = []
    for ingredient_id, data in required.items():
        ingredient = locked[ingredient_id]
        pack_size = ingredient.pack_size if ingredient.pack_size and ingredient.pack_size > 0 else Decimal('1')
        req_stock = data['quantity']
        req_prep = data['prep_quantity']
        curr_prep = ingredient.prep_stock or Decimal('0')

        if curr_prep >= req_prep and curr_prep > 0:
            # Trừ hoàn toàn từ lượng đã xuất ra chờ bán (prep_stock)
            ingredient.prep_stock = curr_prep - req_prep
            ingredient.save(update_fields=('prep_stock', 'updated_at'))
            transactions.append(StockTransaction.objects.create(
                ingredient=ingredient,
                transaction_type=StockTransaction.TransactionType.SALE,
                quantity=-req_stock,
                unit_cost=ingredient.average_cost,
                balance_after=ingredient.current_stock,
                reference_type='order_prep',
                reference_id=reference_id,
                note=f'Tự động xuất bán đơn #{reference_id} (Trừ {req_prep:.2f} {ingredient.unpacked_unit} chờ bán)',
                created_by=user,
            ))
        elif curr_prep > 0:
            # Trừ hết phần chờ bán (prep_stock), phần còn thiếu trừ vào kho tổng (current_stock)
            used_prep = curr_prep
            used_stock_from_prep = used_prep / pack_size
            rem_stock = req_stock - used_stock_from_prep
            ingredient.prep_stock = Decimal('0')
            ingredient.current_stock -= rem_stock
            ingredient.save(update_fields=('current_stock', 'prep_stock', 'updated_at'))
            transactions.append(StockTransaction.objects.create(
                ingredient=ingredient,
                transaction_type=StockTransaction.TransactionType.SALE,
                quantity=-used_stock_from_prep,
                unit_cost=ingredient.average_cost,
                balance_after=ingredient.current_stock,
                reference_type='order_prep',
                reference_id=reference_id,
                note=f'Tự động xuất bán đơn #{reference_id} (Trừ {used_prep:.2f} {ingredient.unpacked_unit} chờ bán)',
                created_by=user,
            ))
            transactions.append(StockTransaction.objects.create(
                ingredient=ingredient,
                transaction_type=StockTransaction.TransactionType.SALE,
                quantity=-rem_stock,
                unit_cost=ingredient.average_cost,
                balance_after=ingredient.current_stock,
                reference_type='order',
                reference_id=reference_id,
                note=f'Tự động xuất kho bán hàng đơn #{reference_id}',
                created_by=user,
            ))
        else:
            # Chưa tách ra chờ bán -> Trừ trực tiếp vào kho tổng (current_stock)
            ingredient.current_stock -= req_stock
            ingredient.save(update_fields=('current_stock', 'updated_at'))
            transactions.append(StockTransaction.objects.create(
                ingredient=ingredient,
                transaction_type=StockTransaction.TransactionType.SALE,
                quantity=-req_stock,
                unit_cost=ingredient.average_cost,
                balance_after=ingredient.current_stock,
                reference_type='order',
                reference_id=reference_id,
                note=f'Tự động xuất kho bán hàng đơn #{reference_id}',
                created_by=user,
            ))
    return transactions


@transaction.atomic
def receive_stock(receipt, user):
    if receipt.status != StockReceipt.Status.DRAFT:
        raise ValidationError('Phiếu nhập không ở trạng thái nháp.')
    items = list(receipt.items.select_related('ingredient'))
    if not items:
        raise ValidationError('Phiếu nhập phải có ít nhất một nguyên liệu.')
    for item in items:
        ingredient = Ingredient.objects.select_for_update().get(pk=item.ingredient_id)
        old_stock = ingredient.current_stock
        new_stock = old_stock + item.quantity
        if new_stock:
            ingredient.average_cost = ((old_stock * ingredient.average_cost) + item.total_cost) / new_stock
        ingredient.current_stock = new_stock
        ingredient.save(update_fields=('current_stock', 'average_cost', 'updated_at'))
        StockTransaction.objects.create(
            ingredient=ingredient,
            transaction_type=StockTransaction.TransactionType.RECEIPT,
            quantity=item.quantity,
            unit_cost=item.unit_cost,
            balance_after=new_stock,
            reference_type='stock_receipt',
            reference_id=receipt.pk,
            note=f'Nhập kho {receipt.receipt_code}',
            created_by=user,
        )
    receipt.status = StockReceipt.Status.CONFIRMED
    receipt.confirmed_at = timezone.now()
    receipt.save(update_fields=('status', 'confirmed_at'))


@transaction.atomic
def restore_stock_for_cancelled_sale(order_id, user=None, reason=''):
    """
    Tự động hoàn trả lại đúng số NVL đã trừ vào Thẻ kho / Quầy chờ bán khi Hóa đơn bị Hủy hoặc Hoàn tác.
    """
    if not order_id:
        return []

    already_restored = StockTransaction.objects.filter(
        reference_type__in=('order', 'order_prep'),
        reference_id=order_id,
        transaction_type=StockTransaction.TransactionType.RESTORE,
    ).exists()
    if already_restored:
        return []

    sale_txs = list(
        StockTransaction.objects.filter(
            reference_type__in=('order', 'order_prep'),
            reference_id=order_id,
            transaction_type=StockTransaction.TransactionType.SALE,
        ).select_related('ingredient')
    )
    if not sale_txs:
        return []

    ingredient_ids = list({tx.ingredient_id for tx in sale_txs})
    locked = {
        ing.pk: ing
        for ing in Ingredient.objects.select_for_update().filter(pk__in=ingredient_ids)
    }

    restore_transactions = []
    for tx in sale_txs:
        ing = locked.get(tx.ingredient_id)
        if ing is not None:
            restore_qty = abs(tx.quantity)
            pack_size = ing.pack_size if ing.pack_size and ing.pack_size > 0 else Decimal('1')
            if tx.reference_type == 'order_prep':
                ing.prep_stock = (ing.prep_stock or Decimal('0')) + (restore_qty * pack_size)
                ing.save(update_fields=('prep_stock', 'updated_at'))
            else:
                ing.current_stock += restore_qty
                ing.save(update_fields=('current_stock', 'updated_at'))

            restore_note = f'Tự động hoàn kho do hủy/hoàn tác đơn #{order_id}'
            if reason:
                restore_note += f': {reason}'
            restore_transactions.append(
                StockTransaction.objects.create(
                    ingredient=ing,
                    transaction_type=StockTransaction.TransactionType.RESTORE,
                    quantity=restore_qty,
                    unit_cost=tx.unit_cost or ing.average_cost,
                    balance_after=ing.current_stock,
                    reference_type=tx.reference_type,
                    reference_id=order_id,
                    note=restore_note[:255],
                    created_by=user or tx.created_by,
                )
            )
    return restore_transactions


def restore_stock_for_undone_sale(order_id, user=None, reason=''):
    """Tương thích ngược: gọi restore_stock_for_cancelled_sale."""
    return restore_stock_for_cancelled_sale(order_id, user=user, reason=reason)


def generate_receipt_code():
    today_str = timezone.localtime().strftime('%y%m%d')
    prefix = f'NK{today_str}-'
    latest = StockReceipt.objects.filter(receipt_code__startswith=prefix).order_by('-receipt_code').first()
    if latest:
        try:
            seq = int(latest.receipt_code.split('-')[-1]) + 1
        except Exception:
            seq = StockReceipt.objects.filter(receipt_code__startswith=prefix).count() + 1
    else:
        seq = 1
    return f'{prefix}{seq:03d}'


def generate_issue_code():
    today_str = timezone.localtime().strftime('%y%m%d')
    prefix = f'XK{today_str}-'
    latest = StockIssue.objects.filter(issue_code__startswith=prefix).order_by('-issue_code').first()
    if latest:
        try:
            seq = int(latest.issue_code.split('-')[-1]) + 1
        except Exception:
            seq = StockIssue.objects.filter(issue_code__startswith=prefix).count() + 1
    else:
        seq = 1
    return f'{prefix}{seq:03d}'


def generate_adjustment_code():
    today_str = timezone.localtime().strftime('%y%m%d')
    prefix = f'KK{today_str}-'
    latest = StockAdjustment.objects.filter(adjustment_code__startswith=prefix).order_by('-adjustment_code').first()
    if latest:
        try:
            seq = int(latest.adjustment_code.split('-')[-1]) + 1
        except Exception:
            seq = StockAdjustment.objects.filter(adjustment_code__startswith=prefix).count() + 1
    else:
        seq = 1
    return f'{prefix}{seq:03d}'


@transaction.atomic
def create_and_confirm_receipt(user, supplier, note, items_data, request=None):
    if not items_data:
        raise ValidationError('Phiếu nhập phải có ít nhất một nguyên liệu.')

    receipt_code = generate_receipt_code()
    receipt = StockReceipt.objects.create(
        receipt_code=receipt_code,
        supplier=supplier.strip() if supplier else '',
        note=note.strip() if note else '',
        status=StockReceipt.Status.CONFIRMED,
        confirmed_at=timezone.now(),
        created_by=user,
    )

    total_amount = Decimal(0)
    affected_ingredients = []

    for item in items_data:
        ing_id = item.get('ingredient_id')
        qty = Decimal(str(item.get('quantity', 0)).replace(',', '.'))
        cost = Decimal(str(item.get('unit_cost', 0)).replace(',', '.'))
        if qty <= 0:
            continue
        if cost < 0:
            cost = Decimal(0)

        ingredient = Ingredient.objects.select_for_update().get(pk=ing_id)
        if cost == 0 and ingredient.average_cost > 0:
            cost = ingredient.average_cost
        line_cost = qty * cost
        total_amount += line_cost

        StockReceiptItem.objects.create(
            receipt=receipt,
            ingredient=ingredient,
            quantity=qty,
            unit_cost=cost,
            total_cost=line_cost,
        )

        old_stock = ingredient.current_stock
        new_stock = old_stock + qty
        if new_stock > 0 and cost > 0:
            ingredient.average_cost = ((old_stock * ingredient.average_cost) + line_cost) / new_stock
        ingredient.current_stock = new_stock
        ingredient.save(update_fields=('current_stock', 'average_cost', 'updated_at'))

        StockTransaction.objects.create(
            ingredient=ingredient,
            transaction_type=StockTransaction.TransactionType.RECEIPT,
            quantity=qty,
            unit_cost=cost,
            balance_after=new_stock,
            reference_type='stock_receipt',
            reference_id=receipt.pk,
            note=f'Nhập kho {receipt.receipt_code}' + (f' ({supplier})' if supplier else ''),
            created_by=user,
        )
        affected_ingredients.append(ingredient)

    receipt.total_amount = total_amount
    receipt.save(update_fields=('total_amount',))

    from .views import update_product_cost_from_recipe
    for ing in affected_ingredients:
        recipe_ids = RecipeItem.objects.filter(ingredient=ing).values_list('recipe_id', flat=True).distinct()
        for r in Recipe.objects.filter(id__in=recipe_ids, is_active=True).select_related('product'):
            if r.product:
                update_product_cost_from_recipe(r.product)

    log_desc = f'Nhập kho số {receipt.receipt_code} từ {supplier or "nhà cung cấp lẻ"}: {len(items_data)} mặt hàng, tổng tiền {total_amount:,.0f} đ'
    log_activity(
        actor=user,
        action=ActivityLog.Action.STOCK_RECEIPT,
        description=log_desc,
        reason=note or 'Nhập nguyên vật liệu vào kho',
        request=request,
        object_type='StockReceipt',
        object_id=receipt.pk,
    )

    return receipt


@transaction.atomic
def create_and_confirm_issue(user, issue_type, receiver, note, items_data, request=None):
    if not items_data:
        raise ValidationError('Phiếu xuất phải có ít nhất một nguyên liệu.')

    issue_code = generate_issue_code()
    effective_type = issue_type or StockIssue.IssueType.MANUAL
    issue = StockIssue.objects.create(
        issue_code=issue_code,
        issue_type=effective_type,
        receiver=receiver.strip() if receiver else '',
        note=note.strip() if note else '',
        status=StockIssue.Status.CONFIRMED,
        created_by=user,
    )

    total_amount = Decimal(0)
    is_unpack_to_prep = effective_type in (StockIssue.IssueType.MANUAL, StockIssue.IssueType.INTERNAL)

    for item in items_data:
        ing_id = item.get('ingredient_id')
        qty = Decimal(str(item.get('quantity', 0)).replace(',', '.'))
        if qty <= 0:
            continue

        ingredient = Ingredient.objects.select_for_update().get(pk=ing_id)
        if ingredient.current_stock < qty:
            raise ValidationError(
                f'Nguyên liệu "{ingredient.name}" trong kho tổng chỉ còn {ingredient.current_stock:.2f} {ingredient.unit}, '
                f'không đủ để xuất {qty:.2f} {ingredient.unit}!'
            )

        unit_cost = ingredient.average_cost
        line_cost = qty * unit_cost
        total_amount += line_cost

        StockIssueItem.objects.create(
            issue=issue,
            ingredient=ingredient,
            quantity=qty,
            unit_cost=unit_cost,
            total_cost=line_cost,
        )

        new_stock = ingredient.current_stock - qty
        ingredient.current_stock = new_stock

        pack_size = ingredient.pack_size if ingredient.pack_size and ingredient.pack_size > 0 else Decimal('1')
        added_prep = qty * pack_size
        if is_unpack_to_prep:
            ingredient.prep_stock = (ingredient.prep_stock or Decimal('0')) + added_prep
            ingredient.save(update_fields=('current_stock', 'prep_stock', 'updated_at'))
            tx_note = (
                f'Xuất tách kho {issue.issue_code}: {qty:g} {ingredient.unit} -> '
                f'+{added_prep:g} {ingredient.unpacked_unit or "hộp"} đang chờ bán'
            )
            if note:
                tx_note += f' ({note})'
        else:
            ingredient.save(update_fields=('current_stock', 'updated_at'))
            tx_note = f'Xuất kho {issue.issue_code} ({issue.get_issue_type_display()})' + (f' - {note}' if note else '')

        StockTransaction.objects.create(
            ingredient=ingredient,
            transaction_type=StockTransaction.TransactionType.ISSUE,
            quantity=-qty,
            unit_cost=unit_cost,
            balance_after=new_stock,
            reference_type='stock_issue',
            reference_id=issue.pk,
            note=tx_note[:255],
            created_by=user,
        )

    issue.total_amount = total_amount
    issue.save(update_fields=('total_amount',))

    log_desc = f'Xuất kho số {issue.issue_code} ({issue.get_issue_type_display()}): {len(items_data)} mặt hàng, tổng giá trị {total_amount:,.0f} đ'
    log_activity(
        actor=user,
        action=ActivityLog.Action.WAREHOUSE,
        description=log_desc,
        reason=note or issue.get_issue_type_display(),
        request=request,
        object_type='StockIssue',
        object_id=issue.pk,
    )

    return issue


@transaction.atomic
def create_and_confirm_adjustment(user, note, items_data, request=None):
    if not items_data:
        raise ValidationError('Phiếu kiểm kê phải có ít nhất một nguyên liệu.')

    adjustment_code = generate_adjustment_code()
    adjustment = StockAdjustment.objects.create(
        adjustment_code=adjustment_code,
        note=note.strip() if note else '',
        created_by=user,
    )

    total_diff_amount = Decimal(0)
    adjusted_count = 0

    for item in items_data:
        ing_id = item.get('ingredient_id')
        actual_stock = Decimal(str(item.get('actual_stock', 0)).replace(',', '.'))
        if actual_stock < 0:
            actual_stock = Decimal(0)

        ingredient = Ingredient.objects.select_for_update().get(pk=ing_id)
        system_stock = ingredient.current_stock
        diff_qty = actual_stock - system_stock
        unit_cost = ingredient.average_cost
        diff_amt = diff_qty * unit_cost
        total_diff_amount += diff_amt

        StockAdjustmentItem.objects.create(
            adjustment=adjustment,
            ingredient=ingredient,
            system_stock=system_stock,
            actual_stock=actual_stock,
            diff_quantity=diff_qty,
            unit_cost=unit_cost,
            diff_amount=diff_amt,
        )

        if diff_qty != 0:
            adjusted_count += 1
            ingredient.current_stock = actual_stock
            ingredient.save(update_fields=('current_stock', 'updated_at'))

            tx_type = StockTransaction.TransactionType.INCREASE if diff_qty > 0 else StockTransaction.TransactionType.DECREASE
            StockTransaction.objects.create(
                ingredient=ingredient,
                transaction_type=tx_type,
                quantity=diff_qty,
                unit_cost=unit_cost,
                balance_after=actual_stock,
                reference_type='stock_adjustment',
                reference_id=adjustment.pk,
                note=f'Kiểm kê cân đối kho {adjustment.adjustment_code}' + (f': {note}' if note else ''),
                created_by=user,
            )

    adjustment.total_diff_amount = total_diff_amount
    adjustment.save(update_fields=('total_diff_amount',))

    log_desc = f'Kiểm kê cân đối kho số {adjustment.adjustment_code}: điều chỉnh {adjusted_count} mặt hàng, tổng chênh lệch {total_diff_amount:,.0f} đ'
    log_activity(
        actor=user,
        action=ActivityLog.Action.WAREHOUSE,
        description=log_desc,
        reason=note or 'Kiểm kê định kỳ cân đối sổ sách',
        request=request,
        object_type='StockAdjustment',
        object_id=adjustment.pk,
    )

    return adjustment
