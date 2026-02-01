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
2. Start the Celery worker:
   `celery -A jq_be worker -l info`

You can override defaults with:
- `CELERY_BROKER_URL`
- `CELERY_RESULT_BACKEND`
- `JOBS_PER_MIN_LIMIT`
- `CONCURRENT_JOBS_LIMIT`

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
