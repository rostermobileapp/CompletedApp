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

// Persist only the approved child capability across app restarts. Parent
// verification is NEVER persisted or inherited by a child session.
const tokenKey="roster-child-session";
const storage=(kind:"localStorage"|"sessionStorage")=>{try{return typeof window!=="undefined"?window[kind]:undefined;}catch{return undefined;}};
const valid=(token:unknown):token is string=>typeof token==="string"&&/^hs_child_[A-Za-z0-9_-]{43}$/.test(token);
const read=(kind:"localStorage"|"sessionStorage")=>{try{const token=storage(kind)?.getItem(tokenKey);return valid(token)?token:null;}catch{return null;}};
const remove=(kind:"localStorage"|"sessionStorage")=>{try{storage(kind)?.removeItem(tokenKey);}catch{/* Storage may be blocked by the device. */}};
let persistent=false;
function persist(token:string) {
  try {
    const target=storage("localStorage");
    if(!target)throw new Error("Persistent player storage is unavailable");
    target.setItem(tokenKey,token);
    persistent=target.getItem(tokenKey)===token;
    if(persistent){remove("sessionStorage");return;}
  }catch{/* Keep this launch usable, but expose the persistence failure to the UI. */}
  persistent=false;
  remove("localStorage"); // Never restore an older child's grant after a failed account switch.
  try{storage("sessionStorage")?.setItem(tokenKey,token);}catch{/* Current launch only; the UI warns the user. */}
}
let childToken: string | null = read("localStorage");
if(childToken){persistent=true;remove("sessionStorage");}
else {
  childToken=read("sessionStorage");
  if(childToken)persist(childToken); // Upgrade an already paired, still-open app.
}
let revision = 0;
const listeners = new Set<() => void>();
function changed(){revision++;listeners.forEach(fn=>fn());}
if(typeof window!=="undefined")window.addEventListener("storage",event=>{
  if(event.storageArea!==storage("localStorage")||(event.key!==tokenKey&&event.key!==null))return;
  const next=read("localStorage");
  if(next===childToken)return;
  childToken=next;persistent=!!next;remove("sessionStorage");
  if(next)parentVerificationSession.clear();
  changed();
});
export const childSkinSession = {
  snapshot: () => childToken,
  revision: () => revision,
  persistenceAvailable: () => persistent,
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  save(token: string) {
    if (!valid(token)) throw new Error("Invalid child session");
    persist(token);
    parentVerificationSession.clear();
    childToken = token; changed();
  },
  clear() { childToken = null;persistent=false;remove("localStorage");remove("sessionStorage");changed(); },
};
