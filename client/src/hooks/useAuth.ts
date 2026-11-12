import { useSyncExternalStore } from "react";
import { supabase, clearStaleSession } from "@/lib/supabase";
import { createAuthSessionController } from "@/lib/authSessionController";

const controller = createAuthSessionController({
  getSession: () => supabase.auth.getSession(),
  refreshSession: () => supabase.auth.refreshSession(),
  clearSession: clearStaleSession,
  async validateSession(accessToken) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch("/api/user", {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });
      if (response.status === 401) return "rejected";
      return response.ok ? "valid" : "unavailable";
    } catch {
      return "unavailable";
    } finally {
      window.clearTimeout(timeout);
    }
  },
  listen(callback) {
    supabase.auth.onAuthStateChange(callback);
  },
});

export function useAuth() {
  const { user, isLoading } = useSyncExternalStore(
    controller.subscribe, controller.getSnapshot, controller.getSnapshot,
  );
  return { user, isLoading, isAuthenticated: !!user };
}
