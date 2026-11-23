/** Only a navigation restriction, never authentication or proof of age. No credentials are stored. */
export function createSignupAgeRestriction(storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">) {
  const key = "roster-dev-signup-parent-required";
  let restricted = false;
  try { restricted = storage?.getItem(key) === "1"; } catch { /* Memory-only if browser storage is unavailable. */ }
  const listeners = new Set<() => void>();
  const update = (value: boolean) => {
    restricted = value;
    try { if (value) storage?.setItem(key, "1"); else storage?.removeItem(key); } catch { /* Keep the current page restricted. */ }
    listeners.forEach(listener => listener());
  };
  return {
    snapshot: () => restricted,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    requireParent: () => update(true),
    allowAdult: () => update(false),
  };
}
const storage = (() => { try { return typeof window !== "undefined" ? window.sessionStorage : undefined; } catch { return undefined; } })();
export const signupAgeRestriction = createSignupAgeRestriction(storage);
