import type { AuthTokens, LoginResponse, MeResponse } from '@pats/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiFailure } from '@/lib/api';
import { storage } from '@/lib/storage';

const TOKENS_KEY = 'pats.tokens';
const ME_KEY = 'pats.me';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface Auth {
  status: Status;
  me: MeResponse | null;
  /** True when the account was loaded from cache because the server was unreachable. */
  offline: boolean;
  signIn: (login: LoginResponse) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-fetches /api/me; returns false when offline. */
  reload: () => Promise<boolean>;
}

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<MeResponse | null>(null);
  const [offline, setOffline] = useState(false);
  const tokens = useRef<AuthTokens | null>(null);
  const refreshing = useRef<Promise<AuthTokens> | null>(null);

  const saveTokens = useCallback(async (next: AuthTokens | null) => {
    tokens.current = next;
    if (next) await storage.set(TOKENS_KEY, JSON.stringify(next));
    else await storage.remove(TOKENS_KEY);
  }, []);

  const clear = useCallback(async () => {
    await saveTokens(null);
    await storage.remove(ME_KEY);
    setMe(null);
    setStatus('signedOut');
  }, [saveTokens]);

  /** Access token that is valid for at least 30 more seconds, refreshing once if needed. */
  const accessToken = useCallback(async (): Promise<string> => {
    const current = tokens.current;
    if (!current) throw new ApiFailure('UNAUTHENTICATED');
    if (new Date(current.accessTokenExpiresAt).getTime() - Date.now() > 30_000) return current.accessToken;
    refreshing.current ??= api.refresh(current.refreshToken).finally(() => {
      refreshing.current = null;
    });
    const next = await refreshing.current;
    await saveTokens(next);
    return next.accessToken;
  }, [saveTokens]);

  const reload = useCallback(async () => {
    try {
      const fresh = await api.get<MeResponse>('/api/me', await accessToken());
      setMe(fresh);
      setOffline(false);
      setStatus('signedIn');
      await storage.set(ME_KEY, JSON.stringify(fresh));
      return true;
    } catch (err) {
      if (err instanceof ApiFailure && err.code === 'NETWORK') {
        setOffline(true);
        return false;
      }
      // Revoked, expired or disabled: back to login.
      await clear();
      return false;
    }
  }, [accessToken, clear]);

  useEffect(() => {
    void (async () => {
      const [rawTokens, rawMe] = await Promise.all([storage.get(TOKENS_KEY), storage.get(ME_KEY)]);
      if (!rawTokens) return setStatus('signedOut');
      tokens.current = JSON.parse(rawTokens) as AuthTokens;
      if (rawMe) {
        setMe(JSON.parse(rawMe) as MeResponse);
        setStatus('signedIn');
      }
      const ok = await reload();
      if (!ok && !rawMe && tokens.current) setStatus('signedIn');
    })();
  }, [reload]);

  const signIn = useCallback(
    async (login: LoginResponse) => {
      const { me: nextMe, ...nextTokens } = login;
      await saveTokens(nextTokens);
      await storage.set(ME_KEY, JSON.stringify(nextMe));
      setMe(nextMe);
      setOffline(false);
      setStatus('signedIn');
    },
    [saveTokens],
  );

  const signOut = useCallback(async () => {
    const refreshToken = tokens.current?.refreshToken;
    if (refreshToken) await api.post('/api/auth/logout', { refreshToken }).catch(() => null);
    await clear();
  }, [clear]);

  const value = useMemo(() => ({ status, me, offline, signIn, signOut, reload }), [status, me, offline, signIn, signOut, reload]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() outside <AuthProvider>');
  return ctx;
}
