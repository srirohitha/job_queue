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
