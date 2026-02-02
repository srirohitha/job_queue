from typing import Any
import json
import logging

from django.core.exceptions import ValidationError
from django.core.validators import validate_email

logger = logging.getLogger(__name__)


def _normalize_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.startswith("[") and stripped.endswith("]"):
            try:
                parsed = json.loads(stripped)
            except (TypeError, ValueError):
                parsed = None
            if isinstance(parsed, list):
                return [str(item).strip() for item in parsed if str(item).strip()]
        return [item.strip() for item in stripped.split(",") if item.strip()]
    return []


def _normalize_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "y", "on"}:
            return True
        if normalized in {"false", "0", "no", "n", "off", ""}:
            return False
        return default
    return bool(value)

def _normalize_field_key(value: Any) -> str:
    return str(value).strip().lstrip("\ufeff").lower()


def _extract_config(payload: Any) -> dict:
    config = payload.get("config") if isinstance(payload, dict) else {}
    config = config if isinstance(config, dict) else {}
    required_fields = _normalize_list(
        config.get("requiredFields") or config.get("required_fields")
    )
    dedupe_on = _normalize_list(config.get("dedupeOn") or config.get("dedupe_on"))
    drop_nulls = _normalize_bool(
        config.get("dropNulls", config.get("drop_nulls")), default=False
    )
    strict_mode = _normalize_bool(
        config.get("strictMode", config.get("strict_mode")), default=False
    )
    numeric_field = config.get("numericField") or config.get("numeric_field")
    required_fields = [_normalize_field_key(field) for field in required_fields]
    dedupe_on = [_normalize_field_key(field) for field in dedupe_on]
    if isinstance(numeric_field, str):
        numeric_field = _normalize_field_key(numeric_field)
    return {
        "required_fields": required_fields,
        "dedupe_on": dedupe_on,
        "drop_nulls": drop_nulls,
        "strict_mode": strict_mode,
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
    field_lower = _normalize_field_key(field)
    for key, value in row.items():
        if _normalize_field_key(key) == field_lower:
            return value
    return None


def _row_has_field(row: dict, field: str) -> bool:
    field_lower = _normalize_field_key(field)
    for key in row.keys():
        if _normalize_field_key(key) == field_lower:
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
    email_value = _get_value_case_insensitive(row, "email")
    if email_value is not None and not _is_valid_email(email_value):
        return False
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
    
    logger.info(f"=== DEBUG _process_rows config: required_fields={required_fields}, dedupe_on={dedupe_on}, drop_nulls={drop_nulls}, strict_mode={strict_mode} ===")

    for idx, row in enumerate(rows):
        if not isinstance(row, dict):
            logger.info(f"Row {idx}: INVALID - not a dict, type={type(row)}")
            invalid_rows += 1
            continue

        row_keys_lower = {_normalize_field_key(key) for key in row.keys()}
        if required_fields:
            missing_required = [
                field for field in required_fields if field.lower() not in row_keys_lower
            ]
            if missing_required:
                logger.info(f"Row {idx}: INVALID - missing required fields: {missing_required}, row_keys_lower={row_keys_lower}")
                invalid_rows += 1
                continue
            missing_values = [
                field
                for field in required_fields
                if _is_null(_get_value_case_insensitive(row, field))
            ]
            if missing_values:
                logger.info(f"Row {idx}: INVALID - null values in required fields: {missing_values}")
                if drop_nulls:
                    nulls_dropped += 1
                invalid_rows += 1
                continue

        # Strict mode: enforce that ALL fields in the row have non-null values
        # (not just required fields). This is stricter data quality enforcement.
        if strict_mode:
            has_any_null = any(_is_null(value) for value in row.values())
            if has_any_null:
                logger.info(f"Row {idx}: INVALID - strict mode, row contains null/empty values")
                invalid_rows += 1
                continue

        if drop_nulls and not required_fields:
            has_nulls = any(_is_null(value) for value in row.values())
            if has_nulls:
                logger.info(f"Row {idx}: INVALID - drop_nulls enabled and row has null values")
                nulls_dropped += 1
                invalid_rows += 1
                continue

        if not _passes_basic_validation(row):
            # More detailed logging for basic validation
            email_val = _get_value_case_insensitive(row, "email")
            age_val = _get_value_case_insensitive(row, "age")
            name_val = _get_value_case_insensitive(row, "name")
            logger.info(f"Row {idx}: INVALID - basic validation failed. email={email_val!r} valid={_is_valid_email(email_val)}, age={age_val!r} valid={_is_valid_age(age_val)}, name={name_val!r} valid={_is_valid_name(name_val)}")
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
    
    # DEBUG: Log payload structure
    logger.info("=== DEBUG build_output_result ===")
    logger.info(f"payload type: {type(payload)}")
    logger.info(f"payload keys: {list(payload.keys()) if isinstance(payload, dict) else 'N/A'}")
    logger.info(f"raw config from payload: {payload.get('config') if isinstance(payload, dict) else 'N/A'}")
    logger.info(f"parsed config: {config}")
    logger.info(f"total rows: {len(rows)}")
    if rows:
        first_row = rows[0]
        logger.info(f"first row type: {type(first_row)}")
        logger.info(f"first row keys: {list(first_row.keys()) if isinstance(first_row, dict) else 'N/A'}")
        logger.info(f"first row data: {first_row}")
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
