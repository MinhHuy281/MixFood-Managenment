from django import forms

from .models import Category, Ingredient, Product


class CategoryForm(forms.ModelForm):
    class Meta:
        model = Category
        fields = ('name', 'description', 'color', 'display_order', 'is_active')
        widgets = {'description': forms.Textarea(attrs={'rows': 3})}


class ProductForm(forms.ModelForm):
    class Meta:
        model = Product
        fields = ('category', 'code', 'name', 'description', 'unit', 'price', 'price_2', 'price_3', 'cost_price', 'product_type', 'is_available', 'is_active')
        widgets = {'description': forms.Textarea(attrs={'rows': 3})}


class IngredientForm(forms.ModelForm):
    class Meta:
        model = Ingredient
        fields = ('code', 'name', 'unit', 'current_stock', 'minimum_stock', 'average_cost', 'supplier', 'is_active')