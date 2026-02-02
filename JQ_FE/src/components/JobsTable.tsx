import { useState } from 'react';
import { Copy, ExternalLink, RotateCw, Play, Search, RefreshCw, Calendar, Trash2 } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Progress } from './ui/progress';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { JobDetailDrawer } from './JobDetailDrawer';
import { Job, JobStatus } from '../types/job';
import { toast } from 'sonner';
import { cn } from './ui/utils';
import { useJobs } from '../context/JobContext';
import { useJobPolling } from '../hooks/useJobPolling';

interface JobsTableProps {
  jobs: Job[];
  limit?: number;
  concurrentJobs?: number;
  concurrentJobsLimit?: number;
}

type DisplayStatus = JobStatus | 'RETRYING';

const statusColors: Record<DisplayStatus, string> = {
  PENDING: 'bg-gray-100 text-gray-700 border-gray-300',
  THROTTLED: 'bg-amber-100 text-amber-700 border-amber-300',
  RUNNING: 'bg-blue-100 text-blue-700 border-blue-300',
  DONE: 'bg-green-100 text-green-700 border-green-300',
  FAILED: 'bg-red-100 text-red-700 border-red-300',
  DLQ: 'bg-purple-100 text-purple-700 border-purple-300',
  RETRYING: 'bg-yellow-100 text-yellow-700 border-yellow-300',
};

const stageColors = {
  VALIDATING: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  PROCESSING: 'bg-blue-100 text-blue-700 border-blue-300',
  FINALIZING: 'bg-indigo-100 text-indigo-700 border-indigo-300',
  DONE: 'bg-green-100 text-green-700 border-green-300',
};

