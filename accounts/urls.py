from django.urls import path

from .views import AccountLoginView, AccountLogoutView, AccountPasswordChangeView

app_name = 'accounts'

urlpatterns = [
    path('login/', AccountLoginView.as_view(), name='login'),
    path('logout/', AccountLogoutView.as_view(), name='logout'),
    path('change-password/', AccountPasswordChangeView.as_view(), name='change_password'),
]
