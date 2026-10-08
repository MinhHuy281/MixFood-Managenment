import csv
import json
from decimal import Decimal

from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.db.models import Q
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render

from inventory.models import Recipe
from .forms import CategoryForm, IngredientForm, ProductForm
from .models import Category, Ingredient, Product


@login_required
def catalog_home(request):
	context = {
		'categories': Category.objects.filter(is_active=True),
		'products': Product.objects.filter(is_active=True).select_related('category'),
		'ingredients': Ingredient.objects.filter(is_active=True),
	}
	return render(request, 'catalog/home.html', context)


@login_required
def category_list(request):
	query = request.GET.get('q', '').strip()
	categories = Category.objects.all()
	if query:
		categories = categories.filter(Q(name__icontains=query) | Q(description__icontains=query))
	return render(request, 'catalog/category_list.html', {'categories': categories, 'query': query})


@login_required
def category_create(request):
	form = CategoryForm(request.POST or None)
	if form.is_valid():
		form.save()
		messages.success(request, 'Đã thêm danh mục món.')
		return redirect('catalog:categories')
	return render(request, 'catalog/form.html', {'form': form, 'title': 'Thêm danh mục', 'back_url': 'catalog:categories'})


@login_required
def category_update(request, pk):
	category = get_object_or_404(Category, pk=pk)
	form = CategoryForm(request.POST or None, instance=category)
	if form.is_valid():
		form.save()
		messages.success(request, 'Đã cập nhật danh mục món.')
		return redirect('catalog:categories')
	return render(request, 'catalog/form.html', {'form': form, 'title': 'Sửa danh mục', 'back_url': 'catalog:categories'})


@login_required
def category_delete(request, pk):
	category = get_object_or_404(Category, pk=pk)
	if request.method == 'POST':
		category.is_active = False
		category.save(update_fields=('is_active', 'updated_at'))
		messages.success(request, 'Đã ngừng sử dụng danh mục.')
	return redirect('catalog:categories')


@login_required
def product_list(request):
	query = request.GET.get('q', '').strip()
	category_id = request.GET.get('category', '')
	products = Product.objects.select_related('category').all()
	if query:
		products = products.filter(Q(code__icontains=query) | Q(name__icontains=query))
	if category_id:
		products = products.filter(category_id=category_id)
	return render(request, 'catalog/product_list.html', {'products': products, 'categories': Category.objects.filter(is_active=True), 'query': query, 'selected_category': category_id})


@login_required
def product_create(request):
	form = ProductForm(request.POST or None, request.FILES or None)
	if form.is_valid():
		form.save()
		messages.success(request, 'Đã thêm món ăn.')
		return redirect('catalog:products')
	return render(request, 'catalog/form.html', {'form': form, 'title': 'Thêm món ăn', 'back_url': 'catalog:products'})


@login_required
def product_update(request, pk):
	product = get_object_or_404(Product, pk=pk)
	form = ProductForm(request.POST or None, request.FILES or None, instance=product)
	if form.is_valid():
		form.save()
		messages.success(request, 'Đã cập nhật món ăn.')
		return redirect('catalog:products')
	return render(request, 'catalog/form.html', {'form': form, 'title': 'Sửa món ăn', 'back_url': 'catalog:products'})


@login_required
def product_delete(request, pk):
	product = get_object_or_404(Product, pk=pk)
	if request.method == 'POST':
		product.is_active = False
		product.save(update_fields=('is_active', 'updated_at'))
		messages.success(request, 'Đã ngừng bán món ăn.')
	return redirect('catalog:products')


@login_required
def ingredient_list(request):
	query = request.GET.get('q', '').strip()
	ingredients = Ingredient.objects.all()
	if query:
		ingredients = ingredients.filter(Q(code__icontains=query) | Q(name__icontains=query) | Q(supplier__icontains=query))
	return render(request, 'catalog/ingredient_list.html', {'ingredients': ingredients, 'query': query})


