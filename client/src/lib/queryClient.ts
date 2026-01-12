import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { supabase } from "./supabase";

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

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session }, error } = await supabase.auth.getSession();
  const headers: Record<string, string> = {};
  
  if (error) {
    console.error('[Auth] getSession error:', error.message);
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

  await throwIfResNotOk(res);
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

    await throwIfResNotOk(res);
    return await res.json();
  };

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
