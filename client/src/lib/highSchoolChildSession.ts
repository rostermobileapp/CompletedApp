/** Child-only transport. Never reads or forwards a parent/provider session. */
import { parentVerificationSession } from "./parentVerificationSession";
export async function requestChildSession(token: string, method: string, url: string, body?: unknown, signal?: AbortSignal) {
  if (!/^hs_child_[A-Za-z0-9_-]{43}$/.test(token) ||
      !/^\/api\/high-school\/child-device\/(?:session|skin-context|chats\/[0-9a-f-]+\/messages)$/i.test(url)) {
    throw new Error("This action is outside the approved player session.");
  }
  const response = await fetch(url, {
    signal,
    method,
    credentials: "omit",
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const error = new Error(response.status === 401 || response.status === 403
      ? "Player access ended or this chat is not approved. Ask your parent for help."
      : "The player request could not be completed. Try again.");
    throw error;
  }
  return response.json();
}

// Child-only capability, scoped to this tab and server expiry. Parent
// verification is NEVER persisted or inherited by a child session.
const tokenKey="roster-child-session";
const childStorage=(()=>{try{return typeof window!=="undefined"?window.sessionStorage:undefined;}catch{return undefined;}})();
let childToken: string | null = (()=>{try{const token=childStorage?.getItem(tokenKey);return token&&/^hs_child_[A-Za-z0-9_-]{43}$/.test(token)?token:null;}catch{return null;}})();
let revision = 0;
const listeners = new Set<() => void>();
export const childSkinSession = {
  snapshot: () => childToken,
  revision: () => revision,
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  save(token: string) {
    if (!/^hs_child_[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("Invalid child session");
    parentVerificationSession.clear();
    try{childStorage?.setItem(tokenKey,token);}catch{/* Memory-only if tab storage is unavailable. */}
    childToken = token; revision++; listeners.forEach(fn => fn());
  },
  clear() { childToken = null;try{childStorage?.removeItem(tokenKey);}catch{/* Memory-only. */} revision++; listeners.forEach(fn => fn()); },
};