@login_required
def ingredient_create(request):
	form = IngredientForm(request.POST or None)
	if form.is_valid():
		form.save()
		messages.success(request, 'Đã thêm nguyên liệu.')
		return redirect('catalog:ingredients')
	return render(request, 'catalog/form.html', {'form': form, 'title': 'Thêm nguyên liệu', 'back_url': 'catalog:ingredients'})


@login_required
def ingredient_update(request, pk):
	ingredient = get_object_or_404(Ingredient, pk=pk)
	form = IngredientForm(request.POST or None, instance=ingredient)
	if form.is_valid():
		form.save()
		messages.success(request, 'Đã cập nhật nguyên liệu.')
		return redirect('catalog:ingredients')
	return render(request, 'catalog/form.html', {'form': form, 'title': 'Sửa nguyên liệu', 'back_url': 'catalog:ingredients'})


@login_required
def ingredient_delete(request, pk):
	ingredient = get_object_or_404(Ingredient, pk=pk)
	if request.method == 'POST':
		ingredient.is_active = False
		ingredient.save(update_fields=('is_active', 'updated_at'))
		messages.success(request, 'Đã ngừng sử dụng nguyên liệu.')
	return redirect('catalog:ingredients')


@login_required
def menu_admin(request):
	"""Trang Quản lý Thực đơn - Admin theo chuẩn SaaS F&B 2026."""
	categories = Category.objects.filter(is_active=True).order_by('display_order', 'name')
	products = Product.objects.filter(is_active=True).select_related('category').order_by('category__display_order', 'name')

	cat_counts = {cat.id: 0 for cat in categories}
	for p in products:
		if p.category_id in cat_counts:
			cat_counts[p.category_id] += 1

	category_list_data = []
	for cat in categories:
		category_list_data.append({
			'id': cat.id,
			'name': cat.name,
			'color': cat.color,
			'display_order': cat.display_order,
			'count': cat_counts.get(cat.id, 0),
		})

	context = {
		'categories': categories,
		'category_list_data': category_list_data,
		'products': products,
		'total_dishes_count': products.count(),
		'product_types': Product.ProductType.choices,
	}
	return render(request, 'catalog/menu_admin.html', context)


@login_required
def menu_dishes_api(request):
	"""API trả về danh sách món và danh mục cho cả Modal POS và trang Menu Admin."""
	category_id = request.GET.get('category_id')
	query = request.GET.get('q', '').strip()

	categories = Category.objects.filter(is_active=True).order_by('display_order', 'name')
	products = Product.objects.filter(is_active=True).select_related('category')

	if category_id and category_id.isdigit():
		products = products.filter(category_id=int(category_id))
	if query:
		products = products.filter(Q(code__icontains=query) | Q(name__icontains=query) | Q(subgroup__icontains=query))

	products = products.order_by('category__display_order', 'name')

	all_products = Product.objects.filter(is_active=True)
	cat_counts = {}
	for p in all_products:
		cat_counts[p.category_id] = cat_counts.get(p.category_id, 0) + 1

	dishes_data = []
	for p in products:
		dishes_data.append({
			'id': p.id,
			'category_id': p.category_id,
			'category_name': p.category.name,
			'subgroup': p.subgroup or '',
			'code': p.code,
			'name': p.name,
			'unit': p.unit,
			'price': float(p.price),
			'price_formatted': f'{p.price:,.0f}'.replace(',', '.'),
			'price_2': float(p.price_2),
			'price_2_formatted': f'{p.price_2:,.0f}'.replace(',', '.'),
			'price_3': float(p.price_3),
			'price_3_formatted': f'{p.price_3:,.0f}'.replace(',', '.'),
			'product_type': p.product_type,
			'product_type_display': p.get_product_type_display(),
			'is_available': p.is_available,
		})

	categories_data = [{
		'id': cat.id,
		'name': cat.name,
		'color': cat.color,
		'display_order': cat.display_order,
		'count': cat_counts.get(cat.id, 0),
	} for cat in categories]

	return JsonResponse({
		'dishes': dishes_data,
		'categories': categories_data,
		'total_count': len(dishes_data),
	})


