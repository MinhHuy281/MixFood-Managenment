from django.contrib.auth.views import LoginView, LogoutView, PasswordChangeView
from django.urls import reverse_lazy

from audit.models import ActivityLog, log_activity


class AccountLoginView(LoginView):
	template_name = 'accounts/login.html'
	redirect_authenticated_user = True

	def form_valid(self, form):
		response = super().form_valid(form)
		user = self.request.user
		if user and user.is_authenticated:
			log_activity(
				actor=user,
				action=ActivityLog.Action.LOGIN,
				description=f'Đăng nhập nhận ca ({user.get_full_name() or user.username})',
				request=self.request,
			)
		return response


class AccountLogoutView(LogoutView):
	next_page = 'accounts:login'

	def dispatch(self, request, *args, **kwargs):
		if getattr(request, 'user', None) and request.user.is_authenticated and request.method == 'POST':
			user = request.user
			log_activity(
				actor=user,
				action=ActivityLog.Action.SYSTEM,
				description=f'Đăng xuất / Đổi ca ({user.get_full_name() or user.username})',
				request=request,
			)
		return super().dispatch(request, *args, **kwargs)


class AccountPasswordChangeView(PasswordChangeView):
	template_name = 'accounts/password_change.html'
	success_url = reverse_lazy('dashboard:home')
