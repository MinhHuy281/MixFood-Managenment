# File này chịu trách nhiệm định nghĩa các biểu mẫu (ModelForm) thêm/sửa Khu vực phục vụ và Bàn ăn.
from django import forms

from .models import Area, DiningTable


class AreaForm(forms.ModelForm):
    # Class này dùng để tạo và xác thực biểu mẫu thêm/sửa Khu vực phục vụ (Area).
    class Meta:
        # Class này dùng để khai báo metadata cấu hình (tên hiển thị, sắp xếp mặc định, ràng buộc dữ liệu) cho model/form chứa nó.
        model = Area
        fields = ('name', 'area_type', 'description', 'display_order', 'is_active')
        widgets = {'description': forms.Textarea(attrs={'rows': 3})}


class DiningTableForm(forms.ModelForm):
    # Class này dùng để tạo và xác thực biểu mẫu thêm/sửa Bàn ăn (DiningTable).
    class Meta:
        # Class này dùng để khai báo metadata cấu hình (tên hiển thị, sắp xếp mặc định, ràng buộc dữ liệu) cho model/form chứa nó.
        model = DiningTable
        fields = ('area', 'name', 'code', 'capacity', 'status', 'display_order', 'is_active')