@login_required
def menu_save_dish(request):
	"""Thêm mới hoặc cập nhật thông tin món ăn."""
	if request.method != 'POST':
		return JsonResponse({'error': 'Phương thức không hợp lệ.'}, status=405)

	try:
		data = json.loads(request.body) if request.content_type == 'application/json' else request.POST
	except Exception:
		data = request.POST

	dish_id = data.get('dish_id')
	category_id = data.get('category_id')
	subgroup = data.get('subgroup', '').strip()
	code = data.get('code', '').strip().upper()
	name = data.get('name', '').strip()
	unit = data.get('unit', '').strip() or 'Phần'

	try:
		price = Decimal(str(data.get('price', 0)).replace('.', '').replace(',', '') or 0)
	except Exception:
		price = Decimal(0)

	try:
		price_2 = Decimal(str(data.get('price_2', 0)).replace('.', '').replace(',', '') or 0)
	except Exception:
		price_2 = Decimal(0)

	try:
		price_3 = Decimal(str(data.get('price_3', 0)).replace('.', '').replace(',', '') or 0)
	except Exception:
		price_3 = Decimal(0)

	product_type = data.get('product_type', 'food')
	if product_type not in ('food', 'drink', 'topping', 'other'):
		product_type = 'food'

	auto_recipe = str(data.get('auto_recipe', 'true')).lower() in ('true', '1', 'on', 'yes')

	if not code:
		return JsonResponse({'error': 'Vui lòng nhập mã món.'}, status=400)
	if not name:
		return JsonResponse({'error': 'Vui lòng nhập tên món.'}, status=400)
	if not category_id:
		return JsonResponse({'error': 'Vui lòng chọn danh mục.'}, status=400)

	try:
		category = Category.objects.get(pk=category_id)
	except Category.DoesNotExist:
		return JsonResponse({'error': 'Danh mục không tồn tại.'}, status=400)

	existing_query = Product.objects.filter(code=code)
	if dish_id and str(dish_id).isdigit():
		existing_query = existing_query.exclude(pk=int(dish_id))
	if existing_query.exists():
		return JsonResponse({'error': f'Mã món "{code}" đã được sử dụng bởi món khác.'}, status=400)

	if dish_id and str(dish_id).isdigit():
		product = get_object_or_404(Product, pk=int(dish_id))
		product.category = category
		product.subgroup = subgroup
		product.code = code
		product.name = name
		product.unit = unit
		product.price = price
		product.price_2 = price_2
		product.price_3 = price_3
		product.product_type = product_type
		product.is_active = True
		product.save()
		message = f'Đã cập nhật món "{product.name}" thành công.'
	else:
		product = Product.objects.create(
			category=category,
			subgroup=subgroup,
			code=code,
			name=name,
			unit=unit,
			price=price,
			price_2=price_2,
			price_3=price_3,
			product_type=product_type,
			is_available=True,
			is_active=True,
		)
		message = f'Đã thêm món mới "{product.name}" thành công.'

	if auto_recipe:
		Recipe.objects.get_or_create(
			product=product,
			defaults={'description': f'Tự động tạo định lượng cho {product.name}'}
		)

	return JsonResponse({
		'success': True,
		'message': message,
		'dish': {
			'id': product.id,
			'category_id': product.category_id,
			'category_name': product.category.name,
			'subgroup': product.subgroup or '',
			'code': product.code,
			'name': product.name,
			'unit': product.unit,
			'price': float(product.price),
			'price_formatted': f'{product.price:,.0f}'.replace(',', '.'),
			'price_2': float(product.price_2),
			'price_2_formatted': f'{product.price_2:,.0f}'.replace(',', '.'),
			'price_3': float(product.price_3),
			'price_3_formatted': f'{product.price_3:,.0f}'.replace(',', '.'),
			'product_type': product.product_type,
			'product_type_display': product.get_product_type_display(),
			'is_available': product.is_available,
		}
	})


