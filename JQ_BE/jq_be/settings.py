from pathlib import Path
from datetime import timedelta
import os

import dj_database_url


BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-insecure-secret-key-change-me")
DEBUG = os.getenv("DJANGO_DEBUG", "true").lower() == "true"

ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
    if host.strip()
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework.authtoken",
    "corsheaders",
    "jobs",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "jq_be.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "jq_be.wsgi.application"

DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL:
    DATABASES = {"default": dj_database_url.parse(DATABASE_URL, conn_max_age=600)}
else:
    postgres_db = os.getenv("POSTGRES_DB")
    if postgres_db:
        DATABASES = {
            "default": {
                "ENGINE": "django.db.backends.postgresql",
                "NAME": postgres_db,
                "USER": os.getenv("POSTGRES_USER", "postgres"),
                "PASSWORD": os.getenv("POSTGRES_PASSWORD", ""),
                "HOST": os.getenv("POSTGRES_HOST", "localhost"),
                "PORT": os.getenv("POSTGRES_PORT", "5432"),
            }
        }
    else:
        DATABASES = {
            "default": {
                "ENGINE": "django.db.backends.sqlite3",
                "NAME": BASE_DIR / "db.sqlite3",
                "OPTIONS": {
                    "timeout": 30,
                },
            }
        }

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

JOBS_PER_MIN_LIMIT = int(os.getenv("JOBS_PER_MIN_LIMIT", "4"))
CONCURRENT_JOBS_LIMIT = int(os.getenv("CONCURRENT_JOBS_LIMIT", "2"))

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]
CORS_ALLOW_ALL_ORIGINS = (
    os.getenv("CORS_ALLOW_ALL_ORIGINS", "").lower() == "true" or DEBUG
)
CORS_ALLOW_CREDENTIALS = True

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework.authentication.TokenAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_PAGINATION_CLASS": "jobs.pagination.StandardResultsSetPagination",
    "PAGE_SIZE": 50,
    "EXCEPTION_HANDLER": "jobs.exceptions.custom_exception_handler",
}

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", CELERY_BROKER_URL)
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_DEFAULT_QUEUE = "jobs"
CELERY_IMPORTS = ("jobs.tasks",)
CELERY_TASK_ROUTES = {
    "jobs.proc": {"queue": "jobs"},
    "jobs.reconcile": {"queue": "reconcile"},
}

JOB_LEASE_SECONDS = int(os.getenv("JOB_LEASE_SECONDS", "60"))
JOB_RETRY_DELAY_SECONDS = int(os.getenv("JOB_RETRY_DELAY_SECONDS", "5"))
JOB_THROTTLE_BACKOFF_SECONDS = int(os.getenv("JOB_THROTTLE_BACKOFF_SECONDS", "15"))
JOB_PENDING_TIMEOUT_SECONDS = int(os.getenv("JOB_PENDING_TIMEOUT_SECONDS", "10"))
JOB_RETRY_SCAN_SECONDS = int(os.getenv("JOB_RETRY_SCAN_SECONDS", "5"))
JOB_JSON_ROW_DELAY_MIN_SECONDS = float(
    os.getenv("JOB_JSON_ROW_DELAY_MIN_SECONDS", "2")
)
JOB_JSON_ROW_DELAY_MAX_SECONDS = float(
    os.getenv("JOB_JSON_ROW_DELAY_MAX_SECONDS", "3")
)
JOB_CSV_BATCH_SIZE = int(os.getenv("JOB_CSV_BATCH_SIZE", "2000"))
JOB_CSV_BATCH_DELAY_SECONDS = float(
    os.getenv("JOB_CSV_BATCH_DELAY_SECONDS", "0")
)
JOB_CSV_TARGET_ROWS = int(os.getenv("JOB_CSV_TARGET_ROWS", "50000"))
JOB_CSV_TARGET_SECONDS = float(os.getenv("JOB_CSV_TARGET_SECONDS", "15"))
JOB_CSV_PROGRESS_UPDATES = int(os.getenv("JOB_CSV_PROGRESS_UPDATES", "100"))
JOB_MIN_RUNNING_SECONDS = float(os.getenv("JOB_MIN_RUNNING_SECONDS", "6"))

CELERY_BEAT_SCHEDULE = {
    "jobs-reconcile": {
        "task": "jobs.reconcile",
        "schedule": timedelta(seconds=JOB_RETRY_SCAN_SECONDS),
        "options": {"queue": "reconcile"},
    }
}
