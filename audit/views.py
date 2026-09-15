from django.contrib.auth.decorators import login_required
from django.db.models import Q
from django.shortcuts import render

from accounts.decorators import role_required
from .models import ActivityLog


@login_required
@role_required('Owner', 'Manager')
def activity_list(request):
    query = request.GET.get('q', '').strip()
    action = request.GET.get('action', '').strip()
    logs = ActivityLog.objects.select_related('actor').all()
    if query:
        logs = logs.filter(Q(description__icontains=query) | Q(path__icontains=query) | Q(actor__username__icontains=query))
    if action:
        logs = logs.filter(action=action)
    return render(request, 'audit/activity_list.html', {
        'logs': logs[:300],
        'query': query,
        'selected_action': action,
        'actions': ActivityLog.Action.choices,
    })
