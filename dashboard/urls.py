from django.urls import path

from .views import home, reports

app_name = 'dashboard'

urlpatterns = [
    path('', home, name='home'),
    path('reports/', reports, name='reports'),
]