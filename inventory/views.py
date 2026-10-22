import csv
import json
from decimal import Decimal

from django.contrib.auth.decorators import login_required
from django.db.models import Q
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, render

from accounts.decorators import role_required
from catalog.models import Category, Ingredient, Product

from .models import Recipe, RecipeItem, StockTransaction


def update_product_cost_from_recipe(product):
	"""Tự động tính lại giá vốn món ăn từ tổng định lượng nguyên liệu."""
	recipe = getattr(product, 'recipe', None)
	if not recipe or not recipe.is_active:
		return Decimal(0)

	total_cost = Decimal(0)
	for item in recipe.items.select_related('ingredient'):
		if item.ingredient and item.ingredient.is_active:
			total_cost += item.quantity * item.ingredient.average_cost

	product.cost_price = total_cost
	product.save(update_fields=('cost_price', 'updated_at'))
	return total_cost


@login_required
@role_required('Owner', 'Manager', 'Warehouse')
def inventory_home(request):
	return render(request, 'inventory/pages/home.html', {
		'ingredients': Ingredient.objects.filter(is_active=True),
		'transactions': StockTransaction.objects.select_related('ingredient', 'created_by')[:100],
	})


@login_required
def recipe_list(request):
	"""Trang Quản lý Định lượng nguyên liệu (Recipes / BOM)."""
	categories = Category.objects.filter(is_active=True).order_by('display_order', 'name')
	products = Product.objects.filter(is_active=True).select_related('category', 'recipe').prefetch_related('recipe__items__ingredient').order_by('category__display_order', 'name')
	ingredients = Ingredient.objects.filter(is_active=True).order_by('group', 'name')

	return render(request, 'inventory/pages/recipes.html', {
		'categories': categories,
		'products': products,
		'ingredients': ingredients,
		'total_products': products.count(),
	})


