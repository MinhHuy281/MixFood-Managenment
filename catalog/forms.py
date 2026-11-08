# File này chịu trách nhiệm định nghĩa các biểu mẫu (ModelForm) xác thực dữ liệu cho Nhóm danh mục, Món ăn và Mặt hàng nguyên liệu.
from django import forms

from .models import Category, Ingredient, Product


class CategoryForm(forms.ModelForm):
    # Class này dùng để tạo và xác thực biểu mẫu thêm/sửa Nhóm danh mục thực đơn (Category).
    class Meta:
        # Class này dùng để khai báo metadata cấu hình (tên hiển thị, sắp xếp mặc định, ràng buộc dữ liệu) cho model/form chứa nó.
        model = Category
        fields = ('name', 'description', 'color', 'display_order', 'is_active')
        widgets = {'description': forms.Textarea(attrs={'rows': 3})}


class ProductForm(forms.ModelForm):
    # Class này dùng để tạo và xác thực biểu mẫu thêm/sửa Món ăn (Product).
    class Meta:
        # Class này dùng để khai báo metadata cấu hình (tên hiển thị, sắp xếp mặc định, ràng buộc dữ liệu) cho model/form chứa nó.
        model = Product
        fields = ('category', 'subgroup', 'code', 'name', 'description', 'unit', 'price', 'price_2', 'price_3', 'cost_price', 'product_type', 'is_available', 'is_active')
        widgets = {'description': forms.Textarea(attrs={'rows': 3})}

class IngredientForm(forms.ModelForm):
    # Class này dùng để tạo và xác thực biểu mẫu thêm/sửa Mặt hàng Nguyên liệu kho (Ingredient).
    class Meta:
        # Class này dùng để khai báo metadata cấu hình (tên hiển thị, sắp xếp mặc định, ràng buộc dữ liệu) cho model/form chứa nó.
        model = Ingredient
        fields = ('group', 'code', 'name', 'unit', 'current_stock', 'minimum_stock', 'average_cost', 'supplier', 'is_active')
