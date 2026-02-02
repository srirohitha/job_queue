"""
Celery tasks for job processing. THROTTLED jobs do not increment attempts;
reconcile re-enqueues THROTTLED jobs when next_run_at <= now.
"""
from django.conf import settings
from django.db import OperationalError, transaction
from django.utils import timezone
from celery import shared_task
from datetime import timedelta

from .models import Job, JobEventType, JobStage, JobStatus
from .processing import build_output_result


def _lease_seconds():
    return int(getattr(settings, "JOB_LEASE_SECONDS", 60))


def _throttle_backoff_seconds(throttle_count: int) -> int:
    base = int(getattr(settings, "JOB_THROTTLE_BACKOFF_SECONDS", 15))
    return min(base * (1 + throttle_count), 300)


def _mark_failed(job, reason: str, now, retry_in_seconds: int) -> None:
    job.status = JobStatus.FAILED
    job.stage = JobStage.VALIDATING
    job.failure_reason = reason
    job.locked_by = None
    job.lease_until = None
    job.next_retry_at = now + timedelta(seconds=retry_in_seconds)
    job.add_event(JobEventType.FAILED, {"reason": reason, "attempt": job.attempts})


@shared_task(
    name="jobs.proc",
    bind=True,
    autoretry_for=(OperationalError,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=5,
)
def proc(self, job_id: str) -> dict:
    now = timezone.now()
    with transaction.atomic():
        job = Job.objects.select_for_update().get(id=job_id)
        # Only process PENDING or THROTTLED (and for THROTTLED, caller/reconcile ensures next_run_at <= now)
        if job.status not in (JobStatus.PENDING, JobStatus.THROTTLED):
            job.save()
            return {"status": job.status}
        if job.status == JobStatus.THROTTLED and job.next_run_at and job.next_run_at > now:
            job.save()
            return {"status": job.status}
        if job.attempts >= job.max_attempts:
            job.status = JobStatus.DLQ
            job.add_event(JobEventType.MOVED_TO_DLQ, {"reason": job.failure_reason})
            job.save()
            return {"status": job.status}

        concurrent_limit = getattr(settings, "CONCURRENT_JOBS_LIMIT", 2)
        if concurrent_limit:
            running_now = (
                Job.objects.filter(tenant=job.tenant, status=JobStatus.RUNNING)
                .exclude(id=job.id)
                .count()
            )
            if running_now >= concurrent_limit:
                # Do NOT fail/retry: set THROTTLED, next_run_at, throttle_count, event. Do not increment attempts.
                backoff = _throttle_backoff_seconds(job.throttle_count)
                job.status = JobStatus.THROTTLED
                job.next_run_at = now + timedelta(seconds=backoff)
                job.throttle_count = (job.throttle_count or 0) + 1
                job.locked_by = None
                job.lease_until = None
                job.add_event(
                    JobEventType.THROTTLED,
                    {"next_run_at": job.next_run_at.isoformat(), "throttle_count": job.throttle_count},
                )
                job.save()
                return {"status": JobStatus.THROTTLED, "next_run_at": job.next_run_at.isoformat()}

        job.status = JobStatus.RUNNING
        job.stage = JobStage.PROCESSING
        job.progress = max(job.progress, 10)  # Start at 10% after lease
        job.processed_rows = max(
            job.processed_rows,
            int(job.total_rows * 0.1) if job.total_rows else 0,
        )
        job.locked_by = "celery-worker"
        job.last_ran_at = now
        job.lease_until = now + timedelta(seconds=_lease_seconds())
        job.next_run_at = None  # clear when running
        job.add_event(JobEventType.LEASED, {"worker": job.locked_by})
        job.add_event(JobEventType.PROGRESS_UPDATED, {"progress": job.progress})
        payload = job.input_payload or {}
        job.save()

    try:
        # Update progress to show we're starting actual processing
        with transaction.atomic():
            job = Job.objects.select_for_update().get(id=job_id)
            job.stage = JobStage.PROCESSING
            job.progress = 20  # 20% after starting processing
            job.save()
        
        output_result = build_output_result(payload)
        
        # Update to finalizing stage
        with transaction.atomic():
            job = Job.objects.select_for_update().get(id=job_id)
            job.stage = JobStage.FINALIZING
            job.progress = 90  # 90% during finalization
            job.save()
        
        with transaction.atomic():
            job = Job.objects.select_for_update().get(id=job_id)
            job.status = JobStatus.DONE
            job.stage = JobStage.DONE
            job.progress = 100
            job.processed_rows = job.total_rows
            job.output_result = output_result
            job.locked_by = None
            job.lease_until = None
            job.next_run_at = None
            job.add_event(JobEventType.DONE)
            job.save()
        return {"status": JobStatus.DONE}
    except OperationalError:
        raise
    except Exception as exc:
        retry_in = int(getattr(settings, "JOB_RETRY_DELAY_SECONDS", 5))
        with transaction.atomic():
            job = Job.objects.select_for_update().get(id=job_id)
            job.attempts += 1
            _mark_failed(job, str(exc), timezone.now(), retry_in)
            if job.attempts >= job.max_attempts:
                job.status = JobStatus.DLQ
                job.add_event(
                    JobEventType.MOVED_TO_DLQ,
                    {"reason": job.failure_reason},
                )
            job.save()
        raise


@shared_task(name="jobs.reconcile")
def reconcile() -> dict:
    """Re-enqueue THROTTLED jobs where next_run_at <= now; optionally recover lease-expired RUNNING."""
    now = timezone.now()
    from django.db.models import Q

    # THROTTLED jobs eligible to run: next_run_at is null or <= now
    throttled_ready = Job.objects.filter(
        status=JobStatus.THROTTLED
    ).filter(Q(next_run_at__isnull=True) | Q(next_run_at__lte=now))
    requeued = 0
    for job in throttled_ready[:50]:
        jid = job.id
        with transaction.atomic():
            job = Job.objects.select_for_update().filter(id=jid).first()
            if not job or job.status != JobStatus.THROTTLED:
                continue
            if job.next_run_at and job.next_run_at > now:
                continue
            job.status = JobStatus.PENDING
            job.next_run_at = None
            job.save(update_fields=["status", "next_run_at", "updated_at"])
        proc.delay(str(jid))
        requeued += 1

    # Lease-expired RUNNING: mark FAILED and set next_retry_at (existing recovery)
    lease_seconds = _lease_seconds()
    expired = Job.objects.filter(
        status=JobStatus.RUNNING,
        lease_until__isnull=False,
        lease_until__lt=now,
    )
    failed_count = 0
    retry_in = int(getattr(settings, "JOB_RETRY_DELAY_SECONDS", 5))
    for job in expired[:50]:
        with transaction.atomic():
            job = Job.objects.select_for_update().filter(id=job.id).first()
            if not job or job.status != JobStatus.RUNNING:
                continue
            if not job.lease_until or job.lease_until >= now:
                continue
            job.attempts += 1
            _mark_failed(job, "Worker lease expired", now, retry_in)
            if job.attempts >= job.max_attempts:
                job.status = JobStatus.DLQ
                job.add_event(JobEventType.MOVED_TO_DLQ, {"reason": job.failure_reason})
            job.save()
            failed_count += 1

    return {"requeued_throttled": requeued, "lease_expired_failed": failed_count}
