from django.urls import path

from . import views

app_name = 'dining'

urlpatterns = [
    path('', views.dining_home, name='home'),
    path('areas/add/', views.area_create, name='area_create'),
    path('areas/<int:pk>/edit/', views.area_update, name='area_update'),
    path('areas/<int:pk>/delete/', views.area_delete, name='area_delete'),
    path('tables/add/', views.table_create, name='table_create'),
    path('tables/<int:pk>/edit/', views.table_update, name='table_update'),
    path('tables/<int:pk>/delete/', views.table_delete, name='table_delete'),
]