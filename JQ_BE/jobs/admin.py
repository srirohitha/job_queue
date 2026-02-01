from django.contrib import admin

from .models import Job


@admin.register(Job)
class JobAdmin(admin.ModelAdmin):
    list_display = ("id", "label", "status", "stage", "tenant", "created_at")
    list_filter = ("status", "stage", "tenant")
    search_fields = ("id", "label", "tenant__username")
