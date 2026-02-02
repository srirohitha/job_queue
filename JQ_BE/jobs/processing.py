import random
import re
import time
from typing import Any

from django.conf import settings


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
    return {
        "required_fields": required_fields,
        "dedupe_on": dedupe_on,
        "drop_nulls": bool(drop_nulls),
        "strict_mode": bool(strict_mode),
        "numeric_field": numeric_field,
        "is_csv_processing": bool(config.get("is_csv_processing", False)),
    }


def _is_null(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    return False


def _validate_email(email: str) -> bool:
    """Validate email format using regex."""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None


def _validate_age(age: Any) -> bool:
    """Validate age is between 0 and 100."""
    try:
        age_num = float(age)
        return 0 < age_num < 100
    except (ValueError, TypeError):
        return False


def _validate_name(name: str) -> bool:
    """Validate name length is greater than 2 letters."""
    if not isinstance(name, str):
        return False
    return len(name.strip()) > 2


def _validate_row_data(row: dict) -> dict:
    """Apply validation logic to row data."""
    validation_errors = []
    
    # Email validation
    if 'email' in row:
        if not _validate_email(str(row['email'])):
            validation_errors.append("Invalid email format")
    
    # Age validation
    if 'age' in row:
        if not _validate_age(row['age']):
            validation_errors.append("Age must be between 0 and 100")
    
    # Name validation
    if 'name' in row:
        if not _validate_name(str(row['name'])):
            validation_errors.append("Name must be greater than 2 letters")
    
    return {
        'is_valid': len(validation_errors) == 0,
        'errors': validation_errors
    }


def _process_rows(rows: list, config: dict) -> dict:
    required_fields = config.get("required_fields", [])
    dedupe_on = config.get("dedupe_on", [])
    drop_nulls = config.get("drop_nulls", False)
    strict_mode = config.get("strict_mode", False)
    required_set = set(required_fields)
    seen = set()
    
    # Check if this is CSV data processing
    is_csv_processing = config.get("is_csv_processing", False)
    is_json_processing = not is_csv_processing  # JSON processing if not CSV
    json_delay_min = float(
        getattr(settings, "JOB_JSON_ROW_DELAY_MIN_SECONDS", 2)
    )
    json_delay_max = float(
        getattr(settings, "JOB_JSON_ROW_DELAY_MAX_SECONDS", json_delay_min)
    )
    csv_row_delay = float(getattr(settings, "JOB_CSV_ROW_DELAY_SECONDS", 0.1))

    valid_rows = []
    invalid_rows = 0
    nulls_dropped = 0
    duplicates_removed = 0

    for row in rows:
        # Add sleep time before validating each row
        if is_csv_processing:
            time.sleep(csv_row_delay)
        elif is_json_processing:
            time.sleep(random.uniform(json_delay_min, json_delay_max))
        
        if not isinstance(row, dict):
            invalid_rows += 1
            continue
        
        # Apply validation logic
        validation_result = _validate_row_data(row)
        if not validation_result['is_valid']:
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


def _compute_numeric_stats(rows: list, numeric_field: str) -> dict | None:
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
