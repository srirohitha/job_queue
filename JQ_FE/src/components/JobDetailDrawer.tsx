import { useState } from 'react';
import { X, Copy, Download, ChevronDown, ChevronRight, RotateCw, Play } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from './ui/sheet';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { Separator } from './ui/separator';
import { Job } from '../types/job';
import { toast } from 'sonner';
import { cn } from './ui/utils';
import { useJobs } from '../context/JobContext';

interface JobDetailDrawerProps {
  job: Job;
  open: boolean;
  onClose: () => void;
}

const statusColors = {
  PENDING: 'bg-gray-100 text-gray-700 border-gray-300',
  THROTTLED: 'bg-amber-100 text-amber-700 border-amber-300',
  RUNNING: 'bg-blue-100 text-blue-700 border-blue-300',
  DONE: 'bg-green-100 text-green-700 border-green-300',
  FAILED: 'bg-red-100 text-red-700 border-red-300',
  DLQ: 'bg-purple-100 text-purple-700 border-purple-300',
};

const stageColors = {
  VALIDATING: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  PROCESSING: 'bg-blue-100 text-blue-700 border-blue-300',
  FINALIZING: 'bg-indigo-100 text-indigo-700 border-indigo-300',
  DONE: 'bg-green-100 text-green-700 border-green-300',
};

const eventColors = {
  SUBMITTED: 'bg-blue-500',
  LEASED: 'bg-indigo-500',
  PROGRESS_UPDATED: 'bg-cyan-500',
  RETRY_SCHEDULED: 'bg-yellow-500',
  THROTTLED: 'bg-amber-500',
  FAILED: 'bg-red-500',
  MOVED_TO_DLQ: 'bg-purple-500',
  DONE: 'bg-green-500',
};

