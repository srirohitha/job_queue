"""
Celery tasks for job processing. THROTTLED jobs do not increment attempts;
reconcile re-enqueues THROTTLED jobs when next_run_at <= now.
"""
import random
import time
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.db import OperationalError, connection, transaction
from django.utils import timezone

from .models import Job, JobEventType, JobStage, JobStatus
from .processing import build_output_result


def _lease_seconds() -> int:
    return int(getattr(settings, "JOB_LEASE_SECONDS", 60))


def _throttle_backoff_seconds(throttle_count: int) -> int:
    base = int(getattr(settings, "JOB_THROTTLE_BACKOFF_SECONDS", 15))
    return min(base * (1 + throttle_count), 300)


def _pending_timeout_seconds() -> int:
    return int(getattr(settings, "JOB_PENDING_TIMEOUT_SECONDS", 10))


def _row_delay_seconds(payload: dict) -> float:
    delay_min = float(getattr(settings, "JOB_JSON_ROW_DELAY_MIN_SECONDS", 2))
    delay_max = float(getattr(settings, "JOB_JSON_ROW_DELAY_MAX_SECONDS", 3))
    return random.uniform(delay_min, delay_max)


def _csv_batch_delay_settings(total_rows: int | None) -> tuple[int, float]:
    batch_size = int(getattr(settings, "JOB_CSV_BATCH_SIZE", 2000))
    batch_size = max(batch_size, 1)
    explicit_delay = float(getattr(settings, "JOB_CSV_BATCH_DELAY_SECONDS", 0))
    if explicit_delay > 0:
        return batch_size, explicit_delay
    target_rows = int(getattr(settings, "JOB_CSV_TARGET_ROWS", 50000))
    target_seconds = float(getattr(settings, "JOB_CSV_TARGET_SECONDS", 15))
    if not total_rows or target_seconds <= 0 or target_rows <= 0:
        return batch_size, 0.0
    per_row_delay = target_seconds / target_rows
    delay = per_row_delay * batch_size
    return batch_size, max(delay, 0.0)