@login_required
def recipe_data_api(request):
	"""API trả về danh sách món và chi tiết định lượng cho Modal POS và AJAX."""
	product_id = request.GET.get('product_id')
	category_id = request.GET.get('category_id')
	query = request.GET.get('q', '').strip()

	categories = Category.objects.filter(is_active=True).order_by('display_order', 'name')
	products_qs = Product.objects.filter(is_active=True).select_related('category', 'recipe').prefetch_related('recipe__items__ingredient')

	if category_id and category_id.isdigit():
		products_qs = products_qs.filter(category_id=int(category_id))
	if query:
		products_qs = products_qs.filter(Q(code__icontains=query) | Q(name__icontains=query))

	products_qs = products_qs.order_by('category__display_order', 'name')

	products_data = []
	for p in products_qs:
		recipe = getattr(p, 'recipe', None)
		has_recipe = recipe is not None and recipe.is_active and recipe.items.exists()
		items_count = recipe.items.count() if (recipe and recipe.is_active) else 0

		# Margin
		price = float(p.price)
		cost = float(p.cost_price)
		profit = price - cost
		margin_pct = round((profit / price * 100), 1) if price > 0 else 0

		products_data.append({
			'id': p.id,
			'code': p.code,
			'name': p.name,
			'category_id': p.category_id,
			'category_name': p.category.name,
			'unit': p.unit,
			'price': price,
			'price_formatted': f'{p.price:,.0f}'.replace(',', '.'),
			'cost_price': cost,
			'cost_price_formatted': f'{p.cost_price:,.0f}'.replace(',', '.'),
			'profit': profit,
			'profit_formatted': f'{profit:,.0f}'.replace(',', '.'),
			'margin_pct': margin_pct,
			'has_recipe': has_recipe,
			'items_count': items_count,
		})

	# Chi tiết món đang chọn nếu có
	selected_recipe_data = None
	if product_id and product_id.isdigit():
		selected_product = Product.objects.filter(pk=int(product_id), is_active=True).select_related('recipe', 'category').first()
		if selected_product:
			recipe, _ = Recipe.objects.get_or_create(
				product=selected_product,
				defaults={'is_active': True, 'description': f'Công thức món {selected_product.name}'}
			)
			items_qs = recipe.items.select_related('ingredient').filter(ingredient__is_active=True).order_by('ingredient__group', 'ingredient__name')

			items_list = []
			total_cost = Decimal(0)
			for it in items_qs:
				line_cost = it.quantity * it.ingredient.average_cost
				total_cost += line_cost
				items_list.append({
					'item_id': it.id,
					'ingredient_id': it.ingredient_id,
					'ingredient_code': it.ingredient.code,
					'ingredient_name': it.ingredient.name,
					'ingredient_group': it.ingredient.group or '',
					'quantity': float(it.quantity),
					'quantity_formatted': f'{it.quantity:.3f}'.rstrip('0').rstrip('.') if '.' in f'{it.quantity}' else f'{it.quantity}',
					'unit': it.unit,
					'unit_cost': float(it.ingredient.average_cost),
					'unit_cost_formatted': f'{it.ingredient.average_cost:,.0f}'.replace(',', '.'),
					'total_cost': float(line_cost),
					'total_cost_formatted': f'{line_cost:,.0f}'.replace(',', '.'),
				})

			# Đồng bộ lại cost_price của sản phẩm
			if selected_product.cost_price != total_cost:
				selected_product.cost_price = total_cost
				selected_product.save(update_fields=('cost_price', 'updated_at'))

			price = float(selected_product.price)
			cost = float(total_cost)
			profit = price - cost
			margin_pct = round((profit / price * 100), 1) if price > 0 else 0

			selected_recipe_data = {
				'product_id': selected_product.id,
				'product_code': selected_product.code,
				'product_name': selected_product.name,
				'product_unit': selected_product.unit,
				'category_name': selected_product.category.name,
				'price': price,
				'price_formatted': f'{selected_product.price:,.0f}'.replace(',', '.'),
				'total_cost': cost,
				'total_cost_formatted': f'{cost:,.0f}'.replace(',', '.'),
				'profit': profit,
				'profit_formatted': f'{profit:,.0f}'.replace(',', '.'),
				'margin_pct': margin_pct,
				'description': recipe.description,
				'items': items_list,
			}

	# Danh sách tất cả nguyên liệu để chọn
	ingredients_qs = Ingredient.objects.filter(is_active=True).order_by('group', 'name')
	ingredients_data = [{
		'id': ing.id,
		'group': ing.group or '',
		'code': ing.code,
		'name': ing.name,
		'unit': ing.unit,
		'average_cost': float(ing.average_cost),
		'cost_formatted': f'{ing.average_cost:,.0f}'.replace(',', '.'),
		'current_stock_formatted': f'{ing.current_stock:.3f}',
	} for ing in ingredients_qs]

	categories_data = [{
		'id': c.id,
		'name': c.name,
	} for c in categories]

	return JsonResponse({
		'products': products_data,
		'selected_recipe': selected_recipe_data,
		'ingredients': ingredients_data,
		'categories': categories_data,
		'total_products': len(products_data),
	})


