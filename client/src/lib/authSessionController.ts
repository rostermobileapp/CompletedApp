import type { Session, User } from "@supabase/supabase-js";

export function isTransientAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { name?: string; message?: string; status?: number };
  return value.name === "AuthRetryableFetchError"
    || (typeof value.status === "number" && value.status >= 500)
    || /failed to fetch|network request failed|networkerror|load failed/i.test(value.message ?? "");
}

export async function retryTransientSignIn<T extends { error: unknown }>(
  attempt: () => Promise<T>,
  wait: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 500)),
): Promise<T> {
  try {
    const result = await attempt();
    if (!isTransientAuthError(result.error)) return result;
  } catch (error) {
    if (!isTransientAuthError(error)) throw error;
  }
  await wait();
  return attempt();
}

type SessionResult = {
  data: { session: Session | null };
  error: unknown;
};
type AuthSnapshot = { user: User | null; isLoading: boolean };
type Dependencies = {
  getSession: () => Promise<SessionResult>;
  refreshSession: () => Promise<SessionResult>;
  validateSession: (token: string) => Promise<"valid" | "rejected" | "unavailable">;
  clearSession: () => Promise<void>;
  listen: (callback: (event: string, session: Session | null) => void) => void;
};

// One bootstrap per browser client, not one database-backed validation per
// component using useAuth. All actual API requests still validate their token.
export function createAuthSessionController(dependencies: Dependencies) {
  let snapshot: AuthSnapshot = { user: null, isLoading: true };
  const listeners = new Set<() => void>();
  let started = false;
  let revision = 0;

  const publish = (user: User | null) => {
    snapshot = { user, isLoading: false };
    listeners.forEach(listener => listener());
  };

  async function initialize() {
    const initialRevision = revision;
    const current = () => revision === initialRevision;
    try {
      const { data: { session }, error } = await dependencies.getSession();
      if (!current()) return;
      if (error) {
        if (!isTransientAuthError(error)) {
          await dependencies.clearSession();
        }
        if (current()) publish(isTransientAuthError(error) ? session?.user ?? null : null);
        return;
      }
      if (!session) {
        publish(null);
        return;
      }
      const validation = await dependencies.validateSession(session.access_token);
      if (!current()) return;
      // A transport failure is not evidence that credentials were rejected.
      // Keep the session; protected API routes still enforce authentication.
      if (validation !== "rejected") {
        publish(session.user);
        return;
      }
      const refreshed = await dependencies.refreshSession();
      if (!current()) return;
      if (refreshed.error || !refreshed.data.session) {
        if (isTransientAuthError(refreshed.error)) {
          publish(session.user);
        } else {
          await dependencies.clearSession();
          if (current()) publish(null);
        }
        return;
      }
      publish(refreshed.data.session.user);
    } catch {
      if (current()) publish(null);
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (!started) {
        started = true;
        // This singleton listener lives for the lifetime of the browser client.
        // Never await Supabase operations inside its auth event callback.
        dependencies.listen((event, session) => {
          if (event === "INITIAL_SESSION") return;
          revision++;
          publish(session?.user ?? null);
        });
        void initialize();
      }
      return () => { listeners.delete(listener); };
    },
  };
}
