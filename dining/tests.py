from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from .models import Area, DiningTable


class DiningTests(TestCase):
	def setUp(self):
		self.user = get_user_model().objects.create_user('dining-test', password='test-password')
		self.client.force_login(self.user)

	def test_area_and_table_are_available_in_management_screen(self):
		area = Area.objects.create(name='Trong nhà')
		DiningTable.objects.create(area=area, name='1', code='TN-01')
		response = self.client.get(reverse('dining:home'))
		self.assertEqual(response.status_code, 200)
		self.assertContains(response, 'Trong nhà')
		self.assertContains(response, 'TN-01')

	def test_table_creation_uses_real_form(self):
		area = Area.objects.create(name='Tầng 2')
		response = self.client.post(reverse('dining:table_create'), {
			'area': area.pk,
			'name': '10',
			'code': 'T2-10',
			'capacity': 4,
			'status': DiningTable.Status.AVAILABLE,
			'display_order': 10,
			'is_active': 'on',
		})
		self.assertRedirects(response, reverse('dining:home'))
		self.assertTrue(DiningTable.objects.filter(code='T2-10').exists())

	def test_dining_data_api(self):
		area = Area.objects.create(name='Ngoài trời', area_type='Sân vườn')
		DiningTable.objects.create(area=area, name='NT-1', code='NT-01')
		response = self.client.get(reverse('dining:data_api'))
		self.assertEqual(response.status_code, 200)
		data = response.json()
		self.assertTrue(any(a['name'] == 'Ngoài trời' for a in data['areas']))
		self.assertTrue(any(t['code'] == 'NT-01' for t in data['tables']))

	def test_dining_save_and_delete_area_api(self):
		# Create area via API
		response = self.client.post(reverse('dining:save_area'), {
			'name': 'Phòng VIP 1',
			'area_type': 'Phòng VIP',
			'display_order': 5,
		})
		self.assertEqual(response.status_code, 200)
		data = response.json()
		self.assertTrue(data['success'])
		area_id = data['area']['id']
		self.assertTrue(Area.objects.filter(id=area_id, name='Phòng VIP 1').exists())

		# Delete area via API
		del_resp = self.client.post(reverse('dining:delete_area', kwargs={'pk': area_id}))
		self.assertEqual(del_resp.status_code, 200)
		self.assertFalse(Area.objects.filter(id=area_id, is_active=True).exists())

	def test_dining_save_and_delete_table_api(self):
		area = Area.objects.create(name='Khu Bar')
		# Create table
		response = self.client.post(reverse('dining:save_table'), {
			'area_id': area.id,
			'name': 'Bar 01',
			'code': 'BAR-01',
			'capacity': 2,
		})
		self.assertEqual(response.status_code, 200)
		data = response.json()
		self.assertTrue(data['success'])
		table_id = data['table']['id']
		self.assertTrue(DiningTable.objects.filter(id=table_id, name='Bar 01').exists())

		# Delete table
		del_resp = self.client.post(reverse('dining:delete_table', kwargs={'pk': table_id}))
		self.assertEqual(del_resp.status_code, 200)
		self.assertFalse(DiningTable.objects.filter(id=table_id, is_active=True).exists())

	def test_dining_export_and_import_excel(self):
		# Export
		area = Area.objects.create(name='Tầng Thượng')
		DiningTable.objects.create(area=area, name='TT-01', code='TT-01')
		exp_resp = self.client.get(reverse('dining:export_excel'))
		self.assertEqual(exp_resp.status_code, 200)
		self.assertIn('text/csv', exp_resp['Content-Type'])
		content = exp_resp.content.decode('utf-8-sig')
		self.assertIn('Tầng Thượng', content)
		self.assertIn('TT-01', content)

		# Import
		csv_data = "STT\tTên khu vực\tLoại hình\tTên điểm bán\tMã điểm bán\tSố chỗ\n1\tKhu A\tNhà hàng cafe\tBàn A1\tA-01\t4\n"
		imp_resp = self.client.post(reverse('dining:import_excel'), {'csv_text': csv_data})
		self.assertEqual(imp_resp.status_code, 200)
		imp_data = imp_resp.json()
		self.assertTrue(imp_data['success'])
		self.assertTrue(Area.objects.filter(name='Khu A').exists())
		self.assertTrue(DiningTable.objects.filter(name='Bàn A1').exists())