@login_required
def recipe_save_item_api(request):
	"""Thêm hoặc sửa nguyên liệu trong công thức của món."""
	if request.method != 'POST':
		return JsonResponse({'error': 'Phương thức không hợp lệ.'}, status=405)

	try:
		data = json.loads(request.body) if request.content_type == 'application/json' else request.POST
	except Exception:
		data = request.POST

	product_id = data.get('product_id')
	ingredient_id = data.get('ingredient_id')
	quantity_raw = str(data.get('quantity', 0)).replace(',', '.')
	unit = data.get('unit', '').strip()

	if not product_id or not str(product_id).isdigit():
		return JsonResponse({'error': 'Vui lòng chọn món ăn.'}, status=400)
	if not ingredient_id or not str(ingredient_id).isdigit():
		return JsonResponse({'error': 'Vui lòng chọn nguyên liệu.'}, status=400)

	try:
		quantity = Decimal(quantity_raw)
		if quantity <= 0:
			return JsonResponse({'error': 'Định lượng phải lớn hơn 0.'}, status=400)
	except Exception:
		return JsonResponse({'error': 'Định lượng không hợp lệ.'}, status=400)

	product = get_object_or_404(Product, pk=int(product_id))
	ingredient = get_object_or_404(Ingredient, pk=int(ingredient_id))

	if not unit:
		unit = ingredient.unit

	recipe, _ = Recipe.objects.get_or_create(
		product=product,
		defaults={'is_active': True, 'description': f'Công thức cho {product.name}'}
	)
	recipe.is_active = True
	recipe.save(update_fields=('is_active', 'updated_at'))

	recipe_item, created = RecipeItem.objects.update_or_create(
		recipe=recipe,
		ingredient=ingredient,
		defaults={'quantity': quantity, 'unit': unit}
	)

	# Tính lại giá vốn
	new_cost = update_product_cost_from_recipe(product)

	return JsonResponse({
		'success': True,
		'message': f'Đã cập nhật nguyên liệu "{ingredient.name}" vào công thức.',
		'item': {
			'item_id': recipe_item.id,
			'ingredient_id': ingredient.id,
			'ingredient_code': ingredient.code,
			'ingredient_name': ingredient.name,
			'quantity': float(recipe_item.quantity),
			'unit': recipe_item.unit,
			'unit_cost': float(ingredient.average_cost),
			'unit_cost_formatted': f'{ingredient.average_cost:,.0f}'.replace(',', '.'),
			'total_cost': float(recipe_item.quantity * ingredient.average_cost),
			'total_cost_formatted': f'{(recipe_item.quantity * ingredient.average_cost):,.0f}'.replace(',', '.'),
		},
		'new_cost_price': float(new_cost),
		'new_cost_price_formatted': f'{new_cost:,.0f}'.replace(',', '.'),
	})


@login_required
def recipe_delete_item_api(request, pk):
	"""Xóa 1 nguyên liệu khỏi công thức."""
	if request.method != 'POST':
		return JsonResponse({'error': 'Phương thức không hợp lệ.'}, status=405)

	recipe_item = get_object_or_404(RecipeItem, pk=pk)
	product = recipe_item.recipe.product
	ing_name = recipe_item.ingredient.name

	recipe_item.delete()

	new_cost = update_product_cost_from_recipe(product)

	return JsonResponse({
		'success': True,
		'message': f'Đã xóa nguyên liệu "{ing_name}" khỏi công thức.',
		'new_cost_price': float(new_cost),
		'new_cost_price_formatted': f'{new_cost:,.0f}'.replace(',', '.'),
	})


@login_required
def recipe_delete_recipe_api(request, product_id):
	"""Xóa toàn bộ công thức định lượng của món ăn."""
	if request.method != 'POST':
		return JsonResponse({'error': 'Phương thức không hợp lệ.'}, status=405)

	product = get_object_or_404(Product, pk=product_id)
	recipe = getattr(product, 'recipe', None)
	if recipe:
		recipe.items.all().delete()
		recipe.is_active = False
		recipe.save(update_fields=('is_active', 'updated_at'))

	product.cost_price = Decimal(0)
	product.save(update_fields=('cost_price', 'updated_at'))

	return JsonResponse({
		'success': True,
		'message': f'Đã xóa công thức định lượng của món "{product.name}".',
	})


@login_required
def recipe_export_excel(request):
	"""Xuất danh sách công thức định lượng ra file Excel CSV UTF-8 với BOM."""
	response = HttpResponse(content_type='text/csv; charset=utf-8')
	response['Content-Disposition'] = 'attachment; filename="dinh_luong_nguyen_lieu_mixfood.csv"'
	response.write('\ufeff')

	writer = csv.writer(response)
	writer.writerow([
		'Mã món', 'Tên món', 'Danh mục', 'ĐVT món', 'Đơn giá bán (đ)',
		'Giá vốn món (đ)', 'Mã nguyên liệu', 'Tên nguyên liệu', 'Định lượng',
		'ĐVT nguyên liệu', 'Đơn giá vốn NL (đ)', 'Thành tiền vốn NL (đ)'
	])

	recipes = Recipe.objects.filter(is_active=True).select_related('product__category').prefetch_related('items__ingredient').order_by('product__category__display_order', 'product__name')

	for r in recipes:
		p = r.product
		items = list(r.items.select_related('ingredient').all())
		if not items:
			writer.writerow([
				p.code, p.name, p.category.name, p.unit, int(p.price),
				int(p.cost_price), '', '', '', '', '', ''
			])
		else:
			for item in items:
				ing = item.ingredient
				line_cost = item.quantity * ing.average_cost
				writer.writerow([
					p.code, p.name, p.category.name, p.unit, int(p.price),
					int(p.cost_price), ing.code, ing.name, f'{item.quantity:.3f}',
					item.unit, int(ing.average_cost), int(line_cost)
				])

	return response


