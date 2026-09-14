from django.contrib.auth.decorators import login_required
from django.db.models import Prefetch
from django.shortcuts import render

from catalog.models import Category, Product
from dining.models import Area, DiningTable
from sales.models import Invoice


@login_required
def home(request):
	return render(request, 'dashboard/home.html', {
		'areas': Area.objects.filter(is_active=True).prefetch_related(Prefetch('tables', queryset=DiningTable.objects.filter(is_active=True))),
		'categories': Category.objects.filter(is_active=True),
		'products': Product.objects.filter(is_active=True, is_available=True).select_related('category'),
		'invoices': Invoice.objects.select_related('order', 'cashier', 'order__table').prefetch_related('payments')[:30],
	})
