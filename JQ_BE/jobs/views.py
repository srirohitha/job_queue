import csv
import io
from datetime import timedelta
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.conf import settings
from django.utils import timezone
from rest_framework import exceptions, permissions, status, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.decorators import action
from rest_framework.views import APIView

from .models import Job, JobEventType, JobStage, JobStatus
from .processing import build_output_result
from .responses import api_response
from .serializers import (
    JobCreateSerializer,
    JobSerializer,
    WorkerCompleteSerializer,
    WorkerFailSerializer,
    WorkerLeaseSerializer,
    WorkerProgressSerializer,
)

User = get_user_model()

def _enforce_jobs_per_min_limit(user) -> None:
    limit = getattr(settings, "JOBS_PER_MIN_LIMIT", 4)
    if not limit:
        return
    now = timezone.now()
    window_start = now - timedelta(minutes=1)
    used = Job.objects.filter(tenant=user, last_ran_at__gte=window_start).count()
    if used < limit:
        return
    oldest = (
        Job.objects.filter(tenant=user, last_ran_at__gte=window_start)
        .order_by("last_ran_at")
        .first()
    )
    wait = 60
    if oldest and oldest.last_ran_at:
        wait = max(1, int(60 - (now - oldest.last_ran_at).total_seconds()))
    raise exceptions.Throttled(
        wait=wait,
        detail=f"Rate limit exceeded: max {limit} job triggers per minute. Try again in ~{wait}s.",
    )


def _parse_config(value):
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    try:
        import json

        return json.loads(value)
    except (TypeError, ValueError):
        return {}


def _parse_csv(file_obj):
    decoded = file_obj.read().decode("utf-8")
    reader = csv.DictReader(io.StringIO(decoded))
    rows = list(reader)
    return rows


class AuthRegisterView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        username = request.data.get("username", "").strip()
        email = request.data.get("email", "").strip()
        password = request.data.get("password", "")

        if not username or not password:
            raise exceptions.ValidationError(
                {"detail": "username and password are required."}
            )

        if User.objects.filter(username=username).exists():
            raise exceptions.ValidationError({"detail": "username already exists."})

        try:
            validate_password(password)
        except DjangoValidationError as exc:
            raise exceptions.ValidationError({"password": exc.messages}) from exc

        user = User.objects.create_user(username=username, email=email, password=password)
        from rest_framework.authtoken.models import Token

        token, _ = Token.objects.get_or_create(user=user)
        return api_response(
            {"token": token.key, "user": {"id": user.id, "username": user.username, "email": user.email}},
            status_code=status.HTTP_201_CREATED,
        )


class AuthLoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        username = request.data.get("username", "").strip()
        password = request.data.get("password", "")
        user = authenticate(username=username, password=password)
        if not user:
            raise exceptions.AuthenticationFailed("Invalid credentials.")

        from rest_framework.authtoken.models import Token

        token, _ = Token.objects.get_or_create(user=user)
        return api_response(
            {"token": token.key, "user": {"id": user.id, "username": user.username, "email": user.email}}
        )


class AuthMeView(APIView):
    def get(self, request):
        user = request.user
        return api_response({"id": user.id, "username": user.username, "email": user.email})


