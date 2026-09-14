from django.core.management.base import BaseCommand

from catalog.models import Category, Product
from dining.models import Area, DiningTable


class Command(BaseCommand):
    help = 'Tạo dữ liệu demo danh mục, món ăn, khu vực và bàn cho môi trường phát triển.'

    def handle(self, *args, **options):
        categories = {
            'Khai vị': '#f5c92c',
            'Pad Thai': '#ef962f',
            'Tom Yum': '#d36a85',
            'Đồ uống': '#2bb7ae',
        }
        category_objects = {}
        for order, (name, color) in enumerate(categories.items()):
            category_objects[name], _ = Category.objects.update_or_create(
                name=name,
                defaults={'color': color, 'display_order': order, 'is_active': True},
            )

        products = [
            ('PT-BO', 'Pad Thai bò', 'Pad Thai', 85000),
            ('PT-GA', 'Pad Thai gà', 'Pad Thai', 75000),
            ('PT-TOM', 'Pad Thai tôm', 'Pad Thai', 95000),
            ('TY-TOM', 'Tom Yum tôm', 'Tom Yum', 120000),
            ('KHAI-01', 'Phồng tôm', 'Khai vị', 15000),
            ('NUOC-01', 'Trà tắc', 'Đồ uống', 17000),
        ]
        for code, name, category_name, price in products:
            Product.objects.update_or_create(
                code=code,
                defaults={
                    'name': name,
                    'category': category_objects[category_name],
                    'price': price,
                    'unit': 'Phần' if category_name != 'Đồ uống' else 'Bình',
                    'is_available': True,
                    'is_active': True,
                },
            )

        areas = {'Trong nhà': 5, 'Tầng 2': 14, 'Ngoài trời': 4, 'Mang về': 5}
        for area_order, (area_name, table_count) in enumerate(areas.items()):
            area, _ = Area.objects.update_or_create(
                name=area_name,
                defaults={'display_order': area_order, 'is_active': True},
            )
            for table_number in range(1, table_count + 1):
                name = f'V{table_number}' if area_name == 'Mang về' else str(table_number)
                DiningTable.objects.update_or_create(
                    area=area,
                    name=name,
                    defaults={'code': f'{area_order + 1:02d}-{table_number:02d}', 'display_order': table_number, 'is_active': True},
                )

        self.stdout.write(self.style.SUCCESS('Đã tạo/cập nhật dữ liệu demo cho catalog và dining.'))