from rest_framework import serializers

from .models import Job, JobStage


class JobSerializer(serializers.ModelSerializer):
    class Meta:
        model = Job
        fields = [
            "id",
            "label",
            "status",
            "stage",
            "progress",
            "processed_rows",
            "total_rows",
            "attempts",
            "max_attempts",
            "created_at",
            "updated_at",
            "last_ran_at",
            "locked_by",
            "lease_until",
            "next_retry_at",
            "next_run_at",
            "throttle_count",
            "failure_reason",
            "input_payload",
            "output_result",
            "events",
        ]
        read_only_fields = fields


class JobCreateSerializer(serializers.Serializer):
    INPUT_MODES = (("json", "json"), ("csv", "csv"))

    label = serializers.CharField(max_length=255)
    input_mode = serializers.ChoiceField(choices=INPUT_MODES)
    payload = serializers.JSONField(required=False)
    csv_file = serializers.FileField(required=False)
    max_attempts = serializers.IntegerField(required=False, min_value=1, max_value=10)
    idempotency_key = serializers.CharField(required=False, allow_blank=True, max_length=64)

    def validate(self, attrs):
        input_mode = attrs.get("input_mode")
        payload = attrs.get("payload")
        csv_file = attrs.get("csv_file")

        if input_mode == "json":
            if payload is None:
                raise serializers.ValidationError({"payload": "payload is required."})
            rows = payload.get("rows") if isinstance(payload, dict) else None
            if not isinstance(rows, list):
                raise serializers.ValidationError({"payload": "payload.rows must be a list."})
            if len(rows) == 0:
                raise serializers.ValidationError({"payload": "payload.rows cannot be empty."})
            if any(not isinstance(row, dict) for row in rows):
                raise serializers.ValidationError(
                    {"payload": "payload.rows must contain only objects."}
                )
        elif input_mode == "csv":
            if csv_file is None:
                raise serializers.ValidationError({"csv_file": "csv_file is required."})
        return attrs


class WorkerLeaseSerializer(serializers.Serializer):
    worker_id = serializers.CharField(max_length=64)
    lease_seconds = serializers.IntegerField(required=False, min_value=30, max_value=900)


class WorkerProgressSerializer(serializers.Serializer):
    progress = serializers.IntegerField(min_value=0, max_value=100)
    processed_rows = serializers.IntegerField(min_value=0)
    stage = serializers.ChoiceField(choices=JobStage.choices, required=False)


class WorkerCompleteSerializer(serializers.Serializer):
    output_result = serializers.JSONField(required=False)


class WorkerFailSerializer(serializers.Serializer):
    failure_reason = serializers.CharField()
    retry_in_seconds = serializers.IntegerField(required=False, min_value=30, max_value=86400)


class JobActionSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True)
