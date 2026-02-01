from datetime import timedelta

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from .models import Job, JobEventType, JobStage, JobStatus
from .processing import build_output_result


@shared_task(name="jobs.proc")
def proc(job_id: str) -> dict:
    with transaction.atomic():
        job = Job.objects.select_for_update().get(id=job_id)
        if job.status != JobStatus.PENDING:
            return {"status": job.status}
        job.status = JobStatus.RUNNING
        job.stage = JobStage.PROCESSING
        job.progress = max(job.progress, 5)
        job.processed_rows = (
            max(job.processed_rows, int(job.total_rows * 0.05)) if job.total_rows else 0
        )
        job.attempts = max(job.attempts, 1)
        job.locked_by = "celery-worker"
        job.lease_until = timezone.now() + timedelta(seconds=300)
        job.add_event(JobEventType.LEASED, {"worker": job.locked_by})
        job.add_event(JobEventType.PROGRESS_UPDATED, {"progress": job.progress})
        payload = job.input_payload or {}
        job.save()

    try:
        output_result = build_output_result(payload)
        with transaction.atomic():
            job = Job.objects.select_for_update().get(id=job_id)
            job.status = JobStatus.DONE
            job.stage = JobStage.DONE
            job.progress = 100
            job.processed_rows = job.total_rows
            job.locked_by = None
            job.lease_until = None
            job.output_result = output_result
            job.add_event(JobEventType.DONE)
            job.save()
        return {"status": JobStatus.DONE}
    except Exception as exc:  # noqa: BLE001 - ensure job state reflects failures
        with transaction.atomic():
            job = Job.objects.select_for_update().get(id=job_id)
            job.attempts += 1
            job.failure_reason = str(exc)
            job.locked_by = None
            job.lease_until = None
            if job.attempts >= job.max_attempts:
                job.status = JobStatus.DLQ
                job.add_event(
                    JobEventType.FAILED,
                    {"reason": job.failure_reason, "attempt": job.attempts},
                )
                job.add_event(
                    JobEventType.MOVED_TO_DLQ,
                    {"reason": job.failure_reason},
                )
            else:
                job.status = JobStatus.FAILED
                retry_in = 300
                job.next_retry_at = timezone.now() + timedelta(seconds=retry_in)
                job.add_event(
                    JobEventType.FAILED,
                    {"reason": job.failure_reason, "attempt": job.attempts},
                )
                job.add_event(
                    JobEventType.RETRY_SCHEDULED,
                    {"nextRetryAt": job.next_retry_at.isoformat()},
                )
            job.save()
        raise
