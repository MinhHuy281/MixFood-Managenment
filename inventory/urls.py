from django.urls import path

from . import views

app_name = 'inventory'

urlpatterns = [
    path('', views.inventory_home, name='home'),
    path('recipes/', views.recipe_list, name='recipes'),
    path('recipes/api/data/', views.recipe_data_api, name='recipe_data_api'),
    path('recipes/api/save-item/', views.recipe_save_item_api, name='recipe_save_item_api'),
    path('recipes/api/delete-item/<int:pk>/', views.recipe_delete_item_api, name='recipe_delete_item_api'),
    path('recipes/api/delete-recipe/<int:product_id>/', views.recipe_delete_recipe_api, name='recipe_delete_recipe_api'),
    path('recipes/export/', views.recipe_export_excel, name='recipe_export_excel'),
    path('recipes/import/', views.recipe_import_excel, name='recipe_import_excel'),
]