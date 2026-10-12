import csv
import json

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.db.models import Prefetch, Q
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST

from .forms import AreaForm, DiningTableForm
from .models import Area, DiningTable


@login_required
def dining_home(request):
	areas_qs = Area.objects.filter(is_active=True).prefetch_related(
		Prefetch('tables', queryset=DiningTable.objects.filter(is_active=True).order_by('display_order', 'name'))
	).order_by('display_order', 'name')

	tables_qs = DiningTable.objects.filter(is_active=True).select_related('area').order_by('area__display_order', 'display_order', 'name')

	areas_data = []
	for a in areas_qs:
		areas_data.append({
			'id': a.id,
			'name': a.name,
			'area_type': a.area_type or 'Nhà hàng cafe',
			'description': a.description or '',
			'display_order': a.display_order,
			'tables_count': a.tables.filter(is_active=True).count(),
		})

	tables_data = []
	for t in tables_qs:
		tables_data.append({
			'id': t.id,
			'area_id': t.area_id,
			'area_name': t.area.name,
			'name': t.name,
			'code': t.code,
			'capacity': t.capacity,
			'status': t.status,
			'status_display': t.get_status_display(),
			'display_order': t.display_order,
		})

	return render(request, 'dining/home.html', {
		'areas': areas_qs,
		'tables': tables_qs,
		'areas_json': json.dumps(areas_data, ensure_ascii=False),
		'tables_json': json.dumps(tables_data, ensure_ascii=False),
	})


@login_required
def dining_data_api(request):
	"""Trả về toàn bộ dữ liệu khu vực và điểm bán theo JSON."""
	areas_qs = Area.objects.filter(is_active=True).prefetch_related(
		Prefetch('tables', queryset=DiningTable.objects.filter(is_active=True).order_by('display_order', 'name'))
	).order_by('display_order', 'name')

	tables_qs = DiningTable.objects.filter(is_active=True).select_related('area').order_by('area__display_order', 'display_order', 'name')

	areas_data = [
		{
			'id': a.id,
			'name': a.name,
			'area_type': a.area_type or 'Nhà hàng cafe',
			'description': a.description or '',
			'display_order': a.display_order,
			'tables_count': a.tables.filter(is_active=True).count(),
		}
		for a in areas_qs
	]

	tables_data = [
		{
			'id': t.id,
			'area_id': t.area_id,
			'area_name': t.area.name,
			'name': t.name,
			'code': t.code,
			'capacity': t.capacity,
			'status': t.status,
			'status_display': t.get_status_display(),
			'display_order': t.display_order,
		}
		for t in tables_qs
	]

	return JsonResponse({
		'areas': areas_data,
		'tables': tables_data,
	})


@login_required
@require_POST
def dining_save_area(request):
	"""Thêm mới hoặc cập nhật thông tin khu vực."""
	data = request.POST
	if not data and request.body:
		try:
			data = json.loads(request.body)
		except Exception:
			data = {}

	area_id = data.get('id')
	name = (data.get('name') or '').strip()
	area_type = (data.get('area_type') or 'Nhà hàng cafe').strip()
	description = (data.get('description') or '').strip()
	try:
		display_order = int(data.get('display_order', 0))
	except (ValueError, TypeError):
		display_order = 0

	if not name:
		return JsonResponse({'error': 'Vui lòng nhập tên khu vực.'}, status=400)

	if area_id:
		area = get_object_or_404(Area, pk=area_id)
		conflict = Area.objects.filter(name__iexact=name).exclude(pk=area.pk).first()
		if conflict:
			if conflict.is_active:
				return JsonResponse({'error': f'Tên khu vực "{name}" đã tồn tại trong hệ thống.'}, status=400)
			else:
				conflict.name = f'{conflict.name} (cũ-{conflict.pk})'
				conflict.save(update_fields=('name', 'updated_at'))
		area.name = name
		area.area_type = area_type
		area.description = description
		area.display_order = display_order
		area.is_active = True
		area.save()
		msg = f'Đã cập nhật khu vực "{name}".'
	else:
		existing = Area.objects.filter(name__iexact=name).first()
		if existing:
			if existing.is_active:
				return JsonResponse({'error': f'Tên khu vực "{name}" đã tồn tại trong hệ thống.'}, status=400)
			else:
				area = existing
				area.area_type = area_type
				area.description = description
				area.display_order = display_order
				area.is_active = True
				area.save()
				msg = f'Đã kích hoạt lại và cập nhật khu vực "{name}".'
		else:
			area = Area.objects.create(
				name=name,
				area_type=area_type,
				description=description,
				display_order=display_order,
				is_active=True,
			)
			msg = f'Đã thêm khu vực mới "{name}".'

	return JsonResponse({
		'success': True,
		'message': msg,
		'area': {
			'id': area.id,
			'name': area.name,
			'area_type': area.area_type,
			'description': area.description,
			'display_order': area.display_order,
			'tables_count': area.tables.filter(is_active=True).count(),
		}
	})


