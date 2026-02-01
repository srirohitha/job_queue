export type JobStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'DLQ';
export type JobStage = 'VALIDATING' | 'PROCESSING' | 'FINALIZING' | 'DONE';
export type EventType = 'SUBMITTED' | 'LEASED' | 'PROGRESS_UPDATED' | 'RETRY_SCHEDULED' | 'FAILED' | 'MOVED_TO_DLQ' | 'DONE';

export interface Job {
  id: string;
  label: string;
  status: JobStatus;
  stage: JobStage;
  progress: number;
  processedRows: number;
  totalRows: number;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
  lockedBy?: string;
  leaseUntil?: string;
  nextRetryAt?: string;
  failureReason?: string;
  inputPayload?: any;
  outputResult?: {
    totalProcessed: number;
    totalValid: number;
    totalInvalid: number;
    duplicatesRemoved: number;
    nullsDropped: number;
    numericStats?: {
      field: string;
      sum: number;
      avg: number;
      min: number;
      max: number;
    };
    outputData?: any[];
  };
  events: JobEvent[];
}

export interface JobEvent {
  type: EventType;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface DashboardStats {
  pending: number;
  running: number;
  done: number;
  failed: number;
  dlq: number;
  jobsPerMin: number;
  jobsPerMinLimit: number;
  concurrentJobs: number;
  concurrentJobsLimit: number;
}
