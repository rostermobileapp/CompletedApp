import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';

const ACTIVE_KEY = 'roster.demo.active';
const POV_KEY = 'roster.demo.povUserId';

export type DemoUser = { id: string; sourceUserId?: string; displayId?: string; firstName?: string; lastName?: string; email?: string };
type DemoContextValue = {
  isActive: boolean;
  povUserId: string | null;
  status: any;
  users: DemoUser[];
  isAuthorized: boolean;
  isLoading: boolean;
  error: string | null;
  enter: (povUserId?: string | null) => Promise<void>;
  exit: () => Promise<void>;
  setPovUser: (id: string) => Promise<void>;
  sync: () => Promise<{ users: DemoUser[]; povUserId: string | null }>;
  refresh: () => Promise<void>;
};

const DemoContext = createContext<DemoContextValue | undefined>(undefined);

function persistedActive() {
  return typeof window !== 'undefined' && localStorage.getItem(ACTIVE_KEY) === 'true';
}

async function resetDemoQueries() {
  await queryClient.cancelQueries();
  queryClient.clear();
}

function normalizeDemoUsers(payload: any): DemoUser[] {
  const rows = Array.isArray(payload) ? payload
    : Array.isArray(payload?.users) ? payload.users
    : Array.isArray(payload?.povUsers) ? payload.povUsers
    : Array.isArray(payload?.data) ? payload.data
    : [];
  return rows
    .map((user: any) => ({
      ...user,
      // Status/sync map source IDs to fresh demo IDs; /users may use `id`.
      id: user?.id || user?.demoUserId || user?.demoId,
      sourceUserId: user?.sourceUserId || user?.sourceId,
    }))
    .filter((user: DemoUser) => !!user.id);
}

function choosePovUser(users: DemoUser[]) {
  return users.find((user) => user.displayId === 'U00001') || users[0] || null;
}

