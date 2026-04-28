import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { supabase, clearStaleSession } from "./supabase";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

/**
 * Converts relative image paths to absolute URLs pointing to the backend.
 * Profile pictures and team logos are served through the backend API.
 */
export function getImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  
  // If it's already an absolute URL (http:// or https://), return as-is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  
  // If it's a relative path, prepend the API base URL
  // Remove leading slash if present to avoid double slashes
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
}

/**
 * Error thrown by `apiRequest` / the default query fn when the server responds
 * with a non-2xx status. Carries the raw status and parsed body (if JSON) so
 * callers — and the global mutation handler below — can branch on structured
 * server responses such as `{ paymentRequired: true, ... }` without re-parsing
 * the response.
 */
export class ApiError extends Error {
  status: number;
  data: any;
  url: string;
  paymentRequired: boolean;
  tournamentId?: string;

  constructor(status: number, message: string, data: any, url: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
    this.url = url;
    this.paymentRequired = !!(data && typeof data === "object" && data.paymentRequired === true);
    this.tournamentId =
      data && typeof data === "object" && typeof data.tournamentId === "string"
        ? data.tournamentId
        : undefined;
  }
}

/**
 * Detail payload for the `tournament-payment-required` window event. Fired
 * whenever a mutation (or query) hits a 402 response with
 * `paymentRequired: true`. The TournamentDetail page listens for this and
 * opens the in-app Stripe checkout modal — replacing the old generic error
 * toast with the actual pay-invoice affordance.
 */
export interface TournamentPaymentRequiredEventDetail {
  tournamentId?: string;
  message: string;
  url: string;
}

export const TOURNAMENT_PAYMENT_REQUIRED_EVENT = "tournament-payment-required";

/**
 * True when the given error is a 402 paymentRequired response from one of our
 * tournament gates. Mutation `onError` handlers should use this to skip their
 * own destructive "Error" toast — the global event listener already shows a
 * single "Payment required" toast and opens the in-app Stripe checkout modal.
 */
export function isPaymentRequiredError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 402 && error.paymentRequired;
}

function tryExtractTournamentIdFromUrl(url: string): string | undefined {
  // Match common tournament-scoped URL shapes used across our API:
  //   /api/tournaments/:tournamentId/...
  //   /api/tournaments/:id/...
  // Falls back to undefined for participant/match-keyed routes — the server
  // includes `tournamentId` in the payload for those.
  const m = url.match(/\/api\/tournaments\/([^/?#]+)/);
  return m ? m[1] : undefined;
}

function dispatchPaymentRequiredEvent(err: ApiError) {
  if (typeof window === "undefined") return;
  const detail: TournamentPaymentRequiredEventDetail = {
    tournamentId: err.tournamentId ?? tryExtractTournamentIdFromUrl(err.url),
    message:
      (err.data && typeof err.data.message === "string" && err.data.message) ||
      "Pay your tournament invoice to unlock this.",
    url: err.url,
  };
  window.dispatchEvent(
    new CustomEvent<TournamentPaymentRequiredEventDetail>(
      TOURNAMENT_PAYMENT_REQUIRED_EVENT,
      { detail },
    ),
  );
}

async function throwIfResNotOk(res: Response, url: string) {
  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    let data: any = null;
    let bodyText = "";
    if (contentType.includes("application/json")) {
      try {
        data = await res.clone().json();
      } catch {
        // Fall through to text parsing below.
      }
    }
    if (data === null) {
      bodyText = (await res.text()) || res.statusText;
    }

    // Prefer the server's structured `message` field (so handlers can display
    // user-friendly copy like "Pay your tournament invoice to unlock this.").
    // Fall back to the legacy "STATUS: body" format that callers historically
    // relied on for non-JSON error bodies.
    const message =
      (data && typeof data.message === "string" && data.message) ||
      `${res.status}: ${bodyText || res.statusText}`;

    const err = new ApiError(res.status, message, data, url);

    // Dispatch the payment-required event at the source so any caller — query
    // or mutation — surfaces the in-app pay modal, not just the generic toast.
    if (err.status === 402 && err.paymentRequired) {
      dispatchPaymentRequiredEvent(err);
    }

    throw err;
  }
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session }, error } = await supabase.auth.getSession();
  const headers: Record<string, string> = {};
  
  if (error) {
    console.error('[Auth] getSession error:', error.message);
    // If there's an error getting the session, it might be stale
    if (error.message.includes('session') || error.message.includes('token')) {
      console.log('[Auth] Session error detected, clearing stale session...');
      await clearStaleSession();
    }
  }
  
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  } else {
    console.log('[Auth] No session available - user not authenticated');
  }
  
  return headers;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const fullUrl = `${API_BASE_URL}${url}`;
  const authHeaders = await getAuthHeaders();
  const headers = {
    ...authHeaders,
    ...(data ? { "Content-Type": "application/json" } : {}),
  };
  
  const res = await fetch(fullUrl, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res, fullUrl);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const fullUrl = `${API_BASE_URL}${queryKey.join("/")}`;
    const authHeaders = await getAuthHeaders();
    
    const res = await fetch(fullUrl, {
      headers: authHeaders,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res, fullUrl);
    return await res.json();
  };

/**
 * The `tournament-payment-required` window event is dispatched once at the
 * source inside `throwIfResNotOk` — so any caller (query, mutation, raw
 * `apiRequest` consumer) gets a single notification for one failed request.
 * We deliberately do **not** re-dispatch from a global mutation `onError`
 * because that would fire a second event for the same error and could spawn
 * a duplicate Stripe checkout session before the listener's render-driven
 * guards (`isCheckoutOpen`, `paymentMutation.isPending`) had a chance to
 * update.
 *
 * Per-mutation `onError` handlers still run; we don't suppress them. Because
 * the server message ("Pay your tournament invoice to unlock this.") is
 * preserved as `error.message`, any toast they show is informative rather
 * than the previous generic "Failed to ..." text — and the modal opens
 * regardless, giving the user an immediate next action.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
