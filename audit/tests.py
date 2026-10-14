from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.urls import reverse

from catalog.models import Category, Product
from .models import ActivityLog, log_activity


class ActivityLogTests(TestCase):
	def setUp(self):
		self.user = get_user_model().objects.create_user('admin-user', password='password123')
		self.manager_group = Group.objects.create(name='Manager')
		self.user.groups.add(self.manager_group)

	def test_authenticated_post_is_logged(self):
		self.client.force_login(self.user)
		response = self.client.post(reverse('catalog:category_create'), {
			'name': 'Danh mục audit',
			'color': '#fff',
			'display_order': 1,
			'is_active': 'on'
		})
		self.assertEqual(response.status_code, 302)
		log = ActivityLog.objects.filter(actor=self.user, path='/catalog/categories/add/').first()
		self.assertIsNotNone(log)
		self.assertEqual(log.method, 'POST')

	def test_activity_page_requires_login(self):
		self.client.logout()
		response = self.client.get(reverse('audit:activity'))
		self.assertRedirects(response, '/accounts/login/?next=/audit/')

	def test_activity_page_requires_manager_role(self):
		staff = get_user_model().objects.create_user('staff-only', password='password123')
		self.client.force_login(staff)
		self.assertEqual(self.client.get(reverse('audit:activity')).status_code, 403)
		staff.groups.add(self.manager_group)
		self.assertEqual(self.client.get(reverse('audit:activity')).status_code, 200)

	def test_log_activity_helper_and_properties(self):
		log = log_activity(
			actor=self.user,
			action=ActivityLog.Action.MENU_UPDATE,
			description='Thêm món Trà Đào',
			reason='Món mới mùa hè',
		)
		self.assertEqual(log.action, ActivityLog.Action.MENU_UPDATE)
		self.assertEqual(log.reason, 'Món mới mùa hè')
		self.assertEqual(log.display_actor, 'admin-user')
		self.assertIn('Lý do: Món mới mùa hè', log.full_detail)
		self.assertEqual(log.action_color, '#0284c7')

	def test_activity_api_filtering(self):
		self.client.force_login(self.user)
		log_activity(actor=self.user, action=ActivityLog.Action.RETURN_ITEM, description='Trả món 1', reason='Khách đổi ý')
		log_activity(actor=self.user, action=ActivityLog.Action.MENU_UPDATE, description='Sửa giá', reason='Giá tăng')

		# All logs
		res = self.client.get(reverse('audit:activity_api'))
		self.assertEqual(res.status_code, 200)
		data = res.json()
		self.assertEqual(data['status'], 'success')
		self.assertGreaterEqual(len(data['logs']), 2)

		# Filter by action
		res_filtered = self.client.get(reverse('audit:activity_api') + '?action=return_item')
		data_filtered = res_filtered.json()
		self.assertTrue(all(item['action_code'] == 'return_item' for item in data_filtered['logs']))

		# Order log filter
		res_order_log = self.client.get(reverse('audit:activity_api') + '?order_log=1')
		data_order_log = res_order_log.json()
		self.assertTrue(all(item['action_code'] in ['return_item', 'cancel_item', 'edit_price', 'delete_order'] for item in data_order_log['logs']))

	def test_activity_export_excel_csv(self):
		self.client.force_login(self.user)
		log_activity(actor=self.user, action=ActivityLog.Action.SHIFT_CLOSE, description='Kết ca chiều', reason='Hết giờ làm')

		res = self.client.get(reverse('audit:activity_export_excel'))
		self.assertEqual(res.status_code, 200)
		self.assertEqual(res['Content-Type'], 'text/csv; charset=utf-8-sig')
		content = res.content.decode('utf-8-sig')
		self.assertIn('Thời điểm', content)
		self.assertIn('Hoạt động', content)
		self.assertIn('Chi tiết', content)
		self.assertIn('Thực hiện', content)
		self.assertIn('Kết ca chiều', content)
		self.assertIn('Hết giờ làm', content)

	def test_dish_add_edit_delete_logs_reason(self):
		self.client.force_login(self.user)
		cat = Category.objects.create(name='Trà Sữa', color='#f59e0b', display_order=1)

		# 1. Thêm món mới kèm lý do
		save_res = self.client.post(
			reverse('catalog:menu_save_dish'),
			data={
				'category_id': cat.id,
				'code': 'TS01',
				'name': 'Trà sữa trân châu',
				'unit': 'Ly',
				'price': '30000',
				'reason': 'Khai trương món mới',
			},
			content_type='application/json'
		)
		self.assertEqual(save_res.status_code, 200)
		dish_id = save_res.json()['dish']['id']

		add_log = ActivityLog.objects.filter(object_id=dish_id, action=ActivityLog.Action.MENU_UPDATE).first()
		self.assertIsNotNone(add_log)
		self.assertEqual(add_log.reason, 'Khai trương món mới')
		self.assertIn('Thêm món mới "Trà sữa trân châu"', add_log.description)

		# 2. Sửa món kèm lý do
		edit_res = self.client.post(
			reverse('catalog:menu_save_dish'),
			data={
				'dish_id': dish_id,
				'category_id': cat.id,
				'code': 'TS01',
				'name': 'Trà sữa trân châu đen',
				'unit': 'Ly',
				'price': '35000',
				'reason': 'Thêm topping trân châu đường đen',
			},
			content_type='application/json'
		)
		self.assertEqual(edit_res.status_code, 200)

		edit_log = ActivityLog.objects.filter(object_id=dish_id, reason='Thêm topping trân châu đường đen').first()
		self.assertIsNotNone(edit_log)
		self.assertIn('đơn giá từ 30.000 đ thành 35.000 đ', edit_log.description)

		# 3. Xóa món kèm lý do
		del_res = self.client.post(
			reverse('catalog:menu_delete_dish', kwargs={'pk': dish_id}),
			data={'reason': 'Hết vụ trân châu'},
			content_type='application/json'
		)
		self.assertEqual(del_res.status_code, 200)

		del_log = ActivityLog.objects.filter(object_id=dish_id, reason='Hết vụ trân châu').first()
		self.assertIsNotNone(del_log)
		self.assertIn('Xóa món "Trà sữa trân châu đen"', del_log.description)