export function DemoContextProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [isActive, setIsActive] = useState(persistedActive);
  const [povUserId, setPovUserId] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : localStorage.getItem(POV_KEY),
  );
  const [actionError, setActionError] = useState<string | null>(null);

  // This is deliberately a demo control request: queryClient excludes its POV
  // header so the server always authorizes the real signed-in account.
  const statusQuery = useQuery<any>({
    queryKey: ['/api/demo/status'],
    queryFn: async () => (await apiRequest('GET', '/api/demo/status')).json(),
    enabled: isAuthenticated,
    retry: false,
    staleTime: 0,
  });
  const usersQuery = useQuery<any>({
    queryKey: ['/api/demo/users'],
    queryFn: async () => (await apiRequest('GET', '/api/demo/users')).json(),
    enabled: isAuthenticated && !!statusQuery.data && !statusQuery.isError,
    retry: false,
    staleTime: 0,
  });

  const isAuthorized = !!statusQuery.data && !statusQuery.isError &&
    statusQuery.data.allowed !== false && statusQuery.data.authorized !== false;
  useEffect(() => {
    // A forged local value must never keep a non-founder in demo mode.
    if (isActive && statusQuery.isError) {
      localStorage.removeItem(ACTIVE_KEY);
      localStorage.removeItem(POV_KEY);
      setIsActive(false);
      setPovUserId(null);
      void resetDemoQueries();
    }
  }, [isActive, statusQuery.isError]);

  const refresh = useCallback(async () => {
    setActionError(null);
    await statusQuery.refetch();
    await usersQuery.refetch();
  }, [statusQuery, usersQuery]);

  const enter = useCallback(async (nextPov?: string | null) => {
    setActionError(null);
    const status = await statusQuery.refetch();
    if (status.isError || !status.data) {
      const message = (status.error as Error | undefined)?.message || 'You are not allowed to use Demo mode.';
      setActionError(message);
      throw new Error(message);
    }
    // Fetch fresh copied IDs every time. Sync deliberately recreates IDs, so
    // state captured by a previous render is never safe to reuse here.
    let freshUsers: DemoUser[] = [];
    try {
      const usersResponse = await apiRequest('GET', '/api/demo/users');
      freshUsers = normalizeDemoUsers(await usersResponse.json());
    } catch {
      freshUsers = normalizeDemoUsers(status.data);
    }
    const id = nextPov && freshUsers.some((user) => user.id === nextPov)
      ? nextPov
      : choosePovUser(freshUsers)?.id || null;
    if (!id) {
      const message = 'Demo has no copied users. Sync Demo before entering.';
      setActionError(message);
      throw new Error(message);
    }
    await resetDemoQueries();
    localStorage.setItem(ACTIVE_KEY, 'true');
    if (id) localStorage.setItem(POV_KEY, id);
    else localStorage.removeItem(POV_KEY);
    setPovUserId(id || null);
    setIsActive(true);
  }, [povUserId, statusQuery]);

  const exit = useCallback(async () => {
    await resetDemoQueries();
    localStorage.removeItem(ACTIVE_KEY);
    localStorage.removeItem(POV_KEY);
    setPovUserId(null);
    setIsActive(false);
    setActionError(null);
  }, []);

  const setPovUser = useCallback(async (id: string) => {
    await resetDemoQueries();
    localStorage.setItem(POV_KEY, id);
    setPovUserId(id);
  }, []);

  const sync = useCallback(async () => {
    setActionError(null);
    // Stop all demo-scoped traffic and remove the old ID before reset. The
    // sync endpoint itself is a control endpoint and never receives a POV ID.
    await resetDemoQueries();
    localStorage.removeItem(ACTIVE_KEY);
    localStorage.removeItem(POV_KEY);
    setPovUserId(null);
    setIsActive(false);
    try {
      const response = await apiRequest('POST', '/api/demo/sync');
      const result = await response.json();
      let freshUsers = normalizeDemoUsers(result);
      if (!freshUsers.length) {
        try {
          const usersResponse = await apiRequest('GET', '/api/demo/users');
          freshUsers = normalizeDemoUsers(await usersResponse.json());
        } catch {
          // A status response is also supported by older servers.
          const statusResponse = await apiRequest('GET', '/api/demo/status');
          freshUsers = normalizeDemoUsers(await statusResponse.json());
        }
      }
      const newPovUserId = choosePovUser(freshUsers)?.id || null;
      if (!newPovUserId) throw new Error('Demo sync completed but returned no copied users.');
      // Set the new ID first and only then activate Demo requests.
      localStorage.setItem(POV_KEY, newPovUserId);
      setPovUserId(newPovUserId);
      localStorage.setItem(ACTIVE_KEY, 'true');
      setIsActive(true);
      await resetDemoQueries();
      await refresh();
      return { users: freshUsers, povUserId: newPovUserId };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Demo sync failed.';
      setActionError(message);
      // Keep the banner visible with its explicit error, but without any POV
      // header, so a failed reset can never use the deleted copied identity.
      localStorage.setItem(ACTIVE_KEY, 'true');
      setIsActive(true);
      throw error;
    }
  }, [refresh]);

  const value = useMemo(() => ({
    isActive, povUserId, status: statusQuery.data,
    users: normalizeDemoUsers(usersQuery.data).length
      ? normalizeDemoUsers(usersQuery.data)
      : normalizeDemoUsers(statusQuery.data),
    isAuthorized, isLoading: statusQuery.isLoading || usersQuery.isLoading,
    error: actionError || (statusQuery.isError ? (statusQuery.error as Error)?.message || 'Demo access was denied.' : null),
    enter, exit, setPovUser, sync, refresh,
  }), [isActive, povUserId, statusQuery.data, usersQuery.data, isAuthorized, statusQuery.isLoading, usersQuery.isLoading, actionError, statusQuery.isError, statusQuery.error, enter, exit, setPovUser, sync, refresh]);
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) throw new Error('useDemo must be used within DemoContextProvider');
  return context;
}