def _csv_progress_update_every(total_rows: int) -> int:
    updates_target = int(getattr(settings, "JOB_CSV_PROGRESS_UPDATES", 100))
    updates_target = max(updates_target, 1)
    return max(1, total_rows // updates_target)


def _should_delay_rows(payload: dict) -> bool:
    if not isinstance(payload, dict):
        return False
    rows = payload.get("rows")
    if not isinstance(rows, list) or not rows:
        return False
    if payload.get("csv_meta"):
        _batch_size, batch_delay = _csv_batch_delay_settings(len(rows))
        return batch_delay > 0
    return True


def _mark_failed(job, reason: str, now, retry_in_seconds: int) -> None:
    job.status = JobStatus.FAILED
    job.stage = JobStage.VALIDATING
    job.failure_reason = reason
    job.locked_by = None
    job.lease_until = None
    job.next_retry_at = now + timedelta(seconds=retry_in_seconds)
    job.add_event(JobEventType.FAILED, {"reason": reason, "attempt": job.attempts})


def _save_with_retry(job, update_fields=None, attempts: int = 3) -> None:
    for attempt in range(attempts):
        try:
            job.save(update_fields=update_fields)
            return
        except OperationalError as exc:
            if connection.in_atomic_block and connection.needs_rollback:
                try:
                    transaction.set_rollback(False)
                except Exception:
                    pass
            if "database is locked" not in str(exc).lower() or attempt >= attempts - 1:
                raise
            time.sleep(0.2 * (attempt + 1))


def _update_with_retry(qs, updates: dict, attempts: int = 3) -> int:
    for attempt in range(attempts):
        try:
            return qs.update(**updates)
        except OperationalError as exc:
            if connection.in_atomic_block and connection.needs_rollback:
                try:
                    transaction.set_rollback(False)
                except Exception:
                    pass
            if "database is locked" not in str(exc).lower() or attempt >= attempts - 1:
                raise
            time.sleep(0.2 * (attempt + 1))
    return 0


@shared_task(name="jobs.proc")
def proc(job_id: str) -> dict:
    now = timezone.now()
    with transaction.atomic():
        job = Job.objects.select_for_update().get(id=job_id)
        # Only process PENDING or THROTTLED (and for THROTTLED, caller/reconcile ensures next_run_at <= now)
        if job.status not in (JobStatus.PENDING, JobStatus.THROTTLED):
            _save_with_retry(job)
            return {"status": job.status}
        if job.status == JobStatus.THROTTLED and job.next_run_at and job.next_run_at > now:
            _save_with_retry(job)
            return {"status": job.status}
        if job.attempts >= job.max_attempts:
            job.status = JobStatus.DLQ
            job.add_event(JobEventType.MOVED_TO_DLQ, {"reason": job.failure_reason})
            _save_with_retry(job)
            return {"status": job.status}

        concurrent_limit = getattr(settings, "CONCURRENT_JOBS_LIMIT", 2)
        if concurrent_limit:
            running_now = (
                Job.objects.filter(tenant=job.tenant, status=JobStatus.RUNNING)
                .exclude(id=job.id)
                .count()
            )
            if running_now >= concurrent_limit:
                backoff = _throttle_backoff_seconds(job.throttle_count)
                job.status = JobStatus.THROTTLED
                job.next_run_at = now + timedelta(seconds=backoff)
                job.throttle_count = (job.throttle_count or 0) + 1
                job.locked_by = None
                job.lease_until = None
                job.add_event(
                    JobEventType.THROTTLED,
                    {
                        "next_run_at": job.next_run_at.isoformat(),
                        "throttle_count": job.throttle_count,
                    },
                )
                _save_with_retry(job)
                return {"status": JobStatus.THROTTLED, "next_run_at": job.next_run_at.isoformat()}

        job.status = JobStatus.RUNNING
        job.stage = JobStage.PROCESSING
        job.progress = max(job.progress, 5)
        job.processed_rows = max(
            job.processed_rows,
            int(job.total_rows * 0.05) if job.total_rows else 0,
        )
        job.locked_by = "celery-worker"
        job.last_ran_at = now
        job.lease_until = now + timedelta(seconds=_lease_seconds())
        job.next_run_at = None
        job.add_event(JobEventType.LEASED, {"worker": job.locked_by})
        job.add_event(JobEventType.PROGRESS_UPDATED, {"progress": job.progress})
        payload = job.input_payload or {}
        _save_with_retry(job)

    try:
        if _should_delay_rows(payload):
            rows = payload.get("rows", [])
            total_rows = len(rows)
            batch_size = None
            batch_delay = None
            progress_every = 1
            abort_check_every = 1
            if payload.get("csv_meta"):
                batch_size, batch_delay = _csv_batch_delay_settings(total_rows)
                progress_every = _csv_progress_update_every(total_rows)
                abort_check_every = progress_every
            for index in range(total_rows):
                processed = index + 1
                if payload.get("csv_meta"):
                    if processed % abort_check_every == 0:
                        if not Job.objects.filter(
                            id=job_id, status=JobStatus.RUNNING
                        ).exists():
                            return {"status": "ABORTED"}
                    if batch_delay and processed % batch_size == 0:
                        time.sleep(batch_delay)
                else:
                    if not Job.objects.filter(id=job_id, status=JobStatus.RUNNING).exists():
                        return {"status": "ABORTED"}
                    delay = _row_delay_seconds(payload)
                    if delay > 0:
                        time.sleep(delay)
                should_update = True
                if payload.get("csv_meta"):
                    should_update = processed % progress_every == 0 or processed == total_rows
                if should_update:
                    progress = min(
                        99,
                        max(job.progress, int((processed / max(total_rows, 1)) * 95)),
                    )
                    _update_with_retry(
                        Job.objects.filter(id=job_id),
                        {
                            "processed_rows": processed,
                            "progress": progress,
                            "stage": JobStage.PROCESSING,
                            "lease_until": timezone.now() + timedelta(seconds=_lease_seconds()),
                            "updated_at": timezone.now(),
                        },
                    )

        output_result = build_output_result(payload)
        with transaction.atomic():
            job = Job.objects.select_for_update().get(id=job_id)
            if job.status != JobStatus.RUNNING:
                return {"status": job.status}
            job.status = JobStatus.DONE
            job.stage = JobStage.DONE
            job.progress = 100
            job.processed_rows = job.total_rows
            job.output_result = output_result
            job.locked_by = None
            job.lease_until = None
            job.next_run_at = None
            job.add_event(JobEventType.DONE)
            _save_with_retry(job)
        return {"status": JobStatus.DONE}
    except Exception as exc:
        retry_in = int(getattr(settings, "JOB_RETRY_DELAY_SECONDS", 5))
        with transaction.atomic():
            job = Job.objects.select_for_update().get(id=job_id)
            job.attempts += 1
            _mark_failed(job, str(exc), timezone.now(), retry_in)
            if job.attempts >= job.max_attempts:
                job.status = JobStatus.DLQ
                job.add_event(JobEventType.MOVED_TO_DLQ, {"reason": job.failure_reason})
            _save_with_retry(job)
        raise


@shared_task(name="jobs.reconcile")
def reconcile() -> dict:
    """Re-enqueue THROTTLED/FAILED jobs; fail timed-out PENDING; recover lease-expired RUNNING."""
    now = timezone.now()
    from django.db.models import Q

    pending_cutoff = now - timedelta(seconds=_pending_timeout_seconds())
    pending_ready = Job.objects.filter(
        status=JobStatus.PENDING, updated_at__lt=pending_cutoff
    ).order_by("updated_at")
    pending_failed = 0
    pending_to_dlq = 0
    retry_in = int(getattr(settings, "JOB_RETRY_DELAY_SECONDS", 5))
    for job in pending_ready[:50]:
        jid = job.id
        try:
            job = Job.objects.filter(id=jid, status=JobStatus.PENDING).first()
            if not job:
                continue
            job.attempts += 1
            _mark_failed(job, "Pending timeout", now, retry_in)
            if job.attempts >= job.max_attempts:
                job.status = JobStatus.DLQ
                job.add_event(
                    JobEventType.MOVED_TO_DLQ, {"reason": job.failure_reason}
                )
                pending_to_dlq += 1
            _save_with_retry(job)
            pending_failed += 1
        except OperationalError:
            continue

    throttled_ready = Job.objects.filter(status=JobStatus.THROTTLED).filter(
        Q(next_run_at__isnull=True) | Q(next_run_at__lte=now)
    )
    requeued = 0
    for job in throttled_ready[:50]:
        jid = job.id
        try:
            job = Job.objects.filter(id=jid, status=JobStatus.THROTTLED).first()
            if not job:
                continue
            if job.next_run_at and job.next_run_at > now:
                continue
            job.status = JobStatus.PENDING
            job.next_run_at = None
            _save_with_retry(job, update_fields=["status", "next_run_at", "updated_at"])
            proc.delay(str(jid))
            requeued += 1
        except OperationalError:
            continue

    failed_ready = Job.objects.filter(status=JobStatus.FAILED).filter(
        Q(next_retry_at__lte=now) | Q(next_retry_at__isnull=True)
    )
    failed_requeued = 0
    failed_to_dlq = 0
    for job in failed_ready[:50]:
        jid = job.id
        try:
            job = Job.objects.filter(id=jid, status=JobStatus.FAILED).first()
            if not job:
                continue
            if job.next_retry_at and job.next_retry_at > now:
                continue
            if job.attempts >= job.max_attempts:
                job.status = JobStatus.DLQ
                job.add_event(JobEventType.MOVED_TO_DLQ, {"reason": job.failure_reason})
                job.next_retry_at = None
                job.next_run_at = None
                _save_with_retry(
                    job,
                    update_fields=[
                        "status",
                        "next_retry_at",
                        "next_run_at",
                        "events",
                        "updated_at",
                    ],
                )
                failed_to_dlq += 1
                continue
            job.status = JobStatus.PENDING
            job.stage = JobStage.VALIDATING
            job.progress = 0
            job.processed_rows = 0
            job.next_retry_at = None
            job.next_run_at = None
            job.locked_by = None
            job.lease_until = None
            job.add_event(
                JobEventType.RETRY_SCHEDULED,
                {"reason": "Auto retry", "queued_at": now.isoformat()},
            )
            _save_with_retry(
                job,
                update_fields=[
                    "status",
                    "stage",
                    "progress",
                    "processed_rows",
                    "next_retry_at",
                    "next_run_at",
                    "locked_by",
                    "lease_until",
                    "events",
                    "updated_at",
                ],
            )
            proc.delay(str(jid))
            failed_requeued += 1
        except OperationalError:
            continue

    expired = Job.objects.filter(
        status=JobStatus.RUNNING,
        lease_until__isnull=False,
        lease_until__lt=now,
    )
    failed_count = 0
    retry_in = int(getattr(settings, "JOB_RETRY_DELAY_SECONDS", 5))
    for job in expired[:50]:
        jid = job.id
        try:
            job = Job.objects.filter(id=jid, status=JobStatus.RUNNING).first()
            if not job or not job.lease_until or job.lease_until >= now:
                continue
            job.attempts += 1
            _mark_failed(job, "Worker lease expired", now, retry_in)
            if job.attempts >= job.max_attempts:
                job.status = JobStatus.DLQ
                job.add_event(JobEventType.MOVED_TO_DLQ, {"reason": job.failure_reason})
            _save_with_retry(job)
            failed_count += 1
        except OperationalError:
            continue

    return {
        "requeued_pending": pending_failed,
        "pending_failed": pending_failed,
        "pending_to_dlq": pending_to_dlq,
        "requeued_throttled": requeued,
        "requeued_failed": failed_requeued,
        "failed_to_dlq": failed_to_dlq,
        "lease_expired_failed": failed_count,
    }
