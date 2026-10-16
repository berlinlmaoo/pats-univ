'use client';
import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import { useT } from '@/components/i18n/provider';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ERROR_MESSAGE_KEY } from '@/lib/http/errors';

export function useLoyalty<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const request = useCallback(async () => {
    let response: Response;
    try {
      response = await fetch(url, { cache: 'no-store' });
    } catch {
      throw new Error('errors.network');
    }
    const json = await response.json();
    if (!response.ok)
      throw new Error(
        ERROR_MESSAGE_KEY[json.error?.code as keyof typeof ERROR_MESSAGE_KEY] ??
          'errors.generic',
      );
    return json as T;
  }, [url]);
  const reload = useCallback(async () => {
    try {
      setData(await request());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'errors.generic');
    }
  }, [request]);
  useEffect(() => {
    let active = true;
    void request().then(
      (next) => {
        if (active) {
          setData(next);
          setError('');
        }
      },
      (err: unknown) => {
        if (active)
          setError(err instanceof Error ? err.message : 'errors.generic');
      },
    );
    return () => {
      active = false;
    };
  }, [request]);
  return { data, error, reload, setData };
}
export function DataState({
  error,
  reload,
}: {
  error: string;
  reload: () => void;
}) {
  const t = useT();
  return error ? (
    <EmptyState
      icon={CircleAlert}
      title={t('errors.generic')}
      body={t.loose(error)}
      action={
        <Button variant="secondary" onClick={reload}>
          {t('common.retry')}
        </Button>
      }
    />
  ) : (
    <div
      className="flex justify-center p-16"
      role="status"
      aria-label={t('common.loading')}
    >
      <LoaderCircle className="size-5 animate-spin text-muted" />
    </div>
  );
}
