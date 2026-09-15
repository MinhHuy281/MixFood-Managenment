from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from catalog.models import Ingredient

from .models import RecipeItem, StockReceipt, StockTransaction


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