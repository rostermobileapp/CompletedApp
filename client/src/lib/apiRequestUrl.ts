/** Parent cookies are first-party, HttpOnly and SameSite=Strict. Requests that
 * establish or use them must go through the frontend's existing /api proxy,
 * even when unrelated requests use a separately configured backend. */
export function apiRequestUrl(
  requestPath: string,
  apiBaseUrl: string,
  headers: Record<string, string> = {},
): string {
  const parentEndpoint = requestPath === "/api/high-school/parent-verification"
    || requestPath.startsWith("/api/high-school/parent-verification/");
  const rememberedDevice = Object.keys(headers).some(key => key.toLowerCase() === "x-parent-device-id");
  if (requestPath.startsWith("/api/") && (parentEndpoint || rememberedDevice)) return requestPath;
  return `${apiBaseUrl}${requestPath}`;
}
