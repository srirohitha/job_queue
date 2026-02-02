# Job Queue Backend (Django + DRF)

## Setup

1. Create and activate a virtual environment.
2. Install dependencies:
   `pip install -r requirements.txt`
3. Run migrations:
   `python manage.py migrate`
4. Start the server:
   `python manage.py runserver`

The API will be available at `http://localhost:8000/api`.

## Background Processing (Celery + Redis)

This backend uses Celery for job processing and Redis as the broker.

1. Start Redis (default `redis://localhost:6379/0`).
2. Start the Celery worker (job processing queue):
   `celery -A jq_be worker -l info -Q jobs`
3. Start the Celery beat scheduler (retry/DLQ reconciliation):
   `celery -A jq_be beat -l info`
4. Start the reconciliation worker (handles retries/DLQ):
   `celery -A jq_be worker -l info -Q reconcile --pool=solo`

You can override defaults with:
- `CELERY_BROKER_URL`
- `CELERY_RESULT_BACKEND`
- `JOBS_PER_MIN_LIMIT`
- `CONCURRENT_JOBS_LIMIT`
- `JOB_LEASE_SECONDS`
- `JOB_RETRY_DELAY_SECONDS`
- `JOB_PENDING_TIMEOUT_SECONDS`
- `JOB_RETRY_SCAN_SECONDS`

## Auto-scaling workers (design notes)

We do not auto-scale workers in this repo, but this is how it would work with the current design:

- **Scale driver**: monitor Redis queue depth for `jobs` + job latency (time since `SUBMITTED`).
- **Decision**: if queue depth or latency crosses a threshold for N intervals, add workers; if both stay low for M minutes, scale down.
- **Mechanics**: run workers in containers (e.g., Docker/K8s). Use a simple HPA rule on Redis list length or a custom metric (queued jobs count).
- **Concurrency**: each worker can run multiple jobs if the pool supports it (threads/gevent). On Windows with `solo`, scale by adding more worker processes instead.
- **Safety**: keep `CONCURRENT_JOBS_LIMIT` enforced in the DB to avoid stampede even if workers scale up quickly.

Implementation outline (example):

- **Export metrics**: expose queue depth and oldest job age (Redis list length + oldest `Job.created_at`).
- **Autoscaler**: run a small service that polls those metrics and updates worker replicas.
- **K8s approach**: use HPA with a custom metric (queued jobs) and set min/max replicas (e.g., 1–10).
- **Non-K8s approach**: run a supervisor (systemd/supervisord) that starts/stops worker processes based on thresholds.
- **Queues**: scale `jobs` workers aggressively; keep `reconcile` workers at a fixed small count.

## Design trade-offs (short)

- **Retry behavior**: retries start from the beginning (no checkpointing). Simpler and reliable, but redoes work on failures.
- **SQLite locking**: good for local dev; concurrent workers can hit `database is locked`. Production should use Postgres.
- **Progress updates**: CSV updates are batched to reduce DB load. Fewer updates means less granular progress.
- **Throttle vs pending**: we mark new jobs as `THROTTLED` when capacity is full to make waiting explicit in the UI.
- **Observability**: logs include job IDs and event summaries; metrics are lightweight (counts + retry totals) to avoid heavy queries.

## Auth

- Register: `POST /api/auth/register/`
- Login: `POST /api/auth/login/`
- Me: `GET /api/auth/me/` (Token auth)

Use `Authorization: Token <token>` for authenticated requests.

## Jobs

- `GET /api/jobs/` list jobs (scoped to user)
- `POST /api/jobs/` create job (JSON or CSV)
- `GET /api/jobs/{id}/` retrieve job
- `POST /api/jobs/{id}/retry/` retry failed job
- `POST /api/jobs/{id}/replay/` replay DLQ job
- `GET /api/jobs/stats/` basic counts
- Worker actions: `POST /api/jobs/lease/`, `POST /api/jobs/{id}/progress/`,
  `POST /api/jobs/{id}/complete/`, `POST /api/jobs/{id}/fail/`
