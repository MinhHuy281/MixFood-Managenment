from django.contrib.auth.models import Group, Permission
from django.contrib.contenttypes.models import ContentType
from django.core.management.base import BaseCommand


ROLE_NAMES = ('Owner', 'Manager', 'Sales', 'Warehouse')

ROLE_RULES = {
    'Manager': {'catalog': ('category', 'product', 'ingredient'), 'dining': ('area', 'diningtable'), 'sales': ('order', 'orderitem', 'invoice', 'payment'), 'inventory': ('recipe', 'recipeitem', 'stockreceipt', 'stockreceiptitem', 'stocktransaction'), 'audit': ('activitylog',)},
    'Sales': {'catalog': ('category', 'product'), 'dining': ('area', 'diningtable'), 'sales': ('order', 'orderitem', 'invoice', 'payment')},
    'Warehouse': {'catalog': ('ingredient', 'product'), 'inventory': ('recipe', 'recipeitem', 'stockreceipt', 'stockreceiptitem', 'stocktransaction')},
}


class Command(BaseCommand):
    help = 'Create the default MixFood permission groups.'

    def handle(self, *args, **options):
        for role_name in ROLE_NAMES:
            group, _ = Group.objects.get_or_create(name=role_name)
            if role_name == 'Owner':
                group.permissions.set(Permission.objects.all())
                continue
            permission_ids = []
            for app_label, model_names in ROLE_RULES.get(role_name, {}).items():
                content_types = ContentType.objects.filter(app_label=app_label, model__in=model_names)
                permission_ids.extend(Permission.objects.filter(content_type__in=content_types).values_list('id', flat=True))
            group.permissions.set(permission_ids)
        self.stdout.write(self.style.SUCCESS('Default role groups are ready.'))