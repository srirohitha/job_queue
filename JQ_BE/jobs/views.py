import csv
import io
import os
import random
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

AUTO_ADVANCE = os.getenv("JOB_AUTO_ADVANCE", "true").lower() == "true"
AUTO_ADVANCE_DELAY_SECONDS = int(os.getenv("JOB_AUTO_ADVANCE_DELAY_SECONDS", "8"))


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


def _normalize_list(value):
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return []


def _extract_config(payload):
    config = payload.get("config") if isinstance(payload, dict) else {}
    config = config if isinstance(config, dict) else {}
    required_fields = _normalize_list(
        config.get("requiredFields") or config.get("required_fields")
    )
    dedupe_on = _normalize_list(config.get("dedupeOn") or config.get("dedupe_on"))
    drop_nulls = config.get("dropNulls")
    if drop_nulls is None:
        drop_nulls = config.get("drop_nulls", False)
    strict_mode = config.get("strictMode")
    if strict_mode is None:
        strict_mode = config.get("strict_mode", False)
    numeric_field = config.get("numericField") or config.get("numeric_field")
    return {
        "required_fields": required_fields,
        "dedupe_on": dedupe_on,
        "drop_nulls": bool(drop_nulls),
        "strict_mode": bool(strict_mode),
        "numeric_field": numeric_field,
    }


def _is_null(value):
    if value is None:
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    return False


def _process_rows(rows, config):
    required_fields = config.get("required_fields", [])
    dedupe_on = config.get("dedupe_on", [])
    drop_nulls = config.get("drop_nulls", False)
    strict_mode = config.get("strict_mode", False)
    required_set = set(required_fields)
    seen = set()

    valid_rows = []
    invalid_rows = 0
    nulls_dropped = 0
    duplicates_removed = 0

    for row in rows:
        if not isinstance(row, dict):
            invalid_rows += 1
            continue

        if required_fields:
            missing_required = [field for field in required_fields if field not in row]
            if missing_required:
                invalid_rows += 1
                continue
            missing_values = [field for field in required_fields if _is_null(row.get(field))]
            if missing_values:
                if drop_nulls:
                    nulls_dropped += 1
                invalid_rows += 1
                continue

        if strict_mode and required_set:
            extra_fields = set(row.keys()) - required_set
            if extra_fields:
                invalid_rows += 1
                continue

        if drop_nulls:
            has_nulls = any(_is_null(value) for value in row.values())
            if has_nulls:
                nulls_dropped += 1
                invalid_rows += 1
                continue

        if dedupe_on:
            key = tuple(str(row.get(field, "")) for field in dedupe_on)
            if key in seen:
                duplicates_removed += 1
                continue
            seen.add(key)

        valid_rows.append(row)

    return {
        "valid_rows": valid_rows,
        "invalid_rows": invalid_rows,
        "duplicates_removed": duplicates_removed,
        "nulls_dropped": nulls_dropped,
    }


def _compute_numeric_stats(rows, numeric_field):
    values = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        value = row.get(numeric_field)
        if isinstance(value, (int, float)):
            values.append(value)
        else:
            try:
                parsed = float(value)
            except (TypeError, ValueError):
                continue
            values.append(parsed)
    if not values:
        return None
    total = sum(values)
    return {
        "field": numeric_field,
        "sum": total,
        "avg": total / len(values),
        "min": min(values),
        "max": max(values),
    }


def _build_output_result(job):
    payload = job.input_payload or {}
    rows = payload.get("rows") if isinstance(payload, dict) else []
    rows = rows if isinstance(rows, list) else []
    config = _extract_config(payload)
    total_processed = len(rows)
    processed = _process_rows(rows, config)
    numeric_field = config.get("numeric_field")
    numeric_stats = (
        _compute_numeric_stats(processed["valid_rows"], numeric_field)
        if numeric_field
        else None
    )
    output = {
        "totalProcessed": total_processed,
        "totalValid": len(processed["valid_rows"]),
        "totalInvalid": processed["invalid_rows"],
        "duplicatesRemoved": processed["duplicates_removed"],
        "nullsDropped": processed["nulls_dropped"],
    }
    if numeric_stats:
        output["numericStats"] = numeric_stats
    if processed["valid_rows"]:
        output["outputData"] = processed["valid_rows"][:50]
    return output