@login_required
@require_POST
def dining_delete_area(request, pk):
	"""Ngừng sử dụng hoặc xóa khu vực và các điểm bán trực thuộc."""
	area = get_object_or_404(Area, pk=pk)
	name = area.name
	with transaction.atomic():
		for t in area.tables.all():
			if not t.orders.exists():
				t.delete()
			else:
				t.is_active = False
				t.name = f'{t.name} (đã xóa-{t.pk})'
				t.save(update_fields=('is_active', 'name', 'updated_at'))

		if not area.tables.exists():
			area.delete()
		else:
			area.is_active = False
			area.name = f'{area.name} (đã xóa-{area.pk})'
			area.save(update_fields=('is_active', 'name', 'updated_at'))

	return JsonResponse({
		'success': True,
		'message': f'Đã xóa/ngừng sử dụng khu vực "{name}".',
		'id': pk,
	})


@login_required
@require_POST
def dining_save_table(request):
	"""Thêm mới hoặc cập nhật điểm bán / bàn."""
	data = request.POST
	if not data and request.body:
		try:
			data = json.loads(request.body)
		except Exception:
			data = {}

	table_id = data.get('id')
	area_id = data.get('area_id')
	name = (data.get('name') or '').strip()
	code = (data.get('code') or '').strip()
	status = (data.get('status') or DiningTable.Status.AVAILABLE).strip()
	try:
		capacity = int(data.get('capacity', 4))
	except (ValueError, TypeError):
		capacity = 4
	try:
		display_order = int(data.get('display_order', 0))
	except (ValueError, TypeError):
		display_order = 0

	if not area_id:
		return JsonResponse({'error': 'Vui lòng chọn khu vực trực thuộc.'}, status=400)
	area = get_object_or_404(Area, pk=area_id)

	if not name:
		return JsonResponse({'error': 'Vui lòng nhập tên điểm bán.'}, status=400)

	if not code:
		code = f'{area.id:02d}-{name}'

	if table_id:
		table = get_object_or_404(DiningTable, pk=table_id)
		conflict = DiningTable.objects.filter(area=area, name__iexact=name).exclude(pk=table.pk).first()
		if conflict:
			if conflict.is_active:
				return JsonResponse({'error': f'Điểm bán "{name}" đã có trong khu vực "{area.name}".'}, status=400)
			else:
				if not conflict.orders.exists():
					conflict.delete()
				else:
					conflict.name = f'{conflict.name} (cũ-{conflict.pk})'
					conflict.save(update_fields=('name', 'updated_at'))

		table.area = area
		table.name = name
		table.code = code
		table.capacity = capacity
		table.status = status
		table.display_order = display_order
		table.is_active = True
		table.save()
		msg = f'Đã cập nhật điểm bán "{name}".'
	else:
		existing = DiningTable.objects.filter(area=area, name__iexact=name).first()
		if existing:
			if existing.is_active:
				return JsonResponse({'error': f'Điểm bán "{name}" đã có trong khu vực "{area.name}".'}, status=400)
			else:
				table = existing
				table.area = area
				table.code = code
				table.capacity = capacity
				table.status = status
				table.display_order = display_order
				table.is_active = True
				table.save()
				msg = f'Đã kích hoạt lại và cập nhật điểm bán "{name}".'
		else:
			table = DiningTable.objects.create(
				area=area,
				name=name,
				code=code,
				capacity=capacity,
				status=status,
				display_order=display_order,
				is_active=True,
			)
			msg = f'Đã thêm điểm bán "{name}" vào khu vực "{area.name}".'

	return JsonResponse({
		'success': True,
		'message': msg,
		'table': {
			'id': table.id,
			'area_id': table.area_id,
			'area_name': table.area.name,
			'name': table.name,
			'code': table.code,
			'capacity': table.capacity,
			'status': table.status,
			'status_display': table.get_status_display(),
			'display_order': table.display_order,
		}
	})


@login_required
@require_POST
def dining_delete_table(request, pk):
	"""Xóa hoặc ngừng sử dụng điểm bán / bàn."""
	table = get_object_or_404(DiningTable, pk=pk)
	name = table.name
	if not table.orders.exists():
		table.delete()
	else:
		table.is_active = False
		table.name = f'{table.name} (đã xóa-{table.pk})'
		table.save(update_fields=('is_active', 'name', 'updated_at'))

	return JsonResponse({
		'success': True,
		'message': f'Đã xóa điểm bán "{name}".',
		'id': pk,
	})


