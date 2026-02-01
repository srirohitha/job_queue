import { Clock, PlayCircle, CheckCircle, XCircle, AlertTriangle, Gauge, Users } from 'lucide-react';
import { SummaryCard } from './SummaryCard';
import { useCallback, useEffect, useState } from 'react';
import { JobSubmitPanel } from './JobSubmitPanel';
import { JobsTable } from './JobsTable';
import { useJobPolling } from '../hooks/useJobPolling';
import { useJobs } from '../context/JobContext';
import { useAuth } from '../context/AuthContext';
import { fetchStats } from '../lib/api';
import { DashboardStats } from '../types/job';
import { toast } from 'sonner';

export function Dashboard() {
  const { jobs, submitJob, refreshJobs } = useJobs();
  const { token, isBootstrapping } = useAuth();
  const autoRefresh = true;
  const [stats, setStats] = useState<DashboardStats>({
    pending: 0,
    throttled: 0,
    running: 0,
    done: 0,
    failed: 0,
    dlq: 0,
    jobsPerMin: 0,
    jobsPerMinLimit: 4,
    concurrentJobs: 0,
    concurrentJobsLimit: 2,
  });

  const refreshStats = useCallback(async () => {
    if (!token) {
      setStats({
        pending: 0,
        throttled: 0,
        running: 0,
        done: 0,
        failed: 0,
        dlq: 0,
        jobsPerMin: 0,
        jobsPerMinLimit: 4,
        concurrentJobs: 0,
        concurrentJobsLimit: 2,
      });
      return;
    }
    try {
      const data = await fetchStats(token);
      setStats(data);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load dashboard stats');
    }
  }, [token]);

  useEffect(() => {
    if (!isBootstrapping) {
      refreshStats();
    }
  }, [isBootstrapping, refreshStats]);

  // Enable polling for real-time updates
  useJobPolling({
    onPoll: async () => {
      await refreshJobs();
      await refreshStats();
    },
    enabled: autoRefresh,
    interval: 3000
  });

  return (
    <div className="p-4 md:p-8 space-y-8">
      {/* Summary Cards */}
      <div>
        <h2 className="text-2xl font-semibold mb-4">Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
          <SummaryCard
            title="Pending"
            value={stats.pending}
            icon={Clock}
            color="gray"
          />
          <SummaryCard
            title="Throttled"
            value={stats.throttled ?? 0}
            icon={AlertTriangle}
            color="amber"
          />
          <SummaryCard
            title="Running"
            value={stats.running}
            icon={PlayCircle}
            color="blue"
          />
          <SummaryCard
            title="Done"
            value={stats.done}
            icon={CheckCircle}
            color="green"
          />
          <SummaryCard
            title="Failed"
            value={stats.failed}
            icon={XCircle}
            color="red"
          />
          <SummaryCard
            title="DLQ"
            value={stats.dlq}
            icon={AlertTriangle}
            color="purple"
          />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SummaryCard
            title="Jobs Per Minute"
            value={`${stats.jobsPerMin} / ${stats.jobsPerMinLimit}`}
            icon={Gauge}
            color="blue"
            subtitle={`${Math.round((stats.jobsPerMin / Math.max(stats.jobsPerMinLimit, 1)) * 100)}% quota used`}
          />
          <SummaryCard
            title="Concurrent Jobs"
            value={`${stats.concurrentJobs} / ${stats.concurrentJobsLimit}`}
            icon={Users}
            color="green"
            subtitle={`${Math.round((stats.concurrentJobs / Math.max(stats.concurrentJobsLimit, 1)) * 100)}% quota used`}
          />
        </div>
      </div>

      {/* Job Submit Panel */}
      <JobSubmitPanel onJobSubmit={submitJob} />

      {/* Recent Jobs */}
      <div>
        <h2 className="text-2xl font-semibold mb-4">Recent Jobs</h2>
        <JobsTable jobs={jobs} limit={5} />
      </div>
    </div>
  );
}