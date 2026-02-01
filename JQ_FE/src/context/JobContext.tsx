import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { CreateJobInput, createJob, deleteJob, fetchJobs, replayJob, retryJob } from '../lib/api';
import { Job } from '../types/job';
import { useAuth } from './AuthContext';

interface JobContextType {
  jobs: Job[];
  isLoading: boolean;
  refreshJobs: () => Promise<void>;
  submitJob: (input: CreateJobInput) => Promise<Job | null>;
  retryJob: (jobId: string) => Promise<Job | null>;
  replayJob: (jobId: string) => Promise<Job | null>;
  deleteJob: (jobId: string) => Promise<boolean>;
}

const JobContext = createContext<JobContextType | undefined>(undefined);

export function JobProvider({ children }: { children: ReactNode }) {
  const { token, isBootstrapping } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refreshJobs = useCallback(async () => {
    if (!token) {
      setJobs([]);
      return;
    }
    setIsLoading(true);
    try {
      const data = await fetchJobs(token);
      setJobs(data);
    } catch (error: any) {
      setJobs([]);
      toast.error(error?.message || 'Failed to load jobs');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const submitJob = useCallback(
    async (input: CreateJobInput) => {
      if (!token) {
        toast.error('Please sign in to submit jobs');
        return null;
      }
      try {
        const job = await createJob(token, input);
        setJobs(prev => {
          const existingIndex = prev.findIndex(existing => existing.id === job.id);
          if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex] = job;
            return updated;
          }
          return [job, ...prev];
        });
        return job;
      } catch (error: any) {
        toast.error(error?.message || 'Failed to submit job');
        return null;
      }
    },
    [token]
  );

  const handleRetryJob = useCallback(
    async (jobId: string) => {
      if (!token) {
        toast.error('Please sign in to retry jobs');
        return null;
      }
      try {
        const updated = await retryJob(token, jobId);
        setJobs(prev => prev.map(job => (job.id === updated.id ? updated : job)));
        return updated;
      } catch (error: any) {
        toast.error(error?.message || 'Failed to retry job');
        return null;
      }
    },
    [token]
  );

  const handleReplayJob = useCallback(
    async (jobId: string) => {
      if (!token) {
        toast.error('Please sign in to replay jobs');
        return null;
      }
      try {
        const updated = await replayJob(token, jobId);
        setJobs(prev => prev.map(job => (job.id === updated.id ? updated : job)));
        return updated;
      } catch (error: any) {
        toast.error(error?.message || 'Failed to replay job');
        return null;
      }
    },
    [token]
  );

  const handleDeleteJob = useCallback(
    async (jobId: string) => {
      if (!token) {
        toast.error('Please sign in to delete jobs');
        return false;
      }
      try {
        await deleteJob(token, jobId);
        setJobs(prev => prev.filter(job => job.id !== jobId));
        return true;
      } catch (error: any) {
        toast.error(error?.message || 'Failed to delete job');
        return false;
      }
    },
    [token]
  );

  useEffect(() => {
    if (!isBootstrapping) {
      refreshJobs();
    }
  }, [isBootstrapping, refreshJobs]);

  return (
    <JobContext.Provider
      value={{
        jobs,
        isLoading,
        refreshJobs,
        submitJob,
        retryJob: handleRetryJob,
        replayJob: handleReplayJob,
        deleteJob: handleDeleteJob,
      }}
    >
      {children}
    </JobContext.Provider>
  );
}

export function useJobs() {
  const context = useContext(JobContext);
  if (context === undefined) {
    throw new Error('useJobs must be used within a JobProvider');
  }
  return context;
}
