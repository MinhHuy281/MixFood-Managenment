from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand


ROLE_NAMES = ('Owner', 'Manager', 'Sales', 'Warehouse')


class Command(BaseCommand):
    help = 'Create the default MixFood permission groups.'

    def handle(self, *args, **options):
        for role_name in ROLE_NAMES:
            Group.objects.get_or_create(name=role_name)
        self.stdout.write(self.style.SUCCESS('Default role groups are ready.'))