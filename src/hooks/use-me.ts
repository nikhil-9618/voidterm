'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type Me = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  tier: number;
  createdAt: string;
  lastLoginAt: string | null;
};

type MeResponse = { user: Me };

/**
 * Fetch /api/auth/me and keep it fresh. The server-rendered user is passed as
 * the initial value so the shell renders immediately; a background refresh
 * catches revoked sessions without a full page reload.
 */
export function useMe(initialUser: Me | null = null) {
  const [user, setUser] = useState<Me | null>(initialUser);
  const [loading, setLoading] = useState(!initialUser);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/me', { cache: 'no-store' });
      if (response.status === 401) {
        setUser(null);
        setError(null);
        return;
      }
      if (!response.ok) throw new Error(`Session check failed (${response.status})`);
      const data = (await response.json()) as MeResponse;
      setUser(data.user);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not verify the session');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void refresh();
  }, [refresh]);

  return { user, loading, error, refresh };
}
