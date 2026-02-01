import { JobsTable } from './JobsTable';
import { useJobs } from '../context/JobContext';

export function JobsView() {
  const { jobs } = useJobs();

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">All Jobs</h2>
        <p className="text-gray-600">View and manage all processing jobs</p>
      </div>
      
      <JobsTable jobs={jobs} />
    </div>
  );
}