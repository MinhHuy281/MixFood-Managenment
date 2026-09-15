from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.urls import reverse

from .models import ActivityLog


class ActivityLogTests(TestCase):
	def test_authenticated_post_is_logged(self):
		user = get_user_model().objects.create_user('audit-test', password='test-password')
		self.client.force_login(user)
		response = self.client.post(reverse('catalog:category_create'), {'name': 'Danh mục audit', 'color': '#fff', 'display_order': 1, 'is_active': 'on'})
		self.assertEqual(response.status_code, 302)
		log = ActivityLog.objects.filter(actor=user, path='/catalog/categories/add/').first()
		self.assertIsNotNone(log)
		self.assertEqual(log.method, 'POST')

	def test_activity_page_requires_login(self):
		response = self.client.get(reverse('audit:activity'))
		self.assertRedirects(response, '/accounts/login/?next=/audit/')

	def test_activity_page_requires_manager_role(self):
		user = get_user_model().objects.create_user('audit-sales', password='test-password')
		self.client.force_login(user)
		self.assertEqual(self.client.get(reverse('audit:activity')).status_code, 403)
		user.groups.add(Group.objects.create(name='Manager'))
		self.assertEqual(self.client.get(reverse('audit:activity')).status_code, 200)
from django.test import TestCase

# Create your tests here.
