from django.urls import path

from .views import activity_list, activity_api, activity_export_excel

app_name = 'audit'

urlpatterns = [
    path('', activity_list, name='activity'),
    path('api/logs/', activity_api, name='activity_api'),
    path('export/', activity_export_excel, name='activity_export_excel'),
]