export function JobsTable({ jobs, limit, concurrentJobs, concurrentJobsLimit }: JobsTableProps) {
  const { retryJob, replayJob, failJob, deleteJob, refreshJobs, isServerDown } = useJobs();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | JobStatus>('ALL');
  const [timeRange, setTimeRange] = useState('all');
  const [sortBy, setSortBy] = useState('createdAt');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const isOffline = isServerDown;
  const runningCount = concurrentJobs ?? jobs.filter(job => job.status === 'RUNNING').length;
  const runningLimit = concurrentJobsLimit ?? 2;

  const getDisplayStatus = (job: Job): DisplayStatus => {
    if (job.status === 'FAILED' && job.nextRetryAt) {
      return 'RETRYING';
    }
    if (job.status === 'PENDING' && runningCount >= runningLimit) {
      return 'THROTTLED';
    }
    return job.status;
  };

  useJobPolling({
    enabled: autoRefresh,
    interval: 5000,
    onPoll: refreshJobs,
  });

  const copyJobId = async (jobId: string) => {
    await navigator.clipboard.writeText(jobId);
    toast.success('Job ID copied to clipboard');
  };

  const handleRetry = async (job: Job) => {
    const updated = await retryJob(job.id);
    if (updated) {
      toast.success(`Job "${job.label}" queued for retry`);
    }
  };

  const handleReplay = async (job: Job) => {
    const updated = await replayJob(job.id);
    if (updated) {
      toast.success(`Job "${job.label}" replayed from DLQ`);
    }
  };

  const handleFail = async (job: Job) => {
    const confirmed = window.confirm(`Fail job "${job.label}"? It will stop processing and can be retried from the beginning.`);
    if (!confirmed) {
      return;
    }
    const updated = await failJob(job.id, 'Manually failed while processing.');
    if (updated) {
      toast.success(`Job "${job.label}" failed`);
    }
  };

  const handleDelete = async (job: Job) => {
    const confirmed = window.confirm(`Delete job "${job.label}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }
    const removed = await deleteJob(job.id);
    if (removed) {
      toast.success(`Job "${job.label}" deleted`);
    }
  };

  const handleRefresh = async () => {
    await refreshJobs();
    toast.success('Jobs refreshed');
  };

  const normalizeQuery = (value: string) => value.trim().toLowerCase();
  const query = normalizeQuery(searchTerm);
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const matchesTimeRange = (dateString: string) => {
    if (timeRange === 'all') {
      return true;
    }
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
      return false;
    }
    const timestamp = date.getTime();
    if (timeRange === 'today') {
      return timestamp >= startOfToday.getTime();
    }
    const days = timeRange === 'week' ? 7 : 30;
    return timestamp >= now.getTime() - days * 24 * 60 * 60 * 1000;
  };

  const getSortValue = (job: Job) => {
    if (sortBy === 'progress') {
      return job.progress;
    }
    if (sortBy === 'updatedAt') {
      return new Date(job.updatedAt).getTime() || 0;
    }
    return new Date(job.createdAt).getTime() || 0;
  };

  // Filter and sort jobs
  let filteredJobs = jobs.filter(job => {
    const displayStatus = getDisplayStatus(job);
    const matchesSearch = !query ||
      job.id.toLowerCase().includes(query) ||
      job.label.toLowerCase().includes(query);
    const matchesStatus = statusFilter === 'ALL' ||
      displayStatus === statusFilter ||
      (statusFilter === 'FAILED' && displayStatus === 'RETRYING');
    const matchesRange = matchesTimeRange(job.createdAt);
    return matchesSearch && matchesStatus && matchesRange;
  });

  filteredJobs = [...filteredJobs].sort((a, b) => {
    const aValue = getSortValue(a);
    const bValue = getSortValue(b);
    if (aValue === bValue) {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    }
    return bValue - aValue;
  });

  // Apply limit if specified (after sort)
  if (limit) {
    filteredJobs = filteredJobs.slice(0, limit);
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <>
      <Card>
        <CardContent className="p-6">
          {/* Filters */}
          <div className="space-y-4 mb-6">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Search */}
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by job ID or label..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Time Range */}
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-[180px]">
                  <Calendar className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">Last 7 Days</SelectItem>
                  <SelectItem value="month">Last 30 Days</SelectItem>
                </SelectContent>
              </Select>

              {/* Sort */}
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="createdAt">Newest First</SelectItem>
                  <SelectItem value="updatedAt">Recently Updated</SelectItem>
                  <SelectItem value="progress">Progress</SelectItem>
                </SelectContent>
              </Select>

              {/* Refresh */}
              <Button variant="outline" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>

            {/* Status Tabs */}
            <div className="flex items-center justify-between">
              <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <TabsList>
                  <TabsTrigger value="ALL">All</TabsTrigger>
                  <TabsTrigger value="PENDING">Pending</TabsTrigger>
                  <TabsTrigger value="THROTTLED">Throttled</TabsTrigger>
                  <TabsTrigger value="RUNNING">Running</TabsTrigger>
                  <TabsTrigger value="DONE">Done</TabsTrigger>
                  <TabsTrigger value="FAILED">Failed</TabsTrigger>
                  <TabsTrigger value="DLQ">DLQ</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex items-center gap-2">
                <Switch
                  id="auto-refresh"
                  checked={autoRefresh}
                  onCheckedChange={setAutoRefresh}
                />
                <Label htmlFor="auto-refresh" className="text-sm cursor-pointer">
                  Auto-refresh {autoRefresh && '(5s)'}
                </Label>
              </div>
            </div>
          </div>

          {/* Table */}
          {isOffline && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              Server is offline. Showing last known jobs. Retrying in a few seconds.
            </div>
          )}
          {filteredJobs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No jobs found matching your criteria</p>
              <p className="text-sm text-gray-400 mt-1">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Job ID</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="w-[200px]">Progress</TableHead>
                    <TableHead>Attempts</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Ran</TableHead>
                  <TableHead className="text-center">Action</TableHead>
                  <TableHead className="text-center">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredJobs.map((job) => {
                    const displayStatus = getDisplayStatus(job);
                    return (
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
                        <Badge variant="outline" className={cn('border', statusColors[displayStatus])}>
                          {displayStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('border text-xs', stageColors[job.stage])}>
                          {job.stage}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Progress value={job.progress} className="h-2" />
                          <p className="text-xs text-gray-600">
                            {job.progress}% ({job.processedRows.toLocaleString()} / {job.totalRows.toLocaleString()} rows)
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          'text-sm',
                          job.attempts >= job.maxAttempts ? 'text-red-600 font-semibold' : 'text-gray-700'
                        )}>
                          {job.attempts} / {job.maxAttempts}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {formatDate(job.createdAt)}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {job.lastRanAt ? formatDate(job.lastRanAt) : '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          {job.status === 'RUNNING' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleFail(job)}
                              disabled={isOffline}
                              className="text-red-600 border-red-200 hover:text-red-700"
                            >
                              Fail
                            </Button>
                          )}
                          {(job.status === 'FAILED' || job.status === 'DONE') && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRetry(job)}
                              disabled={isOffline}
                            >
                              <RotateCw className="h-4 w-4 mr-1" />
                              Retry
                            </Button>
                          )}
                          {job.status === 'DLQ' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleReplay(job)}
                              disabled={isOffline}
                            >
                              <Play className="h-4 w-4 mr-1" />
                              Replay
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(job)}
                            title="Delete job"
                            className="text-red-600 hover:text-red-700"
                            disabled={isOffline}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedJob(job)}
                          >
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Details
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

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
