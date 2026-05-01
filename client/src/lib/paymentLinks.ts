// Resolve payment links for an invoice or scrimmage. The override (already a
// fully-normalized https URL when set on the server) takes precedence; if not
// set, fall back to the creator's profile-level handle. Returns null when
// neither is available so callers can hide the link.
//
// We strictly validate handles before turning them into URLs so that a bad
// profile value can never inject a query string (e.g. `?amount=`) or other
// path content into the resulting link. This keeps the contract — links are
// always canonical and never pre-fill an amount — true for the fallback path
// as well as the override path.

const VENMO_HANDLE_RE = /^[A-Za-z0-9_.-]{1,30}$/;
const CASHAPP_HANDLE_RE = /^[A-Za-z][A-Za-z0-9_]{0,19}$/;

function buildVenmoFromHandle(handle: string | null | undefined): string | null {
  if (!handle) return null;
  const cleaned = handle.trim().replace(/^@/, "");
  if (!cleaned || !VENMO_HANDLE_RE.test(cleaned)) return null;
  return `https://venmo.com/${cleaned}`;
}

function buildCashAppFromHandle(handle: string | null | undefined): string | null {
  if (!handle) return null;
  const cleaned = handle.trim().replace(/^\$/, "");
  if (!cleaned || !CASHAPP_HANDLE_RE.test(cleaned)) return null;
  return `https://cash.app/$${cleaned}`;
}

type Service = "venmo" | "cashapp";

function canonicalizeOverride(
  override: string | null | undefined,
  service: Service,
): string | null {
  const trimmed = override?.trim();
  if (!trimmed) return null;
  // The server normalizes new overrides into canonical https URLs, but defend
  // in depth on the render path too: re-extract and re-validate the handle,
  // then rebuild the canonical URL. This guarantees we never honor stray
  // query strings (e.g. `?amount=...`) or path tweaks that may exist on
  // legacy rows persisted before the normalization shipped.
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  if (service === "venmo") {
    if (url.hostname !== "venmo.com") return null;
    // Strip a leading "/u/" prefix (mobile app share format).
    const segments = url.pathname.split("/").filter(Boolean);
    const handle = segments[0] === "u" ? segments[1] : segments[0];
    return buildVenmoFromHandle(handle);
  }

  if (url.hostname !== "cash.app") return null;
  const segments = url.pathname.split("/").filter(Boolean);
  // Cash App URLs look like /$Handle.
  const handle = segments[0]?.replace(/^\$/, "");
  return buildCashAppFromHandle(handle);
}

export function resolveVenmoLink(
  override: string | null | undefined,
  creatorHandle: string | null | undefined,
): string | null {
  return canonicalizeOverride(override, "venmo") ?? buildVenmoFromHandle(creatorHandle);
}

export function resolveCashAppLink(
  override: string | null | undefined,
  creatorHandle: string | null | undefined,
): string | null {
  return canonicalizeOverride(override, "cashapp") ?? buildCashAppFromHandle(creatorHandle);
}
