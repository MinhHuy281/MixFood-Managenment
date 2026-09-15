from django.contrib.auth.decorators import login_required
from django.shortcuts import render

from accounts.decorators import role_required
from catalog.models import Ingredient, Product

from .models import Recipe, StockTransaction


@login_required
@role_required('Owner', 'Manager', 'Warehouse')
def inventory_home(request):
	return render(request, 'inventory/home.html', {
		'ingredients': Ingredient.objects.filter(is_active=True),
		'transactions': StockTransaction.objects.select_related('ingredient', 'created_by')[:100],
	})


@login_required
@role_required('Owner', 'Manager', 'Warehouse')
def recipe_list(request):
	recipes = Recipe.objects.filter(is_active=True).select_related('product').prefetch_related('items__ingredient')
	return render(request, 'inventory/recipes.html', {'recipes': recipes, 'products': Product.objects.filter(is_active=True)})
