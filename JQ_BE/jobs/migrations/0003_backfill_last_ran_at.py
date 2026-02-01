from django.db import migrations
from django.db.models import F


def backfill_last_ran(apps, schema_editor):
    Job = apps.get_model("jobs", "Job")
    Job.objects.filter(last_ran_at__isnull=True).update(last_ran_at=F("updated_at"))


class Migration(migrations.Migration):
    dependencies = [
        ("jobs", "0002_job_last_ran_at"),
    ]

    operations = [
        migrations.RunPython(backfill_last_ran, migrations.RunPython.noop),
    ]
