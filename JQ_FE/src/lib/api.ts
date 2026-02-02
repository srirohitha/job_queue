import { DashboardStats, Job, JobEvent, JobStage, JobStatus } from '../types/job';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api';

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: { message?: string; details?: unknown };
}

interface ApiJob {
  id: string;
  label: string;
  status: JobStatus;
  stage: JobStage;
  progress: number;
  processed_rows: number;
  total_rows: number;
  attempts: number;
  max_attempts: number;
  created_at: string;
  updated_at: string;
  last_ran_at?: string | null;
  locked_by?: string;
  lease_until?: string;
  next_retry_at?: string;
  next_run_at?: string | null;
  throttle_count?: number;
  failure_reason?: string;
  input_payload?: any;
  output_result?: any;
  events?: JobEvent[];
}

interface AuthPayload {
  token: string;
  user: { id: number; username: string; email?: string };
}

const buildHeaders = (token?: string, isFormData?: boolean) => {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Token ${token}`;
  }
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
};

const parseResponse = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    const message = json?.error?.message || json?.message || response.statusText;
    throw new ApiError(message, response.status, json?.error?.details || json);
  }
  if (json && json.success === false) {
    throw new ApiError(json?.error?.message || 'Request failed', response.status, json?.error);
  }
  return json?.data ?? json;
};

const mapJob = (job: ApiJob): Job => ({
  id: job.id,
  label: job.label,
  status: job.status,
  stage: job.stage,
  progress: job.progress,
  processedRows: job.processed_rows,
  totalRows: job.total_rows,
  attempts: job.attempts,
  maxAttempts: job.max_attempts,
  createdAt: job.created_at,
  updatedAt: job.updated_at,
  lastRanAt: job.last_ran_at,
  lockedBy: job.locked_by,
  leaseUntil: job.lease_until,
  nextRetryAt: job.next_retry_at,
  nextRunAt: job.next_run_at,
  throttleCount: job.throttle_count ?? 0,
  failureReason: job.failure_reason,
  inputPayload: job.input_payload,
  outputResult: job.output_result,
  events: job.events ?? [],
});

export interface CreateJobInput {
  label: string;
  inputMode: 'json' | 'csv';
  rows?: any[];
  config: {
    requiredFields: string[];
    dropNulls: boolean;
    dedupeOn: string[];
    numericField?: string;
    strictMode: boolean;
    idempotencyKey?: string;
  };
  csvFile?: File | null;
  maxAttempts?: number;
}

export const loginUser = async (username: string, password: string) => {
  const response = await fetch(`${API_BASE_URL}/auth/login/`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ username, password }),
  });
  return parseResponse<AuthPayload>(response);
};

export const registerUser = async (username: string, email: string, password: string) => {
  const response = await fetch(`${API_BASE_URL}/auth/register/`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ username, email, password }),
  });
  return parseResponse<AuthPayload>(response);
};

export const fetchMe = async (token: string) => {
  const response = await fetch(`${API_BASE_URL}/auth/me/`, {
    headers: buildHeaders(token),
  });
  return parseResponse<AuthPayload['user']>(response);
};

export const fetchJobs = async (token: string) => {
  const response = await fetch(`${API_BASE_URL}/jobs/`, {
    headers: buildHeaders(token),
  });
  const data = await parseResponse<any>(response);
  const items = Array.isArray(data) ? data : data?.items ?? [];
  return items.map(mapJob) as Job[];
};

export const fetchStats = async (token: string) => {
  const response = await fetch(`${API_BASE_URL}/jobs/stats/`, {
    headers: buildHeaders(token),
  });
  return parseResponse<DashboardStats>(response);
};

export const deleteJob = async (token: string, jobId: string) => {
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/`, {
    method: 'DELETE',
    headers: buildHeaders(token),
  });
  return parseResponse<{ id: string }>(response);
};

export const createJob = async (token: string, input: CreateJobInput) => {
  if (input.inputMode === 'csv') {
    if (!input.csvFile) {
      throw new ApiError('CSV file is required.', 400);
    }
    const formData = new FormData();
    formData.append('label', input.label);
    formData.append('input_mode', 'csv');
    formData.append('csv_file', input.csvFile);
    formData.append('config', JSON.stringify(input.config));
    if (input.config.idempotencyKey) {
      formData.append('idempotency_key', input.config.idempotencyKey);
    }
    if (input.maxAttempts) {
      formData.append('max_attempts', String(input.maxAttempts));
    }

    const response = await fetch(`${API_BASE_URL}/jobs/`, {
      method: 'POST',
      headers: buildHeaders(token, true),
      body: formData,
    });
    const data = await parseResponse<ApiJob>(response);
    return mapJob(data);
  }

  const response = await fetch(`${API_BASE_URL}/jobs/`, {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify({
      label: input.label,
      input_mode: 'json',
      payload: {
        rows: input.rows ?? [],
        config: input.config,
      },
      idempotency_key: input.config.idempotencyKey,
      max_attempts: input.maxAttempts,
    }),
  });
  const data = await parseResponse<ApiJob>(response);
  return mapJob(data);
};

export const retryJob = async (token: string, jobId: string) => {
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/retry/`, {
    method: 'POST',
    headers: buildHeaders(token),
  });
  const data = await parseResponse<ApiJob>(response);
  return mapJob(data);
};

export const replayJob = async (token: string, jobId: string) => {
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/replay/`, {
    method: 'POST',
    headers: buildHeaders(token),
  });
  const data = await parseResponse<ApiJob>(response);
  return mapJob(data);
};

export const failJob = async (token: string, jobId: string, reason?: string) => {
  const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/force_fail/`, {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify({ reason }),
  });
  const data = await parseResponse<ApiJob>(response);
  return mapJob(data);
};
