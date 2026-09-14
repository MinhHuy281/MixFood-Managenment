from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.db.models import Q
from django.shortcuts import get_object_or_404, redirect, render

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
