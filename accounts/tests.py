from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse


class LogoutTests(TestCase):
    def test_logout_redirects_to_login_without_deleting_user_data(self):
        user = get_user_model().objects.create_user(username='cashier', password='safe-password')
        self.client.force_login(user)

        response = self.client.post(reverse('accounts:logout'))

        self.assertRedirects(response, reverse('accounts:login'))
        self.assertFalse('_auth_user_id' in self.client.session)
        self.assertTrue(get_user_model().objects.filter(pk=user.pk).exists())
