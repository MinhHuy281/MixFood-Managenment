from django.urls import path

from . import views

app_name = 'catalog'

urlpatterns = [
    path('', views.catalog_home, name='home'),
    path('menu/', views.menu_admin, name='menu_admin'),
    path('menu/api/dishes/', views.menu_dishes_api, name='menu_dishes_api'),
    path('menu/api/save-dish/', views.menu_save_dish, name='menu_save_dish'),
    path('menu/api/delete-dish/<int:pk>/', views.menu_delete_dish, name='menu_delete_dish'),
    path('menu/api/save-category/', views.menu_save_category, name='menu_save_category'),
    path('menu/api/delete-category/<int:pk>/', views.menu_delete_category, name='menu_delete_category'),
    path('menu/export/', views.menu_export_excel, name='menu_export_excel'),
    path('menu/import/', views.menu_import_excel, name='menu_import_excel'),
    path('categories/', views.category_list, name='categories'),
    path('categories/add/', views.category_create, name='category_create'),
    path('categories/<int:pk>/edit/', views.category_update, name='category_update'),
    path('categories/<int:pk>/delete/', views.category_delete, name='category_delete'),
    path('products/', views.product_list, name='products'),
    path('products/add/', views.product_create, name='product_create'),
    path('products/<int:pk>/edit/', views.product_update, name='product_update'),
    path('products/<int:pk>/delete/', views.product_delete, name='product_delete'),
    path('ingredients/', views.ingredient_list, name='ingredients'),
    path('ingredients/add/', views.ingredient_create, name='ingredient_create'),
    path('ingredients/<int:pk>/edit/', views.ingredient_update, name='ingredient_update'),
    path('ingredients/<int:pk>/delete/', views.ingredient_delete, name='ingredient_delete'),
]