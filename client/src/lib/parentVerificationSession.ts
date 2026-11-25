import { PARENT_ACTION_SECONDS, PARENT_DEVICE_SECONDS } from "@shared/highSchoolParentCodePolicy";

// The reusable proof is an HttpOnly cookie, not a JS-readable token. This key
// contains only UI expiry/identity metadata; the server always checks authority.
export const parentDeviceMetadataKey = "roster-parent-device";
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type DeviceMetadata = { subject: string; session: string; expires: number; deviceId: string };
type SavedProof = Omit<DeviceMetadata, "deviceId"> & { token?: string; deviceId?: string };
const browserStorage = () => {
  try { return typeof window !== "undefined" ? window.localStorage : undefined; } catch { return undefined; }
};
const forgetBrowserDevice = async (deviceId?: string) => {
  if (typeof window === "undefined") return;
  const response = await fetch("/api/high-school/parent-verification/forget-device", {
    method: "POST", credentials: "same-origin", cache: "no-store", keepalive: true,
    headers: { "Content-Type": "application/json", "x-parent-device-action": "forget" },
    body: JSON.stringify(deviceId ? { deviceId } : {}),
  });
  if (!response.ok) throw new Error("Parent device could not be forgotten.");
};

export function createParentVerificationSessionStore(
  now = () => Date.now(),
  options: { storage?: StorageLike; forgetDevice?: (deviceId?: string) => Promise<void> } = {},
) {
  const storage = options.storage ?? browserStorage();
  const forgetDevice = options.forgetDevice ?? forgetBrowserDevice;
  let saved: SavedProof | undefined;
  let revision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let socketProof: { token: string; expires: number; deviceId: string } | undefined;
  let socketWork: Promise<string | undefined> | undefined;
  const listeners = new Set<() => void>();
  const identity = (accessToken: string) => {
    try {
      const claims = JSON.parse(atob(accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (typeof claims.sub !== "string" || typeof claims.session_id !== "string") return null;
      return { subject: claims.sub, session: claims.session_id };
    } catch { return null; }
  };
  const changed = () => { revision++; listeners.forEach(listener => listener()); };
  const readMetadata = (): DeviceMetadata | undefined => {
    try {
      const raw = storage?.getItem(parentDeviceMetadataKey);
      if (!raw) return;
      const value = JSON.parse(raw);
      if (typeof value.subject === "string" && typeof value.session === "string"
          && typeof value.deviceId === "string" && /^[a-f0-9]{64}$/.test(value.deviceId)
          && Number.isFinite(value.expires) && value.expires > now()
          && value.expires <= now() + PARENT_DEVICE_SECONDS * 1000) {
        // Never load arbitrary token fields from local storage.
        return { subject: value.subject, session: value.session, deviceId: value.deviceId, expires: value.expires };
      }
    } catch { /* Corrupt/unavailable UI metadata cannot create authority. */ }
  };
  const clear = (settings: { forgetDevice?: boolean } = {}) => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    const previous = saved;
    const stored = readMetadata();
    try {
      // A delayed event from another account must not erase newer UI metadata.
      if (!stored || !previous?.deviceId || stored.deviceId === previous.deviceId) storage?.removeItem(parentDeviceMetadataKey);
    } catch { /* Server revocation does not depend on writable browser storage. */ }
    saved = undefined;
    socketProof = undefined;
    socketWork = undefined;
    if (previous) changed();
    if (settings.forgetDevice !== false) {
      // The server consumes only the matching cookie grant. A delayed response
      // does not clear a cookie from a newer verification.
      void forgetDevice(previous?.deviceId ?? stored?.deviceId).catch(() => {
        // Local parent state is already gone. All server requests still check
        // the real actor/session; child requests never send provider cookies.
      });
    }
  };
  const armExpiry = () => {
    if (timer) clearTimeout(timer);
    if (!saved) return;
    // Thirty days exceeds the signed 32-bit browser timer limit. Re-arm instead
    // of overflowing into an immediate timeout.
    timer = setTimeout(() => {
      if (saved && saved.expires > now()) armExpiry();
      else clear();
    }, Math.min(Math.max(0, saved.expires - now()), 2_147_483_647));
    (timer as any).unref?.();
  };
  saved = readMetadata();
  armExpiry();
  return {
    clear,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    snapshot: () => revision,
    save(accessToken: string, verificationToken: string, seconds: number) {
      const actor = identity(accessToken);
      if (!actor || !/^[A-Za-z0-9_-]{43}$/.test(verificationToken) || !Number.isFinite(seconds) || seconds <= 0 || seconds > PARENT_ACTION_SECONDS) {
        throw new Error("Invalid parent verification result.");
      }
      saved = { ...actor, token: verificationToken, expires: now() + seconds * 1000 };
      armExpiry();
      changed();
    },
    remember(accessToken: string, deviceId: string, seconds: number) {
      const actor = identity(accessToken);
      if (!actor || !/^[a-f0-9]{64}$/.test(deviceId) || !Number.isFinite(seconds) || seconds <= 0 || seconds > PARENT_DEVICE_SECONDS) {
        throw new Error("Invalid parent device verification result.");
      }
      const metadata: DeviceMetadata = { ...actor, deviceId, expires: now() + seconds * 1000 };
      let persisted = false;
      try {
        const encoded = JSON.stringify(metadata);
        storage?.setItem(parentDeviceMetadataKey, encoded);
        persisted = storage?.getItem(parentDeviceMetadataKey) === encoded;
      } catch { /* The caller explicitly reports session-only access. */ }
      saved = metadata;
      armExpiry();
      changed();
      return persisted;
    },
    sync() {
      const metadata = readMetadata();
      if (JSON.stringify(metadata) === JSON.stringify(saved)) return;
      saved = metadata;
      armExpiry();
      changed();
    },
    headers(accessToken?: string): Record<string, string> {
      if (!saved || !accessToken) return {};
      const actor = identity(accessToken);
      if (!actor || saved.expires <= now() || saved.subject !== actor.subject || saved.session !== actor.session) {
        clear();
        return {};
      }
      return saved.token ? { "x-parent-verification": saved.token }
        : saved.deviceId ? { "x-parent-device-id": saved.deviceId } : {};
    },
    async socketGrant(accessToken: string): Promise<string | undefined> {
      const actor = identity(accessToken);
      if (!saved || !actor || saved.expires <= now() || actor.subject !== saved.subject || actor.session !== saved.session) return;
      if (saved.token) return saved.token;
      if (socketProof && socketProof.expires > now() + 5000 && socketProof.deviceId === saved.deviceId) return socketProof.token;
      if (socketWork) return socketWork;
      const expected = saved, expectedRevision = revision;
      const work = (async () => {
        const response = await fetch("/api/high-school/parent-verification/socket-grant", {
          method: "POST", cache: "no-store", credentials: "same-origin",
          headers: { Authorization: `Bearer ${accessToken}`, "x-parent-device-id": expected.deviceId! },
        });
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) clear();
          throw new Error("Parent socket verification is unavailable.");
        }
        const value = await response.json();
        if (saved !== expected || revision !== expectedRevision) throw new Error("Parent device changed during socket verification.");
        if (!/^[A-Za-z0-9_-]{43}$/.test(value.verificationToken) || !Number.isFinite(value.expiresInSeconds)
            || value.expiresInSeconds <= 0 || value.expiresInSeconds > PARENT_ACTION_SECONDS) throw new Error("Invalid parent socket verification.");
        socketProof = { token: value.verificationToken, expires: Math.min(expected.expires, now() + value.expiresInSeconds * 1000), deviceId: expected.deviceId! };
        return socketProof.token;
      })();
      socketWork = work;
      try { return await work; } finally { if (socketWork === work) socketWork = undefined; }
    },
  };
}
export const parentVerificationSession = createParentVerificationSessionStore();
if (typeof window !== "undefined") {
  window.addEventListener("storage", event => {
    if (event.key === parentDeviceMetadataKey || event.key === null) parentVerificationSession.sync();
  });
}
export const isDevParentClient = import.meta.env?.DEV === true && import.meta.env?.VITE_ISOLATED_DEVELOPMENT === "true";
export const isParentSecurityClient = isDevParentClient || import.meta.env?.PROD === true;