@login_required
def menu_delete_dish(request, pk):
	"""Xóa / ngừng sử dụng món ăn."""
	if request.method != 'POST':
		return JsonResponse({'error': 'Phương thức không hợp lệ.'}, status=405)
	product = get_object_or_404(Product, pk=pk)
	product.is_active = False
	product.is_available = False
	product.save(update_fields=('is_active', 'is_available', 'updated_at'))
	return JsonResponse({
		'success': True,
		'message': f'Đã xóa món "{product.name}".'
	})


@login_required
def menu_save_category(request):
	"""Thêm mới hoặc chỉnh sửa danh mục món."""
	if request.method != 'POST':
		return JsonResponse({'error': 'Phương thức không hợp lệ.'}, status=405)
	try:
		data = json.loads(request.body) if request.content_type == 'application/json' else request.POST
	except Exception:
		data = request.POST

	cat_id = data.get('category_id')
	name = data.get('name', '').strip()
	color = data.get('color', '').strip() or '#f59e0b'
	try:
		display_order = int(data.get('display_order', 0))
	except Exception:
		display_order = 0

	if not name:
		return JsonResponse({'error': 'Vui lòng nhập tên danh mục.'}, status=400)

	dup_q = Category.objects.filter(name__iexact=name)
	if cat_id and str(cat_id).isdigit():
		dup_q = dup_q.exclude(pk=int(cat_id))
	if dup_q.exists():
		return JsonResponse({'error': f'Danh mục "{name}" đã tồn tại.'}, status=400)

	if cat_id and str(cat_id).isdigit():
		cat = get_object_or_404(Category, pk=int(cat_id))
		cat.name = name
		cat.color = color
		cat.display_order = display_order
		cat.is_active = True
		cat.save()
		message = f'Đã cập nhật danh mục "{cat.name}".'
	else:
		cat = Category.objects.create(
			name=name,
			color=color,
			display_order=display_order,
			is_active=True
		)
		message = f'Đã thêm danh mục "{cat.name}".'

	count = Product.objects.filter(category=cat, is_active=True).count()
	return JsonResponse({
		'success': True,
		'message': message,
		'category': {
			'id': cat.id,
			'name': cat.name,
			'color': cat.color,
			'display_order': cat.display_order,
			'count': count,
		}
	})


@login_required
def menu_delete_category(request, pk):
	"""Xóa / ngừng sử dụng danh mục món."""
	if request.method != 'POST':
		return JsonResponse({'error': 'Phương thức không hợp lệ.'}, status=405)
	cat = get_object_or_404(Category, pk=pk)
	cat.is_active = False
	cat.save(update_fields=('is_active', 'updated_at'))
	return JsonResponse({
		'success': True,
		'message': f'Đã xóa danh mục "{cat.name}".'
	})


@login_required
def menu_export_excel(request):
	"""Xuất danh sách thực đơn ra file Excel (CSV UTF-8 với BOM)."""
	response = HttpResponse(content_type='text/csv; charset=utf-8')
	response['Content-Disposition'] = 'attachment; filename="thuc_don_mixfood.csv"'
	response.write('\ufeff')

	writer = csv.writer(response)
	writer.writerow([
		'Hạng mục', 'Nhóm con', 'Mã món', 'Tên món', 'ĐVT',
		'Đơn giá (đ)', 'Đơn giá 2', 'Đơn giá 3', 'Loại', 'Trạng thái'
	])

	products = Product.objects.filter(is_active=True).select_related('category').order_by('category__display_order', 'name')
	for p in products:
		writer.writerow([
			p.category.name,
			p.subgroup or '',
			p.code,
			p.name,
			p.unit,
			int(p.price),
			int(p.price_2),
			int(p.price_3),
			p.get_product_type_display(),
			'Đang bán' if p.is_available else 'Tạm ngưng',
		])
	return response


