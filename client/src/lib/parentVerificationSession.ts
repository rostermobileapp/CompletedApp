/** In-memory only: never persist parent authority with the shared login. */
export function createParentVerificationSessionStore(now = () => Date.now()) {
  let saved: { token: string; subject: string; session: string; expires: number } | undefined;
  let revision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const identity = (accessToken: string) => {
    try {
      const claims = JSON.parse(atob(accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (typeof claims.sub !== "string" || typeof claims.session_id !== "string") return null;
      return { subject: claims.sub, session: claims.session_id };
    } catch { return null; }
  };
  const changed = () => { revision++; listeners.forEach(listener => listener()); };
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (saved) { saved = undefined; changed(); }
  };
  return {
    clear,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    snapshot: () => revision,
    save(accessToken: string, verificationToken: string, seconds: number) {
      const actor = identity(accessToken);
      if (!actor || !/^[A-Za-z0-9_-]{43}$/.test(verificationToken) || !Number.isFinite(seconds) || seconds <= 0 || seconds > 600) {
        throw new Error("Invalid parent verification result.");
      }
      if (timer) clearTimeout(timer);
      saved = { ...actor, token: verificationToken, expires: now() + seconds * 1000 };
      timer = setTimeout(clear, seconds * 1000);
      changed();
    },
    headers(accessToken?: string): Record<string, string> {
      if (!saved) return {};
      const actor = accessToken ? identity(accessToken) : null;
      if (!actor || saved.expires <= now() || saved.subject !== actor.subject || saved.session !== actor.session) {
        clear();
        return {};
      }
      return { "x-parent-verification": saved.token };
    },
  };
}
export const parentVerificationSession = createParentVerificationSessionStore();
export const isDevParentClient = import.meta.env?.DEV === true && import.meta.env?.VITE_ISOLATED_DEVELOPMENT === "true";
