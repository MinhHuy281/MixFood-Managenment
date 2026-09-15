from django.urls import path

from .views import activity_list

app_name = 'audit'

urlpatterns = [
    path('', activity_list, name='activity'),
]