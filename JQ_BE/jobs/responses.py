from typing import Any

from rest_framework.response import Response


def api_response(data: Any, status_code: int = 200, meta: dict | None = None) -> Response:
    payload = {"success": True, "data": data, "error": None}
    if meta is not None:
        payload["meta"] = meta
    return Response(payload, status=status_code)
