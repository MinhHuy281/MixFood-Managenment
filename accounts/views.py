from django.contrib.auth.views import LoginView, LogoutView


class AccountLoginView(LoginView):
	template_name = 'accounts/login.html'
	redirect_authenticated_user = True


class AccountLogoutView(LogoutView):
	next_page = 'accounts:login'