@login_required
def dining_export_excel(request):
	"""Xuất danh sách khu vực và điểm bán ra file Excel (CSV chuẩn UTF-8)."""
	response = HttpResponse(content_type='text/csv; charset=utf-8-sig')
	response['Content-Disposition'] = 'attachment; filename="mixfood_khu_vuc_diem_ban.csv"'

	writer = csv.writer(response)
	writer.writerow([
		'STT', 'Tên khu vực', 'Loại hình', 'Tên điểm bán', 'Mã điểm bán', 'Số chỗ', 'Trạng thái'
	])

	areas = Area.objects.filter(is_active=True).prefetch_related(
		Prefetch('tables', queryset=DiningTable.objects.filter(is_active=True).order_by('display_order', 'name'))
	).order_by('display_order', 'name')

	stt = 1
	for area in areas:
		tables = list(area.tables.all())
		if tables:
			for table in tables:
				writer.writerow([
					stt,
					area.name,
					area.area_type or 'Nhà hàng cafe',
					table.name,
					table.code,
					table.capacity,
					table.get_status_display(),
				])
				stt += 1
		else:
			writer.writerow([
				stt,
				area.name,
				area.area_type or 'Nhà hàng cafe',
				'',
				'',
				'',
				'',
			])
			stt += 1

	return response


@login_required
def dining_import_excel(request):
	"""Nhập dữ liệu khu vực và điểm bán từ file Excel (CSV) hoặc văn bản."""
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
		return JsonResponse({'error': 'Vui lòng tải lên file CSV hoặc dán dữ liệu Excel.'}, status=400)

	if not lines:
		return JsonResponse({'error': 'Dữ liệu nhập rỗng.'}, status=400)

	sample = lines[0]
	delimiter = '\t' if '\t' in sample else (',' if ',' in sample else ';')
	reader = csv.reader(lines, delimiter=delimiter)

	areas_created = 0
	tables_created = 0
	header_skipped = False

	for row in reader:
		if not row or not any(row):
			continue

		row_str = ' '.join(row).lower()
		if not header_skipped and ('khu vực' in row_str or 'điểm bán' in row_str or 'tên khu vực' in row_str):
			header_skipped = True
			continue

		# Clean cells
		cells = [c.strip() for c in row]
		# Look for area name & table name
		# Formats:
		# Format A: [STT, Tên khu vực, Loại hình, Tên điểm bán, Mã điểm bán, Số chỗ]
		# Format B: [Tên khu vực, Loại hình, Tên điểm bán, Mã điểm bán]
		# Format C: [Tên khu vực, Tên điểm bán]
		area_name = ''
		area_type = 'Nhà hàng cafe'
		table_name = ''
		table_code = ''
		capacity = 4

		if len(cells) >= 4 and cells[0].isdigit():
			# [STT, Tên khu vực, Loại hình, Tên điểm bán, ...]
			area_name = cells[1]
			area_type = cells[2] or 'Nhà hàng cafe'
			table_name = cells[3] if len(cells) > 3 else ''
			table_code = cells[4] if len(cells) > 4 else ''
			if len(cells) > 5 and cells[5].isdigit():
				capacity = int(cells[5])
		elif len(cells) >= 3:
			# [Tên khu vực, Loại hình, Tên điểm bán, ...]
			area_name = cells[0]
			area_type = cells[1] or 'Nhà hàng cafe'
			table_name = cells[2] if len(cells) > 2 else ''
			table_code = cells[3] if len(cells) > 3 else ''
			if len(cells) > 4 and cells[4].isdigit():
				capacity = int(cells[4])
		elif len(cells) == 2:
			area_name = cells[0]
			table_name = cells[1]

		if not area_name:
			continue

		area, a_created = Area.objects.get_or_create(
			name=area_name,
			defaults={'area_type': area_type, 'is_active': True}
		)
		if a_created:
			areas_created += 1
		elif area_type and area.area_type != area_type:
			area.area_type = area_type
			area.save(update_fields=('area_type', 'updated_at'))

		if table_name:
			code = table_code or f'{area.id:02d}-{table_name}'
			table, t_created = DiningTable.objects.get_or_create(
				area=area,
				name=table_name,
				defaults={
					'code': code,
					'capacity': capacity,
					'is_active': True,
					'status': DiningTable.Status.AVAILABLE,
				}
			)
			if t_created:
				tables_created += 1
			elif not table.is_active:
				table.is_active = True
				table.save(update_fields=('is_active', 'updated_at'))

	return JsonResponse({
		'success': True,
		'areas_created': areas_created,
		'tables_created': tables_created,
		'message': f'Nhập dữ liệu thành công! Đã xử lý {areas_created} khu vực mới và {tables_created} điểm bán mới.',
	})


# ==================== LEGACY CRUD VIEWS ====================

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