class JobViewSet(viewsets.GenericViewSet):
    serializer_class = JobSerializer
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def get_queryset(self):
        return Job.objects.filter(tenant=self.request.user).order_by("-created_at")

    def get_serializer_class(self):
        if self.action == "create":
            return JobCreateSerializer
        return JobSerializer

    def list(self, request):
        queryset = list(self.filter_queryset(self.get_queryset()))
        page = self.paginate_queryset(queryset)
        serializer = JobSerializer(page if page is not None else queryset, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return api_response(serializer.data)

    def retrieve(self, request, pk=None):
        job = self.get_object()
        return api_response(JobSerializer(job).data)

    def destroy(self, request, pk=None):
        job = self.get_object()
        job.delete()
        return api_response({"id": str(pk)})

    @transaction.atomic
    def create(self, request):
        serializer = JobCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        input_mode = data["input_mode"]
        payload = data.get("payload") or {}

        if input_mode == "csv":
            csv_rows = _parse_csv(data["csv_file"])
            config = _parse_config(request.data.get("config"))
            payload = {
                "rows": csv_rows,
                "config": config,
                "csv_meta": {
                    "filename": data["csv_file"].name,
                    "row_count": len(csv_rows),
                },
            }

        idempotency_key = (
            data.get("idempotency_key")
            or payload.get("config", {}).get("idempotencyKey")
            or payload.get("config", {}).get("idempotency_key")
        )
        if idempotency_key:
            existing = Job.objects.filter(
                tenant=request.user, idempotency_key=idempotency_key
            ).first()
            if existing:
                return api_response(JobSerializer(existing).data)

        _enforce_jobs_per_min_limit(request.user)

        total_rows = len(payload.get("rows", []))
        max_attempts = data.get("max_attempts") or 3

        job = Job.objects.create(
            tenant=request.user,
            label=data["label"],
            status=JobStatus.PENDING,
            stage=JobStage.VALIDATING,
            progress=0,
            processed_rows=0,
            total_rows=total_rows,
            attempts=0,
            max_attempts=max_attempts,
            idempotency_key=idempotency_key or None,
            input_payload=payload,
            output_result={},
            events=[],
            last_ran_at=timezone.now(),
        )
        job.add_event(JobEventType.SUBMITTED)
        job.save()
        from .tasks import proc

        transaction.on_commit(lambda: proc.delay(str(job.id)))
        return api_response(JobSerializer(job).data, status_code=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def retry(self, request, pk=None):
        job = self.get_object()
        if job.status not in {JobStatus.FAILED, JobStatus.DONE}:
            raise exceptions.ValidationError("Only failed or completed jobs can be retried.")
        _enforce_jobs_per_min_limit(request.user)
        previous_status = job.status
        job.status = JobStatus.PENDING
        job.stage = JobStage.VALIDATING
        job.progress = 0
        job.processed_rows = 0
        job.attempts = 0
        job.failure_reason = None
        job.next_retry_at = None
        job.locked_by = None
        job.lease_until = None
        job.output_result = {}
        job.last_ran_at = timezone.now()
        job.add_event(JobEventType.SUBMITTED, {"retried": True, "fromStatus": previous_status})
        job.save()
        from .tasks import proc

        transaction.on_commit(lambda: proc.delay(str(job.id)))
        return api_response(JobSerializer(job).data)

    @action(detail=True, methods=["post"])
    def replay(self, request, pk=None):
        job = self.get_object()
        if job.status != JobStatus.DLQ:
            raise exceptions.ValidationError("Only DLQ jobs can be replayed.")
        _enforce_jobs_per_min_limit(request.user)
        job.status = JobStatus.PENDING
        job.stage = JobStage.VALIDATING
        job.progress = 0
        job.processed_rows = 0
        job.attempts = 0
        job.failure_reason = None
        job.next_retry_at = None
        job.locked_by = None
        job.lease_until = None
        job.last_ran_at = timezone.now()
        job.add_event(JobEventType.SUBMITTED, {"replayed": True})
        job.save()
        from .tasks import proc

        transaction.on_commit(lambda: proc.delay(str(job.id)))
        return api_response(JobSerializer(job).data)

    @action(detail=False, methods=["get"])
    def stats(self, request):
        qs = self.get_queryset()
        now = timezone.now()
        one_minute_ago = now - timedelta(minutes=1)
        jobs_per_min = qs.filter(last_ran_at__gte=one_minute_ago).count()
        concurrent_jobs = qs.filter(status=JobStatus.RUNNING).count()
        data = {
            "pending": qs.filter(status=JobStatus.PENDING).count(),
            "running": qs.filter(status=JobStatus.RUNNING).count(),
            "done": qs.filter(status=JobStatus.DONE).count(),
            "failed": qs.filter(status=JobStatus.FAILED).count(),
            "dlq": qs.filter(status=JobStatus.DLQ).count(),
            "jobsPerMin": jobs_per_min,
            "jobsPerMinLimit": getattr(settings, "JOBS_PER_MIN_LIMIT", 4),
            "concurrentJobs": concurrent_jobs,
            "concurrentJobsLimit": getattr(settings, "CONCURRENT_JOBS_LIMIT", 2),
        }
        return api_response(data)

    @action(detail=False, methods=["post"])
    def lease(self, request):
        serializer = WorkerLeaseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        worker_id = data["worker_id"]
        lease_seconds = data.get("lease_seconds", 120)

        concurrent_limit = getattr(settings, "CONCURRENT_JOBS_LIMIT", 2)
        if (
            concurrent_limit
            and Job.objects.filter(tenant=request.user, status=JobStatus.RUNNING).count()
            >= concurrent_limit
        ):
            raise exceptions.Throttled(
                wait=5,
                detail=f"Concurrent job limit reached ({concurrent_limit}). Try again shortly.",
            )

        job = (
            Job.objects.filter(tenant=request.user, status=JobStatus.PENDING)
            .order_by("created_at")
            .first()
        )
        if not job:
            return api_response({"message": "No pending jobs available."})

        job.status = JobStatus.RUNNING
        job.stage = JobStage.PROCESSING
        job.progress = max(job.progress, 5)
        job.processed_rows = max(job.processed_rows, int(job.total_rows * 0.05))
        job.attempts = max(job.attempts, 1)
        job.locked_by = worker_id
        job.last_ran_at = timezone.now()
        job.lease_until = timezone.now() + timedelta(seconds=lease_seconds)
        job.add_event(JobEventType.LEASED, {"worker": worker_id})
        job.save()
        return api_response(JobSerializer(job).data)

    @action(detail=True, methods=["post"])
    def progress(self, request, pk=None):
        job = self.get_object()
        serializer = WorkerProgressSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        job.progress = data["progress"]
        job.processed_rows = data["processed_rows"]
        if "stage" in data:
            job.stage = data["stage"]
        job.add_event(JobEventType.PROGRESS_UPDATED, {"progress": job.progress})
        job.save()
        return api_response(JobSerializer(job).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        job = self.get_object()
        serializer = WorkerCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        job.status = JobStatus.DONE
        job.stage = JobStage.DONE
        job.progress = 100
        job.processed_rows = job.total_rows
        job.locked_by = None
        job.lease_until = None
        output_result = serializer.validated_data.get("output_result")
        job.output_result = output_result or build_output_result(job.input_payload or {})
        job.add_event(JobEventType.DONE)
        job.save()
        return api_response(JobSerializer(job).data)

    @action(detail=True, methods=["post"])
    def fail(self, request, pk=None):
        job = self.get_object()
        serializer = WorkerFailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        job.attempts += 1
        job.failure_reason = data["failure_reason"]
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
            retry_in = data.get("retry_in_seconds", 300)
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
        return api_response(JobSerializer(job).data)
