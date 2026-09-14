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
from django.test import TestCase

# Create your tests here.