@login_required
def recipe_import_excel(request):
	"""Nhập công thức định lượng từ file Excel CSV hoặc nội dung dán."""
	if request.method != 'POST':
		return JsonResponse({'error': 'Phương thức không hợp lệ.'}, status=405)

	csv_file = request.FILES.get('file')
	csv_text = request.POST.get('csv_text', '').strip()

	lines = []
	if csv_file:
		content = csv_file.read().decode('utf-8-sig', errors='ignore')
		lines = content.splitlines()
	elif csv_text:
		lines = csv_text.splitlines()
	else:
		return JsonResponse({'error': 'Vui lòng tải lên file CSV hoặc dán dữ liệu công thức.'}, status=400)

	if not lines:
		return JsonResponse({'error': 'Dữ liệu nhập rỗng.'}, status=400)

	sample = lines[0]
	delimiter = '\t' if '\t' in sample else (',' if ',' in sample else ';')
	reader = csv.reader(lines, delimiter=delimiter)

	imported_count = 0
	header_skipped = False
	affected_products = set()

	for row in reader:
		if not row or not any(row):
			continue
		row_str = ''.join(row)
		if not header_skipped and ('Mã món' in row_str or 'Tên món' in row_str or 'Nguyên liệu' in row_str or 'Định lượng' in row_str):
			header_skipped = True
			continue

		# Tìm product và ingredient
		# Cấu trúc chuẩn: Mã món | Tên món | ... | Mã nguyên liệu | Tên nguyên liệu | Định lượng | ĐVT
		# Hoặc đơn giản: Mã món | Mã nguyên liệu | Định lượng | ĐVT
		product = None
		ingredient = None
		quantity_val = Decimal(0)
		unit_val = ''

		if len(row) >= 10:
			prod_code = row[0].strip()
			prod_name = row[1].strip()
			ing_code = row[6].strip()
			ing_name = row[7].strip()
			qty_raw = row[8].strip().replace(',', '.')
			unit_val = row[9].strip()

			product = Product.objects.filter(code=prod_code).first() or Product.objects.filter(name__iexact=prod_name).first()
			ingredient = Ingredient.objects.filter(code=ing_code).first() or Ingredient.objects.filter(name__iexact=ing_name).first()
			try:
				quantity_val = Decimal(qty_raw or 0)
			except Exception:
				quantity_val = Decimal(0)

		elif len(row) >= 3:
			prod_key = row[0].strip()
			ing_key = row[1].strip()
			qty_raw = row[2].strip().replace(',', '.')
			unit_val = row[3].strip() if len(row) > 3 else ''

			product = Product.objects.filter(Q(code=prod_key) | Q(name__iexact=prod_key)).first()
			ingredient = Ingredient.objects.filter(Q(code=ing_key) | Q(name__iexact=ing_key)).first()
			try:
				quantity_val = Decimal(qty_raw or 0)
			except Exception:
				quantity_val = Decimal(0)

		if product and ingredient and quantity_val > 0:
			recipe, _ = Recipe.objects.get_or_create(
				product=product,
				defaults={'is_active': True, 'description': f'Công thức cho {product.name}'}
			)
			recipe.is_active = True
			recipe.save()

			if not unit_val:
				unit_val = ingredient.unit

			RecipeItem.objects.update_or_create(
				recipe=recipe,
				ingredient=ingredient,
				defaults={'quantity': quantity_val, 'unit': unit_val}
			)
			affected_products.add(product)
			imported_count += 1

	# Cập nhật lại cost_price cho các món bị ảnh hưởng
	for p in affected_products:
		update_product_cost_from_recipe(p)

	return JsonResponse({
		'success': True,
		'imported_count': imported_count,
		'affected_dishes_count': len(affected_products),
		'message': f'Đã nhập thành công {imported_count} định lượng cho {len(affected_products)} món ăn.'
	})

