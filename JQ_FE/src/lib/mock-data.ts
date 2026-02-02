import { Job, JobEvent, DashboardStats } from '../types/job';

export const generateJobId = (): string => {
  return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

export const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const sampleEvents: JobEvent[] = [
  { type: 'SUBMITTED', timestamp: new Date(Date.now() - 600000).toISOString() },
  { type: 'LEASED', timestamp: new Date(Date.now() - 540000).toISOString(), metadata: { worker: 'worker-01' } },
  { type: 'PROGRESS_UPDATED', timestamp: new Date(Date.now() - 480000).toISOString(), metadata: { progress: 25 } },
  { type: 'PROGRESS_UPDATED', timestamp: new Date(Date.now() - 420000).toISOString(), metadata: { progress: 50 } },
  { type: 'PROGRESS_UPDATED', timestamp: new Date(Date.now() - 360000).toISOString(), metadata: { progress: 75 } },
  { type: 'DONE', timestamp: new Date(Date.now() - 300000).toISOString() },
];

export const mockJobs: Job[] = [
  {
    id: 'job_1738363200_abc123',
    label: 'Customer Data Import - Q1 2024',
    status: 'DONE',
    stage: 'DONE',
    progress: 100,
    processedRows: 15420,
    totalRows: 15420,
    attempts: 1,
    maxAttempts: 3,
    createdAt: new Date(Date.now() - 600000).toISOString(),
    updatedAt: new Date(Date.now() - 300000).toISOString(),
    inputPayload: {
      rows: [
        { id: 1, name: 'John Doe', email: 'john@example.com', age: 32 },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com', age: 28 }
      ],
      config: {
        requiredFields: ['id', 'email'],
        dropNulls: true,
        dedupeOn: ['email'],
        numericField: 'age',
        strictMode: false
      }
    },
    outputResult: {
      totalProcessed: 15420,
      totalValid: 15420,
      totalInvalid: 0,
      duplicatesRemoved: 23,
      nullsDropped: 5,
      numericStats: {
        field: 'age',
        sum: 492480,
        avg: 31.94,
        min: 18,
        max: 67
      },
      outputData: [
        { id: 1, name: 'John Doe', email: 'john@example.com', age: 32 },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com', age: 28 }
      ]
    },
    events: sampleEvents
  },
  {
    id: 'job_1738363140_def456',
    label: 'Sales Data Processing',
    status: 'RUNNING',
    stage: 'PROCESSING',
    progress: 62,
    processedRows: 6200,
    totalRows: 10000,
    attempts: 1,
    maxAttempts: 3,
    createdAt: new Date(Date.now() - 180000).toISOString(),
    updatedAt: new Date(Date.now() - 5000).toISOString(),
    lockedBy: 'worker-02',
    leaseUntil: new Date(Date.now() + 120000).toISOString(),
    inputPayload: {
      rows: [
        { order_id: 1001, amount: 299.99, customer: 'ACME Corp', date: '2024-01-15' },
        { order_id: 1002, amount: 1499.99, customer: 'TechStart Inc', date: '2024-01-16' }
      ],
      config: {
        requiredFields: ['order_id', 'amount'],
        dropNulls: true,
        dedupeOn: ['order_id'],
        numericField: 'amount',
        strictMode: true
      }
    },
    events: [
      { type: 'SUBMITTED', timestamp: new Date(Date.now() - 180000).toISOString() },
      { type: 'LEASED', timestamp: new Date(Date.now() - 170000).toISOString(), metadata: { worker: 'worker-02' } },
      { type: 'PROGRESS_UPDATED', timestamp: new Date(Date.now() - 120000).toISOString(), metadata: { progress: 30 } },
      { type: 'PROGRESS_UPDATED', timestamp: new Date(Date.now() - 60000).toISOString(), metadata: { progress: 62 } }
    ]
  },
  {
    id: 'job_1738363080_ghi789',
    label: 'Inventory Sync',
    status: 'PENDING',
    stage: 'VALIDATING',
    progress: 0,
    processedRows: 0,
    totalRows: 5000,
    attempts: 0,
    maxAttempts: 3,
    createdAt: new Date(Date.now() - 60000).toISOString(),
    updatedAt: new Date(Date.now() - 60000).toISOString(),
    inputPayload: {
      rows: [
        { sku: 'WIDGET-001', quantity: 150, warehouse: 'WH-A' },
        { sku: 'WIDGET-002', quantity: 75, warehouse: 'WH-B' }
      ],
      config: {
        requiredFields: ['sku'],
        dropNulls: false,
        dedupeOn: ['sku'],
        numericField: 'quantity',
        strictMode: false
      }
    },
    events: [
      { type: 'SUBMITTED', timestamp: new Date(Date.now() - 60000).toISOString() }
    ]
  },
  {
    id: 'job_1738363020_jkl012',
    label: 'User Analytics Export',
    status: 'FAILED',
    stage: 'PROCESSING',
    progress: 45,
    processedRows: 2250,
    totalRows: 5000,
    attempts: 3,
    maxAttempts: 3,
    createdAt: new Date(Date.now() - 900000).toISOString(),
    updatedAt: new Date(Date.now() - 720000).toISOString(),
    nextRetryAt: new Date(Date.now() + 300000).toISOString(),
    failureReason: 'Validation error: Required field "email" missing in row 2251',
    inputPayload: {
      rows: [
        { user_id: 'u001', email: 'user1@example.com', sessions: 42 },
        { user_id: 'u002', sessions: 15 }
      ],
      config: {
        requiredFields: ['user_id', 'email'],
        dropNulls: false,
        dedupeOn: ['user_id'],
        numericField: 'sessions',
        strictMode: true
      }
    },
    events: [
      { type: 'SUBMITTED', timestamp: new Date(Date.now() - 900000).toISOString() },
      { type: 'LEASED', timestamp: new Date(Date.now() - 880000).toISOString(), metadata: { worker: 'worker-03' } },
      { type: 'PROGRESS_UPDATED', timestamp: new Date(Date.now() - 840000).toISOString(), metadata: { progress: 30 } },
      { type: 'PROGRESS_UPDATED', timestamp: new Date(Date.now() - 780000).toISOString(), metadata: { progress: 45 } },
      { type: 'FAILED', timestamp: new Date(Date.now() - 720000).toISOString(), metadata: { reason: 'Validation error: Required field "email" missing in row 2251', attempt: 3 } },
      { type: 'RETRY_SCHEDULED', timestamp: new Date(Date.now() - 720000).toISOString(), metadata: { nextRetryAt: new Date(Date.now() + 300000).toISOString() } }
    ]
  },
  {
    id: 'job_1738362960_mno345',
    label: 'Legacy Data Migration',
    status: 'DLQ',
    stage: 'PROCESSING',
    progress: 12,
    processedRows: 1200,
    totalRows: 10000,
    attempts: 3,
    maxAttempts: 3,
    createdAt: new Date(Date.now() - 1800000).toISOString(),
    updatedAt: new Date(Date.now() - 1200000).toISOString(),
    failureReason: 'Critical error: Database connection timeout after 3 retries',
    inputPayload: {
      rows: [
        { legacy_id: 'L001', name: 'Product A', price: 19.99 },
        { legacy_id: 'L002', name: 'Product B', price: 29.99 }
      ],
      config: {
        requiredFields: ['legacy_id'],
        dropNulls: true,
        dedupeOn: ['legacy_id'],
        numericField: 'price',
        strictMode: false
      }
    },
    events: [
      { type: 'SUBMITTED', timestamp: new Date(Date.now() - 1800000).toISOString() },
      { type: 'LEASED', timestamp: new Date(Date.now() - 1780000).toISOString(), metadata: { worker: 'worker-01' } },
      { type: 'PROGRESS_UPDATED', timestamp: new Date(Date.now() - 1740000).toISOString(), metadata: { progress: 12 } },
      { type: 'FAILED', timestamp: new Date(Date.now() - 1700000).toISOString(), metadata: { reason: 'Database connection timeout', attempt: 1 } },
      { type: 'RETRY_SCHEDULED', timestamp: new Date(Date.now() - 1700000).toISOString(), metadata: { nextRetryAt: new Date(Date.now() - 1500000).toISOString() } },
      { type: 'FAILED', timestamp: new Date(Date.now() - 1400000).toISOString(), metadata: { reason: 'Database connection timeout', attempt: 2 } },
      { type: 'RETRY_SCHEDULED', timestamp: new Date(Date.now() - 1400000).toISOString(), metadata: { nextRetryAt: new Date(Date.now() - 1300000).toISOString() } },
      { type: 'FAILED', timestamp: new Date(Date.now() - 1200000).toISOString(), metadata: { reason: 'Database connection timeout', attempt: 3 } },
      { type: 'MOVED_TO_DLQ', timestamp: new Date(Date.now() - 1200000).toISOString(), metadata: { reason: 'Critical error: Database connection timeout after 3 retries' } }
    ]
  }
];

export const getDashboardStats = (jobs: Job[]): DashboardStats => {
  return {
    totalJobs: jobs.length,
    pending: jobs.filter(j => j.status === 'PENDING').length,
    throttled: jobs.filter(j => j.status === 'THROTTLED').length,
    running: jobs.filter(j => j.status === 'RUNNING').length,
    done: jobs.filter(j => j.status === 'DONE').length,
    failed: jobs.filter(j => j.status === 'FAILED').length,
    dlq: jobs.filter(j => j.status === 'DLQ').length,
    retries: jobs.reduce((sum, job) => sum + (job.attempts ?? 0), 0),
    jobsPerMin: 12,
    jobsPerMinLimit: 60,
    concurrentJobs: jobs.filter(j => j.status === 'RUNNING').length,
    concurrentJobsLimit: 10
  };
};
