from django.contrib.auth.views import LoginView, LogoutView, PasswordChangeView
from django.urls import reverse_lazy


class AccountLoginView(LoginView):
	template_name = 'accounts/login.html'
	redirect_authenticated_user = True


class AccountLogoutView(LogoutView):
	next_page = 'accounts:login'


class AccountPasswordChangeView(PasswordChangeView):
	template_name = 'accounts/password_change.html'
	success_url = reverse_lazy('dashboard:home')
