"""
Minimal tests for tenant concurrency throttling (THROTTLED status).
"""
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.utils import timezone

from .models import Job, JobEventType, JobStage, JobStatus
from .tasks import proc, reconcile

User = get_user_model()


@override_settings(CONCURRENT_JOBS_LIMIT=2, JOB_THROTTLE_BACKOFF_SECONDS=15)
class ThrottlingTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass")

    def test_throttling_does_not_increment_attempts(self):
        """When at concurrent limit, job becomes THROTTLED and attempts stay 0."""
        payload = {"rows": [{"a": 1}], "config": {}}
        # Create 2 RUNNING jobs (at limit)
        j1 = Job.objects.create(
            tenant=self.user,
            label="running-1",
            status=JobStatus.RUNNING,
            stage=JobStage.PROCESSING,
            total_rows=1,
            input_payload=payload,
        )
        j2 = Job.objects.create(
            tenant=self.user,
            label="running-2",
            status=JobStatus.RUNNING,
            stage=JobStage.PROCESSING,
            total_rows=1,
            input_payload=payload,
        )
        # Third job: PENDING
        j3 = Job.objects.create(
            tenant=self.user,
            label="pending-3",
            status=JobStatus.PENDING,
            stage=JobStage.VALIDATING,
            total_rows=1,
            input_payload=payload,
            attempts=0,
        )
        result = proc(str(j3.id))
        self.assertEqual(result.get("status"), JobStatus.THROTTLED)
        j3.refresh_from_db()
        self.assertEqual(j3.status, JobStatus.THROTTLED)
        self.assertEqual(j3.attempts, 0)
        self.assertIsNotNone(j3.next_run_at)
        self.assertEqual(j3.throttle_count, 1)
        event_types = [e["type"] for e in j3.events]
        self.assertIn(JobEventType.THROTTLED, event_types)

    def test_job_runs_later_once_slots_free(self):
        """Once a slot is free, THROTTLED job (moved to PENDING by reconcile) runs successfully."""
        payload = {"rows": [{"a": 1}], "config": {}}
        # One RUNNING job
        j1 = Job.objects.create(
            tenant=self.user,
            label="running-1",
            status=JobStatus.RUNNING,
            stage=JobStage.PROCESSING,
            total_rows=1,
            input_payload=payload,
        )
        # One THROTTLED job with next_run_at in the past (eligible to run)
        now = timezone.now()
        j2 = Job.objects.create(
            tenant=self.user,
            label="throttled-2",
            status=JobStatus.THROTTLED,
            stage=JobStage.VALIDATING,
            total_rows=1,
            input_payload=payload,
            next_run_at=now,
            throttle_count=1,
        )
        # Free the slot: set j1 to DONE
        j1.status = JobStatus.DONE
        j1.stage = JobStage.DONE
        j1.locked_by = None
        j1.lease_until = None
        j1.save()
        # Simulate reconcile: move j2 to PENDING (reconcile would do this + proc.delay)
        j2.status = JobStatus.PENDING
        j2.next_run_at = None
        j2.save(update_fields=["status", "next_run_at", "updated_at"])
        # Run proc synchronously; job should get slot and complete
        result = proc(str(j2.id))
        j2.refresh_from_db()
        self.assertEqual(j2.status, JobStatus.DONE, "Job should run once slot is free")