def _advance_job(job):
    now = timezone.now()
    updated = False

    if job.status == JobStatus.PENDING:
        if now - job.created_at >= timedelta(seconds=AUTO_ADVANCE_DELAY_SECONDS):
            job.status = JobStatus.RUNNING
            job.stage = JobStage.PROCESSING
            job.progress = max(job.progress, 5)
            job.processed_rows = max(job.processed_rows, int(job.total_rows * 0.05))
            job.attempts = max(job.attempts, 1)
            job.locked_by = job.locked_by or f"worker-{job.tenant_id}"
            job.lease_until = now + timedelta(seconds=120)
            job.add_event(JobEventType.LEASED, {"worker": job.locked_by})
            job.add_event(JobEventType.PROGRESS_UPDATED, {"progress": job.progress})
            updated = True
    elif job.status == JobStatus.RUNNING:
        increment = random.randint(5, 12)
        new_progress = min(job.progress + increment, 100)
        job.progress = new_progress
        job.processed_rows = int(job.total_rows * (new_progress / 100)) if job.total_rows else 0
        if new_progress >= 100:
            job.status = JobStatus.DONE
            job.stage = JobStage.DONE
            job.progress = 100
            job.processed_rows = job.total_rows
            job.locked_by = None
            job.lease_until = None
            job.output_result = _build_output_result(job)
            job.add_event(JobEventType.DONE)
        else:
            if new_progress > 75:
                job.stage = JobStage.FINALIZING
            elif job.stage == JobStage.VALIDATING:
                job.stage = JobStage.PROCESSING
            job.add_event(JobEventType.PROGRESS_UPDATED, {"progress": job.progress})
        updated = True

    if updated:
        job.save()
    return updated


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
        if AUTO_ADVANCE:
            for job in queryset:
                _advance_job(job)
        page = self.paginate_queryset(queryset)
        serializer = JobSerializer(page if page is not None else queryset, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return api_response(serializer.data)

    def retrieve(self, request, pk=None):
        job = self.get_object()
        if AUTO_ADVANCE:
            _advance_job(job)
        return api_response(JobSerializer(job).data)

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
        )
        job.add_event(JobEventType.SUBMITTED)
        job.save()
        return api_response(JobSerializer(job).data, status_code=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def retry(self, request, pk=None):
        job = self.get_object()
        if job.status not in {JobStatus.FAILED, JobStatus.DONE}:
            raise exceptions.ValidationError("Only failed or completed jobs can be retried.")
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
        job.add_event(JobEventType.SUBMITTED, {"retried": True, "fromStatus": previous_status})
        job.save()
        return api_response(JobSerializer(job).data)

    @action(detail=True, methods=["post"])
    def replay(self, request, pk=None):
        job = self.get_object()
        if job.status != JobStatus.DLQ:
            raise exceptions.ValidationError("Only DLQ jobs can be replayed.")
        job.status = JobStatus.PENDING
        job.stage = JobStage.VALIDATING
        job.progress = 0
        job.processed_rows = 0
        job.attempts = 0
        job.failure_reason = None
        job.next_retry_at = None
        job.locked_by = None
        job.lease_until = None
        job.add_event(JobEventType.SUBMITTED, {"replayed": True})
        job.save()
        return api_response(JobSerializer(job).data)

    @action(detail=False, methods=["get"])
    def stats(self, request):
        qs = self.get_queryset()
        if AUTO_ADVANCE:
            for job in list(qs):
                _advance_job(job)
            qs = self.get_queryset()
        now = timezone.now()
        one_minute_ago = now - timedelta(minutes=1)
        jobs_per_min = qs.filter(
            status=JobStatus.DONE, updated_at__gte=one_minute_ago
        ).count()
        concurrent_jobs = qs.filter(status=JobStatus.RUNNING).count()
        data = {
            "pending": qs.filter(status=JobStatus.PENDING).count(),
            "running": qs.filter(status=JobStatus.RUNNING).count(),
            "done": qs.filter(status=JobStatus.DONE).count(),
            "failed": qs.filter(status=JobStatus.FAILED).count(),
            "dlq": qs.filter(status=JobStatus.DLQ).count(),
            "jobsPerMin": jobs_per_min,
            "jobsPerMinLimit": getattr(settings, "JOBS_PER_MIN_LIMIT", 8),
            "concurrentJobs": concurrent_jobs,
            "concurrentJobsLimit": getattr(settings, "CONCURRENT_JOBS_LIMIT", 5),
        }
        return api_response(data)

    @action(detail=False, methods=["post"])
    def lease(self, request):
        serializer = WorkerLeaseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        worker_id = data["worker_id"]
        lease_seconds = data.get("lease_seconds", 120)

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
        job.output_result = output_result or _build_output_result(job)
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
