from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from catalog.models import Ingredient

from .models import (
    RecipeItem, StockReceipt, StockReceiptItem, StockTransaction,
    StockIssue, StockIssueItem, StockAdjustment, StockAdjustmentItem
)


def deduct_for_sale(order_items, user, reference_id):
    """Lock ingredients, validate stock, then deduct all recipe quantities atomically."""
    required = {}
    for order_item in order_items:
        recipe_items = RecipeItem.objects.filter(
            recipe__product_id=order_item.product_id,
            recipe__is_active=True,
        ).select_related('ingredient')
        for recipe_item in recipe_items:
            required.setdefault(recipe_item.ingredient_id, {
                'ingredient': recipe_item.ingredient,
                'quantity': Decimal('0'),
            })['quantity'] += recipe_item.quantity * order_item.quantity

    if not required:
        return []

    ingredient_ids = list(required)
    locked = {
        ingredient.pk: ingredient
        for ingredient in Ingredient.objects.select_for_update().filter(pk__in=ingredient_ids)
    }
    for ingredient_id, data in required.items():
        ingredient = locked.get(ingredient_id)
        if ingredient is None or ingredient.current_stock < data['quantity']:
            name = data['ingredient'].name
            raise ValidationError(f'Không đủ tồn kho nguyên liệu: {name}.')

    transactions = []
    for ingredient_id, data in required.items():
        ingredient = locked[ingredient_id]
        ingredient.current_stock -= data['quantity']
        ingredient.save(update_fields=('current_stock', 'updated_at'))
        transactions.append(StockTransaction.objects.create(
            ingredient=ingredient,
            transaction_type=StockTransaction.TransactionType.SALE,
            quantity=-data['quantity'],
            unit_cost=ingredient.average_cost,
            balance_after=ingredient.current_stock,
            reference_type='order',
            reference_id=reference_id,
            note='Tự động xuất kho theo thanh toán',
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


def restore_stock_for_undone_sale(order_id):
    """Hoàn trả lại tồn kho nguyên liệu khi hoàn tác thanh toán một đơn hàng."""
    if not order_id:
        return
    sale_txs = list(
        StockTransaction.objects.filter(
            reference_type='order',
            reference_id=order_id,
            transaction_type=StockTransaction.TransactionType.SALE,
        )
    )
    if not sale_txs:
        return

    ingredient_ids = list({tx.ingredient_id for tx in sale_txs})
    locked = {
        ing.pk: ing
        for ing in Ingredient.objects.select_for_update().filter(pk__in=ingredient_ids)
    }
    for tx in sale_txs:
        ing = locked.get(tx.ingredient_id)
        if ing is not None:
            ing.current_stock += abs(tx.quantity)
            ing.save(update_fields=('current_stock', 'updated_at'))
    StockTransaction.objects.filter(pk__in=[tx.pk for tx in sale_txs]).delete()

from .models import StockIssue, StockIssueItem, StockAdjustment, StockAdjustmentItem
from audit.models import ActivityLog, log_activity


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
        if new_stock > 0:
            ingredient.average_cost = ((old_stock * ingredient.average_cost) + line_cost) / new_stock
        else:
            ingredient.average_cost = cost
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

    # Cập nhật lại giá vốn món ăn
    from .views import update_product_cost_from_recipe
    from .models import RecipeItem, Recipe
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
    issue = StockIssue.objects.create(
        issue_code=issue_code,
        issue_type=issue_type or StockIssue.IssueType.MANUAL,
        receiver=receiver.strip() if receiver else '',
        note=note.strip() if note else '',
        status=StockIssue.Status.CONFIRMED,
        created_by=user,
    )

    total_amount = Decimal(0)
    for item in items_data:
        ing_id = item.get('ingredient_id')
        qty = Decimal(str(item.get('quantity', 0)).replace(',', '.'))
        if qty <= 0:
            continue

        ingredient = Ingredient.objects.select_for_update().get(pk=ing_id)
        if ingredient.current_stock < qty:
            raise ValidationError(f'Nguyên liệu "{ingredient.name}" chỉ còn tồn {ingredient.current_stock:.3f} {ingredient.unit}, không đủ để xuất {qty:.3f}!')

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
        ingredient.save(update_fields=('current_stock', 'updated_at'))

        StockTransaction.objects.create(
            ingredient=ingredient,
            transaction_type=StockTransaction.TransactionType.ISSUE,
            quantity=-qty,
            unit_cost=unit_cost,
            balance_after=new_stock,
            reference_type='stock_issue',
            reference_id=issue.pk,
            note=f'Xuất kho {issue.issue_code} ({issue.get_issue_type_display()})' + (f' - {note}' if note else ''),
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

