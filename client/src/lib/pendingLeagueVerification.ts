type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const KEY = "roster.pending-league-verification";
const LIFETIME = 30 * 60 * 1000;
export type PendingLeagueDraft = {
  values: Record<string, unknown>;
  rink: { facilityId: string; name: string; address: string } | null;
};
const storage = (): StorageLike | undefined => {
  try { return typeof window === "undefined" ? undefined : window.sessionStorage; } catch { return undefined; }
};
/** Form data only, scoped to the account and this tab. Never stores authority. */
export function savePendingLeagueDraft(actorId: string | undefined, draft: PendingLeagueDraft,
  store = storage(), now = Date.now()): boolean {
  if (!actorId || !store) return false;
  try {
    const encoded = JSON.stringify({ actorId, expiresAt: now + LIFETIME, ...draft });
    if (encoded.length > 32_768) return false;
    store.setItem(KEY, encoded);
    return store.getItem(KEY) === encoded;
  } catch { return false; }
}
export function clearPendingLeagueDraft(store = storage()) {
  try { store?.removeItem(KEY); } catch { /* No server or authentication state is stored here. */ }
}
export function readPendingLeagueDraft(actorId: string | undefined, store = storage(),
  now = Date.now()): PendingLeagueDraft | undefined {
  if (!actorId || !store) return;
  try {
    const raw = store.getItem(KEY);
    if (!raw) return;
    if (raw.length > 32_768) { clearPendingLeagueDraft(store); return; }
    const saved = JSON.parse(raw);
    if (saved.actorId !== actorId) return;
    if (!Number.isFinite(saved.expiresAt) || saved.expiresAt <= now || saved.expiresAt > now + LIFETIME ||
      !saved.values || typeof saved.values !== "object" || Array.isArray(saved.values)) {
      clearPendingLeagueDraft(store); return;
    }
    const rink = saved.rink;
    if (rink !== null && (!rink || typeof rink.facilityId !== "string" || typeof rink.name !== "string" || typeof rink.address !== "string")) {
      clearPendingLeagueDraft(store); return;
    }
    return { values: saved.values, rink: rink ? { facilityId: rink.facilityId, name: rink.name, address: rink.address } : null };
  } catch { clearPendingLeagueDraft(store); return; }
}