@login_required
def menu_import_excel(request):
	"""Nhập dữ liệu thực đơn từ file Excel (CSV) hoặc nội dung văn bản."""
	if request.method != 'POST':
		return JsonResponse({'error': 'Phương thức không hợp lệ.'}, status=405)

	auto_recipe = str(request.POST.get('auto_recipe', 'true')).lower() in ('true', '1', 'on', 'yes')
	csv_file = request.FILES.get('file')
	csv_text = request.POST.get('csv_text', '').strip()

	lines = []
	if csv_file:
		content = csv_file.read().decode('utf-8-sig', errors='ignore')
		lines = content.splitlines()
	elif csv_text:
		lines = csv_text.splitlines()
	else:
		return JsonResponse({'error': 'Vui lòng tải lên file CSV hoặc nhập dữ liệu thực đơn.'}, status=400)

	if not lines:
		return JsonResponse({'error': 'Dữ liệu nhập rỗng.'}, status=400)

	sample = lines[0]
	delimiter = '\t' if '\t' in sample else (',' if ',' in sample else ';')
	reader = csv.reader(lines, delimiter=delimiter)

	imported_count = 0
	header_skipped = False

	for row in reader:
		if not row or not any(row):
			continue
		if not header_skipped and ('Mã' in row[0] or 'Hạng mục' in row[0] or 'Mã món' in ''.join(row)):
			header_skipped = True
			continue

		cat_name = row[0].strip() if len(row) > 0 else 'KHAI VỊ'
		subgroup = row[1].strip() if len(row) > 1 else ''
		code = row[2].strip().upper() if len(row) > 2 else ''
		name = row[3].strip() if len(row) > 3 else ''
		unit = row[4].strip() if len(row) > 4 else 'Phần'

		p1 = row[5].strip().replace('.', '').replace(',', '') if len(row) > 5 else '0'
		p2 = row[6].strip().replace('.', '').replace(',', '') if len(row) > 6 else '0'
		p3 = row[7].strip().replace('.', '').replace(',', '') if len(row) > 7 else '0'
		ptype_str = row[8].strip().lower() if len(row) > 8 else 'đồ ăn'

		if not code or not name:
			continue

		ptype = 'food'
		if 'uống' in ptype_str or 'nước' in ptype_str or 'drink' in ptype_str:
			ptype = 'drink'
		elif 'topping' in ptype_str:
			ptype = 'topping'
		elif 'khác' in ptype_str or 'other' in ptype_str:
			ptype = 'other'

		try:
			p1_val = Decimal(p1 or 0)
		except Exception:
			p1_val = Decimal(0)
		try:
			p2_val = Decimal(p2 or 0)
		except Exception:
			p2_val = Decimal(0)
		try:
			p3_val = Decimal(p3 or 0)
		except Exception:
			p3_val = Decimal(0)

		category, _ = Category.objects.get_or_create(
			name=cat_name or 'KHAI VỊ',
			defaults={'is_active': True}
		)

		product, _ = Product.objects.update_or_create(
			code=code,
			defaults={
				'category': category,
				'subgroup': subgroup,
				'name': name,
				'unit': unit or 'Phần',
				'price': p1_val,
				'price_2': p2_val,
				'price_3': p3_val,
				'product_type': ptype,
				'is_available': True,
				'is_active': True,
			}
		)
		if auto_recipe:
			Recipe.objects.get_or_create(
				product=product,
				defaults={'description': f'Tự động tạo định lượng cho {product.name}'}
			)
		imported_count += 1

	return JsonResponse({
		'success': True,
		'imported_count': imported_count,
		'message': f'Đã nhập thành công {imported_count} món ăn vào thực đơn.'
	})
