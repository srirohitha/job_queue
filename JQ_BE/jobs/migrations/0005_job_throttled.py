# Generated migration: THROTTLED status support (next_run_at, throttle_count)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("jobs", "0004_jobtrigger"),
    ]

    operations = [
        migrations.AddField(
            model_name="job",
            name="next_run_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name="job",
            name="throttle_count",
            field=models.PositiveSmallIntegerField(default=0),
        ),
    ]
