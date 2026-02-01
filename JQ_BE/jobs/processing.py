from typing import Any


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
    }


def _is_null(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    return False


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
