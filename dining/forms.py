from django import forms

from .models import Area, DiningTable


class AreaForm(forms.ModelForm):
    class Meta:
        model = Area
        fields = ('name', 'description', 'display_order', 'is_active')
        widgets = {'description': forms.Textarea(attrs={'rows': 3})}


class DiningTableForm(forms.ModelForm):
    class Meta:
        model = DiningTable
        fields = ('area', 'name', 'code', 'capacity', 'status', 'display_order', 'is_active')