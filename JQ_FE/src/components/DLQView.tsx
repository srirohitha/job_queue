import { useState } from 'react';
import { AlertTriangle, Play, ExternalLink, Copy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { JobDetailDrawer } from './JobDetailDrawer';
import { Job } from '../types/job';
import { toast } from 'sonner';
import { useJobPolling } from '../hooks/useJobPolling';
import { useJobs } from '../context/JobContext';

export function DLQView() {
  const { jobs, replayJob, refreshJobs } = useJobs();
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  // Enable polling for real-time updates
  useJobPolling({
    onPoll: refreshJobs,
    enabled: true,
    interval: 5000
  });

  const dlqJobs = jobs.filter(job => job.status === 'DLQ');

  const copyJobId = async (jobId: string) => {
    await navigator.clipboard.writeText(jobId);
    toast.success('Job ID copied to clipboard');
  };

  const handleReplay = async (job: Job) => {
    const updated = await replayJob(job.id);
    if (updated) {
      toast.success(`Job "${job.label}" replayed from DLQ`);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <>
      <div className="p-4 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold">Dead Letter Queue (DLQ)</h2>
            <p className="text-gray-600">Jobs that have exhausted all retry attempts</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-gray-600 mb-1">Total DLQ Jobs</p>
              <p className="text-3xl font-semibold text-purple-600">{dlqJobs.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-gray-600 mb-1">Critical Errors</p>
              <p className="text-3xl font-semibold text-red-600">
                {dlqJobs.filter(j => j.failureReason?.includes('Critical')).length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-gray-600 mb-1">Ready to Replay</p>
              <p className="text-3xl font-semibold text-green-600">{dlqJobs.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* DLQ Jobs Table */}
        <Card>
          <CardHeader>
            <CardTitle>DLQ Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            {dlqJobs.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="font-semibold text-lg mb-2">No DLQ Jobs</h3>
                <p className="text-gray-600">All jobs are processing successfully!</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Job ID</TableHead>
                      <TableHead>Label</TableHead>
                      <TableHead>Failure Reason</TableHead>
                      <TableHead>Attempts</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Failed At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dlqJobs.map((job) => (
                      <TableRow key={job.id} className="hover:bg-gray-50">
                        <TableCell className="font-mono text-xs">
                          <div className="flex items-center gap-2">
                            <span className="truncate max-w-[150px]" title={job.id}>
                              {job.id}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => copyJobId(job.id)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{job.label}</TableCell>
                        <TableCell>
                          <div className="max-w-md">
                            <p className="text-sm text-red-600 truncate" title={job.failureReason}>
                              {job.failureReason}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="destructive">
                            {job.attempts} / {job.maxAttempts}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {formatTimestamp(job.createdAt)}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {formatTimestamp(job.updatedAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedJob(job)}
                            >
                              <ExternalLink className="h-4 w-4 mr-1" />
                              Details
                            </Button>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleReplay(job)}
                            >
                              <Play className="h-4 w-4 mr-1" />
                              Replay
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Job Detail Drawer */}
      {selectedJob && (
        <JobDetailDrawer
          job={selectedJob}
          open={!!selectedJob}
          onClose={() => setSelectedJob(null)}
        />
      )}
    </>
  );
}