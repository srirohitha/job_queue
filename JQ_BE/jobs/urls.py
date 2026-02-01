from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AuthLoginView, AuthMeView, AuthRegisterView, JobViewSet


router = DefaultRouter()
router.register("jobs", JobViewSet, basename="jobs")

urlpatterns = [
    path("auth/register/", AuthRegisterView.as_view(), name="auth-register"),
    path("auth/login/", AuthLoginView.as_view(), name="auth-login"),
    path("auth/me/", AuthMeView.as_view(), name="auth-me"),
    path("", include(router.urls)),
]
