import { useEffect, useRef } from 'react';

interface UseJobPollingProps {
  enabled: boolean;
  interval?: number;
  onPoll: () => void | Promise<void>;
}

export function useJobPolling({ enabled, interval = 3000, onPoll }: UseJobPollingProps) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      onPoll();
    }, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, interval, onPoll]);
}
