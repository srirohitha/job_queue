from typing import Any

from django.core.exceptions import ValidationError
from django.core.validators import validate_email


def _normalize_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return []


def _extract_config(payload: Any) -> dict:
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
    required_fields = [field.lower() for field in required_fields]
    dedupe_on = [field.lower() for field in dedupe_on]
    if isinstance(numeric_field, str):
        numeric_field = numeric_field.lower()
    return {
        "required_fields": required_fields,
        "dedupe_on": dedupe_on,
        "drop_nulls": bool(drop_nulls),
        "strict_mode": bool(strict_mode),
        "numeric_field": numeric_field,
    }


def _is_null(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    return False


def _get_value_case_insensitive(row: dict, field: str) -> Any:
    if field in row:
        return row.get(field)
    field_lower = field.lower()
    for key, value in row.items():
        if str(key).lower() == field_lower:
            return value
    return None


def _row_has_field(row: dict, field: str) -> bool:
    field_lower = field.lower()
    for key in row.keys():
        if str(key).lower() == field_lower:
            return True
    return False


def _is_valid_email(value: Any) -> bool:
    if value is None:
        return False
    if not isinstance(value, str):
        value = str(value)
    value = value.strip()
    if not value:
        return False
    try:
        validate_email(value)
    except ValidationError:
        return False
    return True


def _is_valid_age(value: Any) -> bool:
    if value is None:
        return False
    try:
        age = float(value)
    except (TypeError, ValueError):
        return False
    return 0 < age < 100


def _is_valid_name(value: Any) -> bool:
    if value is None:
        return False
    if not isinstance(value, str):
        value = str(value)
    return len(value.strip()) > 2


def _passes_basic_validation(row: dict) -> bool:
    if _row_has_field(row, "email") and not _is_valid_email(
        _get_value_case_insensitive(row, "email")
    ):
        return False
    if _row_has_field(row, "age") and not _is_valid_age(
        _get_value_case_insensitive(row, "age")
    ):
        return False
    if _row_has_field(row, "name") and not _is_valid_name(
        _get_value_case_insensitive(row, "name")
    ):
        return False
    return True


def _process_rows(rows: list, config: dict) -> dict:
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

        row_keys_lower = {str(key).lower() for key in row.keys()}
        if required_fields:
            missing_required = [
                field for field in required_fields if field.lower() not in row_keys_lower
            ]
            if missing_required:
                invalid_rows += 1
                continue
            missing_values = [
                field
                for field in required_fields
                if _is_null(_get_value_case_insensitive(row, field))
            ]
            if missing_values:
                if drop_nulls:
                    nulls_dropped += 1
                invalid_rows += 1
                continue

        if strict_mode and required_set:
            extra_fields = row_keys_lower - required_set
            if extra_fields:
                invalid_rows += 1
                continue

        if drop_nulls:
            has_nulls = any(_is_null(value) for value in row.values())
            if has_nulls:
                nulls_dropped += 1
                invalid_rows += 1
                continue

        if not _passes_basic_validation(row):
            invalid_rows += 1
            continue

        if dedupe_on:
            key = tuple(
                str(_get_value_case_insensitive(row, field) or "") for field in dedupe_on
            )
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


def _compute_numeric_stats(rows: list, numeric_field: str) -> dict | None:
    values = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        value = _get_value_case_insensitive(row, numeric_field)
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


def build_output_result(payload: Any) -> dict:
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