export function JobDetailDrawer({ job, open, onClose }: JobDetailDrawerProps) {
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());
  const { retryJob, replayJob, failJob } = useJobs();

  const copyJobId = async () => {
    await navigator.clipboard.writeText(job.id);
    toast.success('Job ID copied to clipboard');
  };

  const toggleEventExpand = (index: number) => {
    const newExpanded = new Set(expandedEvents);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedEvents(newExpanded);
  };

  const downloadOutput = () => {
    if (job.outputResult?.outputData) {
      const dataStr = JSON.stringify(job.outputResult.outputData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${job.id}_output.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Output downloaded');
    }
  };

  const handleRetry = async () => {
    const updated = await retryJob(job.id);
    if (updated) {
      toast.success('Job queued for retry');
      onClose();
    }
  };

  const handleReplay = async () => {
    const updated = await replayJob(job.id);
    if (updated) {
      toast.success('Job replayed from DLQ');
      onClose();
    }
  };

  const handleFail = async () => {
    const confirmed = window.confirm('Fail this running job? It will stop processing and can be retried from the beginning.');
    if (!confirmed) {
      return;
    }
    const updated = await failJob(job.id, 'Manually failed while processing.');
    if (updated) {
      toast.success('Job failed');
      onClose();
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            <span>Job Details</span>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Job Header */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{job.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <code className="text-xs bg-gray-100 px-2 py-1 rounded flex-1 font-mono">
                  {job.id}
                </code>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={copyJobId}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-600 mb-1">Status</p>
                  <Badge variant="outline" className={cn('border', statusColors[job.status])}>
                    {job.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-gray-600 mb-1">Stage</p>
                  <Badge variant="outline" className={cn('border', stageColors[job.stage])}>
                    {job.stage}
                  </Badge>
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-600 mb-2">Progress</p>
                <Progress value={job.progress} className="h-3" />
                <p className="text-xs text-gray-600 mt-1">
                  {job.progress}% ({job.processedRows.toLocaleString()} / {job.totalRows.toLocaleString()} rows)
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="text-gray-600">Created</p>
                  <p className="font-medium">{formatTimestamp(job.createdAt)}</p>
                </div>
                <div>
                  <p className="text-gray-600">Updated</p>
                  <p className="font-medium">{formatTimestamp(job.updatedAt)}</p>
                </div>
                <div>
                  <p className="text-gray-600">Attempts</p>
                  <p className="font-medium">{job.attempts} / {job.maxAttempts}</p>
                </div>
                {job.lockedBy && (
                  <div>
                    <p className="text-gray-600">Worker</p>
                    <p className="font-medium">{job.lockedBy}</p>
                  </div>
                )}
              </div>

              {job.leaseUntil && (
                <div className="text-xs">
                  <p className="text-gray-600">Lease Until</p>
                  <p className="font-medium">{formatTimestamp(job.leaseUntil)}</p>
                </div>
              )}

              {job.nextRetryAt && (
                <div className="text-xs">
                  <p className="text-gray-600">Next Retry At</p>
                  <p className="font-medium">{formatTimestamp(job.nextRetryAt)}</p>
                </div>
              )}

              {job.failureReason && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-600 font-semibold mb-1">Failure Reason</p>
                  <p className="text-sm text-red-700">{job.failureReason}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                {job.status === 'RUNNING' && (
                  <Button variant="outline" onClick={handleFail} className="flex-1 text-red-600 border-red-200 hover:text-red-700">
                    Fail Job
                  </Button>
                )}
                {(job.status === 'FAILED' || job.status === 'DONE') && (
                  <Button onClick={handleRetry} className="flex-1">
                    <RotateCw className="h-4 w-4 mr-2" />
                    Retry Job
                  </Button>
                )}
                {job.status === 'DLQ' && (
                  <Button onClick={handleReplay} className="flex-1">
                    <Play className="h-4 w-4 mr-2" />
                    Replay Job
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Tabs */}
          <Tabs defaultValue="details" className="w-full">
            <TabsList className="w-full justify-start gap-2 overflow-x-auto flex-nowrap">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="input">Input</TabsTrigger>
              <TabsTrigger value="output">Output</TabsTrigger>
              <TabsTrigger value="events">Events</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Description</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {job.status === 'PENDING' && (
                    <p className="text-gray-700">
                      This job is queued and waiting to be processed. It will be picked up by a worker when one is available.
                    </p>
                  )}
                  {job.status === 'THROTTLED' && (
                    <p className="text-gray-700">
                      This job is throttled due to concurrent job limit. It will be retried automatically when a slot is free (next_run_at). Attempts are not incremented for throttling.
                    </p>
                  )}
                  {job.status === 'RUNNING' && (
                    <p className="text-gray-700">
                      This job is currently being processed. Progress is updated as rows are handled. Attempts shown are only from automatic retries, not manual retriggers.
                    </p>
                  )}
                  {job.status === 'DONE' && (
                    <p className="text-gray-700">
                      This job completed successfully. You can retry it to run again; attempts will reset to 0 on manual retry.
                    </p>
                  )}
                  {(job.status === 'FAILED' || job.status === 'DLQ') && (
                    <div className="space-y-3">
                      {(() => {
                        const reason = job.failureReason || 'Unknown reason';
                        const isRateLimited = /rate limit|concurrent.*limit|jobs per minute|rate limited/i.test(reason);
                        return (
                          <>
                            {isRateLimited && (
                              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                <p className="text-amber-800 font-medium text-xs mb-1">Rate limiting</p>
                                <p className="text-amber-900 text-sm">
                                  This job failed due to rate limiting. Attempts are not consumed for rate limits; you can retry or replay when capacity is available.
                                </p>
                              </div>
                            )}
                            <div>
                              <p className="text-gray-600 text-xs mb-1">Failure reason</p>
                              <p className="text-gray-900">{reason}</p>
                            </div>
                            {job.status === 'DLQ' && (
                              <p className="text-gray-600 text-xs">
                                This job was moved to the Dead Letter Queue after exhausting automatic retries. Use Replay to resubmit; attempts will reset to 0.
                              </p>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {job.status === 'THROTTLED' && job.nextRunAt && (
                    <div className="text-xs text-gray-600">
                      Next run at: <span className="font-medium">{formatTimestamp(job.nextRunAt)}</span>
                    </div>
                  )}

                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="overview" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Job Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {job.inputPayload?.config && (
                    <>
                      <div>
                        <p className="text-gray-600 text-xs mb-1">Required Fields</p>
                        <div className="flex flex-wrap gap-1">
                          {job.inputPayload.config.requiredFields?.map((field: string) => (
                            <Badge key={field} variant="outline" className="text-xs">
                              {field}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-gray-600 text-xs mb-1">Dedupe On</p>
                        <div className="flex flex-wrap gap-1">
                          {job.inputPayload.config.dedupeOn?.map((field: string) => (
                            <Badge key={field} variant="outline" className="text-xs">
                              {field}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      {job.inputPayload.config.numericField && (
                        <div>
                          <p className="text-gray-600 text-xs mb-1">Numeric Field</p>
                          <Badge variant="outline" className="text-xs">
                            {job.inputPayload.config.numericField}
                          </Badge>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-gray-600 text-xs">Drop Nulls</p>
                          <p className="font-medium">
                            {job.inputPayload.config.dropNulls ? 'Yes' : 'No'}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600 text-xs">Strict Mode</p>
                          <p className="font-medium">
                            {job.inputPayload.config.strictMode ? 'Yes' : 'No'}
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="input" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Input Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  {job.inputPayload ? (
                    <>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="text-gray-600">Rows</p>
                          <p className="font-medium">
                            {(job.inputPayload.rows?.length ?? job.totalRows).toLocaleString()}
                          </p>
                        </div>
                        {job.inputPayload.csv_meta && (
                          <div>
                            <p className="text-gray-600">CSV file</p>
                            <p className="font-medium">{job.inputPayload.csv_meta.filename}</p>
                          </div>
                        )}
                        {job.inputPayload.csv_meta && (
                          <div>
                            <p className="text-gray-600">CSV rows</p>
                            <p className="font-medium">
                              {(job.inputPayload.csv_meta.row_count ?? 0).toLocaleString()}
                            </p>
                          </div>
                        )}
                      </div>
                      {job.inputPayload.config && (
                        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <p className="text-gray-600">Required fields</p>
                            <p className="font-medium">
                              {(job.inputPayload.config.requiredFields ?? []).join(', ') || '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-600">Dedupe on</p>
                            <p className="font-medium">
                              {(job.inputPayload.config.dedupeOn ?? []).join(', ') || '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-600">Numeric field</p>
                            <p className="font-medium">
                              {job.inputPayload.config.numericField || '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-600">Strict / Drop nulls</p>
                            <p className="font-medium">
                              {job.inputPayload.config.strictMode ? 'Strict' : 'Relaxed'} /{' '}
                              {job.inputPayload.config.dropNulls ? 'Drop nulls' : 'Keep nulls'}
                            </p>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-gray-500">No input payload available.</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Input Payload</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto text-xs">
                    {JSON.stringify(job.inputPayload, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="output" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Output Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  {job.outputResult && Object.keys(job.outputResult).length > 0 ? (
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-gray-600">Total processed</p>
                        <p className="font-medium">
                          {(job.outputResult.totalProcessed ?? 0).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600">Valid records</p>
                        <p className="font-medium">
                          {(job.outputResult.totalValid ?? 0).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600">Invalid records</p>
                        <p className="font-medium">
                          {(job.outputResult.totalInvalid ?? 0).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600">Duplicates removed</p>
                        <p className="font-medium">
                          {(job.outputResult.duplicatesRemoved ?? 0).toLocaleString()}
                        </p>
                      </div>
                      {(job.outputResult.nullsDropped ?? 0) > 0 && (
                        <div>
                          <p className="text-gray-600">Nulls dropped</p>
                          <p className="font-medium">
                            {(job.outputResult.nullsDropped ?? 0).toLocaleString()}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">No output available yet.</p>
                  )}
                </CardContent>
              </Card>
              {job.outputResult && Object.keys(job.outputResult).length > 0 ? (
                <>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle className="text-base">Summary Report</CardTitle>
                      <Button variant="outline" size="sm" onClick={downloadOutput}>
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600 text-xs">Total Processed</p>
                          <p className="text-lg font-semibold">
                            {(job.outputResult.totalProcessed ?? 0).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600 text-xs">Valid Records</p>
                          <p className="text-lg font-semibold text-green-600">
                            {(job.outputResult.totalValid ?? 0).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600 text-xs">Invalid Records</p>
                          <p className="text-lg font-semibold text-red-600">
                            {(job.outputResult.totalInvalid ?? 0).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600 text-xs">Duplicates Removed</p>
                          <p className="text-lg font-semibold">
                            {(job.outputResult.duplicatesRemoved ?? 0).toLocaleString()}
                          </p>
                        </div>
                        {(job.outputResult.nullsDropped ?? 0) > 0 && (
                          <div>
                            <p className="text-gray-600 text-xs">Nulls Dropped</p>
                            <p className="text-lg font-semibold">
                              {(job.outputResult.nullsDropped ?? 0).toLocaleString()}
                            </p>
                          </div>
                        )}
                      </div>

                      {job.outputResult.numericStats && (
                        <>
                          <Separator />
                          <div>
                            <p className="text-sm font-medium mb-3">
                              Numeric Statistics: {job.outputResult.numericStats.field}
                            </p>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                              <div className="bg-gray-50 p-3 rounded">
                                <p className="text-gray-600 text-xs">Sum</p>
                                <p className="font-semibold">
                                  {(job.outputResult.numericStats.sum ?? 0).toLocaleString()}
                                </p>
                              </div>
                              <div className="bg-gray-50 p-3 rounded">
                                <p className="text-gray-600 text-xs">Average</p>
                                <p className="font-semibold">
                                  {(job.outputResult.numericStats.avg ?? 0).toFixed(2)}
                                </p>
                              </div>
                              <div className="bg-gray-50 p-3 rounded">
                                <p className="text-gray-600 text-xs">Min</p>
                                <p className="font-semibold">{job.outputResult.numericStats.min ?? 0}</p>
                              </div>
                              <div className="bg-gray-50 p-3 rounded">
                                <p className="text-gray-600 text-xs">Max</p>
                                <p className="font-semibold">{job.outputResult.numericStats.max ?? 0}</p>
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  {job.outputResult.outputData && job.outputResult.outputData.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Output Preview (first 10 rows)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <pre className="bg-gray-50 p-4 rounded-lg overflow-x-auto text-xs">
                          {JSON.stringify(job.outputResult.outputData.slice(0, 10), null, 2)}
                        </pre>
                      </CardContent>
                    </Card>
                  )}
                </>
              ) : (
                <Card>
                  <CardContent className="p-12 text-center text-gray-500">
                    No output available yet
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="events">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Events Timeline</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-0">
                    {job.events.map((event, index) => (
                      <div key={index} className="flex gap-4">
                        {/* Timeline line */}
                        <div className="flex flex-col items-center">
                          <div className={cn('w-3 h-3 rounded-full', eventColors[event.type])} />
                          {index < job.events.length - 1 && (
                            <div className="w-0.5 flex-1 bg-gray-200 min-h-[40px]" />
                          )}
                        </div>

                        {/* Event content */}
                        <div className="flex-1 pb-6">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium text-sm">{event.type}</p>
                              <p className="text-xs text-gray-500">
                                {formatTimestamp(event.timestamp)}
                              </p>
                            </div>
                            {event.metadata && Object.keys(event.metadata).length > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleEventExpand(index)}
                                className="h-6 px-2"
                              >
                                {expandedEvents.has(index) ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                          </div>
                          {expandedEvents.has(index) && event.metadata && (
                            <pre className="mt-2 bg-gray-50 p-2 rounded text-xs overflow-x-auto">
                              {JSON.stringify(event.metadata, null, 2)}
                            </pre>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
