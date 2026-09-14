from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db.models import Prefetch
from django.shortcuts import get_object_or_404, redirect, render

from .forms import AreaForm, DiningTableForm
from .models import Area, DiningTable


@login_required
def dining_home(request):
	return render(request, 'dining/home.html', {
		'areas': Area.objects.filter(is_active=True).prefetch_related(Prefetch('tables', queryset=DiningTable.objects.filter(is_active=True))),
		'tables': DiningTable.objects.filter(is_active=True).select_related('area'),
	})


@login_required
def area_create(request):
	form = AreaForm(request.POST or None)
	if form.is_valid():
		form.save()
		messages.success(request, 'Đã thêm khu vực.')
		return redirect('dining:home')
	return render(request, 'dining/form.html', {'form': form, 'title': 'Thêm khu vực'})


@login_required
def area_update(request, pk):
	area = get_object_or_404(Area, pk=pk)
	form = AreaForm(request.POST or None, instance=area)
	if form.is_valid():
		form.save()
		messages.success(request, 'Đã cập nhật khu vực.')
		return redirect('dining:home')
	return render(request, 'dining/form.html', {'form': form, 'title': 'Sửa khu vực'})


@login_required
def area_delete(request, pk):
	area = get_object_or_404(Area, pk=pk)
	if request.method == 'POST':
		area.is_active = False
		area.save(update_fields=('is_active', 'updated_at'))
		messages.success(request, 'Đã ngừng sử dụng khu vực.')
	return redirect('dining:home')


@login_required
def table_create(request):
	form = DiningTableForm(request.POST or None)
	if form.is_valid():
		form.save()
		messages.success(request, 'Đã thêm bàn.')
		return redirect('dining:home')
	return render(request, 'dining/form.html', {'form': form, 'title': 'Thêm bàn'})


@login_required
def table_update(request, pk):
	table = get_object_or_404(DiningTable, pk=pk)
	form = DiningTableForm(request.POST or None, instance=table)
	if form.is_valid():
		form.save()
		messages.success(request, 'Đã cập nhật bàn.')
		return redirect('dining:home')
	return render(request, 'dining/form.html', {'form': form, 'title': 'Sửa bàn'})


@login_required
def table_delete(request, pk):
	table = get_object_or_404(DiningTable, pk=pk)
	if request.method == 'POST':
		table.is_active = False
		table.save(update_fields=('is_active', 'updated_at'))
		messages.success(request, 'Đã ngừng sử dụng bàn.')
	return redirect('dining:home')
