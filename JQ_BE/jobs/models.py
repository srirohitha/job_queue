import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class JobStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    THROTTLED = "THROTTLED", "Throttled"
    RUNNING = "RUNNING", "Running"
    DONE = "DONE", "Done"
    FAILED = "FAILED", "Failed"
    DLQ = "DLQ", "Dead Letter Queue"


class JobStage(models.TextChoices):
    VALIDATING = "VALIDATING", "Validating"
    PROCESSING = "PROCESSING", "Processing"
    FINALIZING = "FINALIZING", "Finalizing"
    DONE = "DONE", "Done"


class JobEventType(models.TextChoices):
    SUBMITTED = "SUBMITTED", "Submitted"
    LEASED = "LEASED", "Leased"
    PROGRESS_UPDATED = "PROGRESS_UPDATED", "Progress Updated"
    RETRY_SCHEDULED = "RETRY_SCHEDULED", "Retry Scheduled"
    THROTTLED = "THROTTLED", "Throttled"
    FAILED = "FAILED", "Failed"
    MOVED_TO_DLQ = "MOVED_TO_DLQ", "Moved to DLQ"
    DONE = "DONE", "Done"


class Job(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="jobs"
    )
    label = models.CharField(max_length=255)
    status = models.CharField(
        max_length=20, choices=JobStatus.choices, default=JobStatus.PENDING
    )
    stage = models.CharField(
        max_length=20, choices=JobStage.choices, default=JobStage.VALIDATING
    )
    progress = models.PositiveSmallIntegerField(default=0)
    processed_rows = models.PositiveIntegerField(default=0)
    total_rows = models.PositiveIntegerField(default=0)
    attempts = models.PositiveSmallIntegerField(default=0)
    max_attempts = models.PositiveSmallIntegerField(default=3)
    locked_by = models.CharField(max_length=128, null=True, blank=True)
    lease_until = models.DateTimeField(null=True, blank=True)
    next_retry_at = models.DateTimeField(null=True, blank=True)
    next_run_at = models.DateTimeField(null=True, blank=True, db_index=True)
    throttle_count = models.PositiveSmallIntegerField(default=0)
    failure_reason = models.TextField(null=True, blank=True)
    idempotency_key = models.CharField(max_length=64, null=True, blank=True)
    input_payload = models.JSONField(default=dict, blank=True)
    output_result = models.JSONField(default=dict, blank=True)
    events = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_ran_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["tenant", "status"]),
            models.Index(fields=["created_at"]),
            models.Index(fields=["tenant", "idempotency_key"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "idempotency_key"], 
                condition=models.Q(idempotency_key__isnull=False),
                name="unique_tenant_idempotency_key"
            )
        ]

    def add_event(self, event_type: str, metadata: dict | None = None) -> None:
        event = {
            "type": event_type,
            "timestamp": timezone.now().isoformat(),
        }
        if metadata:
            event["metadata"] = metadata
        self.events = [*self.events, event]

    def __str__(self) -> str:
        return f"{self.label} ({self.id})"


class JobTrigger(models.Model):
    """One row per job run/trigger (create, retry, replay). Used for jobs-per-minute count."""
    job = models.ForeignKey(
        Job, on_delete=models.CASCADE, related_name="triggers", null=True, blank=True
    )
    tenant = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="job_triggers"
    )
    triggered_at = models.DateTimeField(db_index=True)

    class Meta:
        indexes = [
            models.Index(fields=["tenant", "triggered_at"], name="jobs_jt_tenant_trigger_idx"),
        ]
