from rest_framework import exceptions, status
from rest_framework.views import exception_handler as drf_exception_handler


def _error_code_from_exception(exc: Exception) -> str:
    if isinstance(exc, exceptions.ValidationError):
        return "validation_error"
    if isinstance(exc, exceptions.NotAuthenticated):
        return "not_authenticated"
    if isinstance(exc, exceptions.AuthenticationFailed):
        return "authentication_failed"
    if isinstance(exc, exceptions.PermissionDenied):
        return "permission_denied"
    if isinstance(exc, exceptions.NotFound):
        return "not_found"
    return "server_error"


def _extract_message(detail) -> str:
    if isinstance(detail, list) and detail:
        return str(detail[0])
    if isinstance(detail, dict) and detail:
        first_value = next(iter(detail.values()))
        if isinstance(first_value, list) and first_value:
            return str(first_value[0])
        return str(first_value)
    return str(detail)


def custom_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        return None

    message = "Request failed."
    if isinstance(exc, exceptions.APIException) and exc.detail:
        message = _extract_message(exc.detail)

    response.data = {
        "success": False,
        "data": None,
        "error": {
            "code": _error_code_from_exception(exc),
            "message": message,
            "details": response.data,
        },
    }
    response.status_code = response.status_code or status.HTTP_500_INTERNAL_SERVER_ERROR
    return response
