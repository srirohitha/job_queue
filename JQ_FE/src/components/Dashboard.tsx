import { Clock, PlayCircle, CheckCircle, XCircle, AlertTriangle, Gauge, Users } from 'lucide-react';
import { SummaryCard } from './SummaryCard';
import { JobSubmitPanel } from './JobSubmitPanel';
import { JobsTable } from './JobsTable';
import { getDashboardStats } from '../lib/mock-data';
import { useJobPolling } from '../hooks/useJobPolling';
import { useJobs } from '../context/JobContext';

export function Dashboard() {
  const { jobs, submitJob, refreshJobs } = useJobs();
  const autoRefresh = true;
  const stats = getDashboardStats(jobs);

  // Enable polling for real-time updates
  useJobPolling({
    onPoll: refreshJobs,
    enabled: autoRefresh,
    interval: 3000
  });

  return (
    <div className="p-4 md:p-8 space-y-8">
      {/* Summary Cards */}
      <div>
        <h2 className="text-2xl font-semibold mb-4">Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
          <SummaryCard
            title="Pending"
            value={stats.pending}
            icon={Clock}
            color="gray"
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
            subtitle={`${Math.round((stats.jobsPerMin / stats.jobsPerMinLimit) * 100)}% quota used`}
          />
          <SummaryCard
            title="Concurrent Jobs"
            value={`${stats.concurrentJobs} / ${stats.concurrentJobsLimit}`}
            icon={Users}
            color="green"
            subtitle={`${Math.round((stats.concurrentJobs / stats.concurrentJobsLimit) * 100)}% quota used`}
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