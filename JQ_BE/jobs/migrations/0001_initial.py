import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Job",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("label", models.CharField(max_length=255)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("PENDING", "Pending"),
                            ("RUNNING", "Running"),
                            ("DONE", "Done"),
                            ("FAILED", "Failed"),
                            ("DLQ", "Dead Letter Queue"),
                        ],
                        default="PENDING",
                        max_length=20,
                    ),
                ),
                (
                    "stage",
                    models.CharField(
                        choices=[
                            ("VALIDATING", "Validating"),
                            ("PROCESSING", "Processing"),
                            ("FINALIZING", "Finalizing"),
                            ("DONE", "Done"),
                        ],
                        default="VALIDATING",
                        max_length=20,
                    ),
                ),
                ("progress", models.PositiveSmallIntegerField(default=0)),
                ("processed_rows", models.PositiveIntegerField(default=0)),
                ("total_rows", models.PositiveIntegerField(default=0)),
                ("attempts", models.PositiveSmallIntegerField(default=0)),
                ("max_attempts", models.PositiveSmallIntegerField(default=3)),
                ("locked_by", models.CharField(blank=True, max_length=128, null=True)),
                ("lease_until", models.DateTimeField(blank=True, null=True)),
                ("next_retry_at", models.DateTimeField(blank=True, null=True)),
                ("failure_reason", models.TextField(blank=True, null=True)),
                ("idempotency_key", models.CharField(blank=True, max_length=64, null=True)),
                ("input_payload", models.JSONField(blank=True, default=dict)),
                ("output_result", models.JSONField(blank=True, default=dict)),
                ("events", models.JSONField(blank=True, default=list)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="jobs",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "indexes": [
                    models.Index(fields=["tenant", "status"], name="jobs_job_tenant_status_idx"),
                    models.Index(fields=["created_at"], name="jobs_job_created_at_idx"),
                ],
            },
        ),
    ]
