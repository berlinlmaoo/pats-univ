import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/auth';
import { ApiFailure } from './api';

export interface ApiState<T> {
  data: T | null;
  error: ApiFailure | null;
  /** First load only; later refreshes keep showing the previous data. */
  loading: boolean;
  refreshing: boolean;
  /** Pull-to-refresh / retry. */
  reload: () => Promise<void>;
  /** Replace the data after a mutation without refetching. */
  setData: (data: T) => void;
}

/**
 * GET `path` while the screen is focused: loads on focus, optionally polls every `pollMs`
 * (live attendance), and keeps the last good data when a refresh fails (offline).
 * `path` null skips the request.
 */
export function useApi<T>(path: string | null, opts: { pollMs?: number } = {}): ApiState<T> {
  const { call } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const fetchOnce = useCallback(async () => {
    if (!path) return;
    try {
      const next = await call<T>('GET', path);
      if (!alive.current) return;
      setData(next);
      setError(null);
    } catch (err) {
      if (!alive.current) return;
      setError(err instanceof ApiFailure ? err : new ApiFailure('INTERNAL'));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [call, path]);

  const reload = useCallback(async () => {
    setRefreshing(true);
    await fetchOnce();
    if (alive.current) setRefreshing(false);
  }, [fetchOnce]);

  useFocusEffect(
    useCallback(() => {
      void fetchOnce();
      if (!opts.pollMs) return undefined;
      const id = setInterval(() => void fetchOnce(), opts.pollMs);
      return () => clearInterval(id);
    }, [fetchOnce, opts.pollMs]),
  );

  return { data, error, loading, refreshing, reload, setData };
}
