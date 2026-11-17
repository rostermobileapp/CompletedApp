import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";

export function assertDevelopmentRequest(
  url: URL,
  devOrigin: string,
  method = "GET",
  headers?: HeadersInit,
  stripeTestSecret?: string,
): void {
  // Only the explicitly provided test credential may leave development for
  // these organizer-payment resources. Live keys and other Stripe APIs remain blocked.
  const authorization = headers ? new Headers(headers).get("authorization") : null;
  if (stripeTestSecret?.startsWith("sk_test_") &&
      authorization === `Bearer ${stripeTestSecret}` &&
      url.origin === "https://api.stripe.com" &&
      !url.username && !url.password &&
      /^\/v1\/(?:accounts|account_links|checkout\/sessions|payment_intents|charges|balance_transactions|refunds)(?:\/[a-zA-Z0-9_]+)*$/.test(url.pathname)) {
    return;
  }
  const path = decodeURIComponent(url.pathname).replace(/\/+$/, "");
  const authMutation = path.startsWith("/auth/v1/") &&
    !["GET", "HEAD"].includes(method.toUpperCase()) &&
    !["/auth/v1/token", "/auth/v1/logout"].includes(path);
  if (url.origin !== devOrigin || authMutation) {
    throw Object.assign(new Error("External delivery is disabled in isolated development."), {
      code: "NONPRODUCTION_DELIVERY_DISABLED", status: 503,
    });
  }
}

export function installDevelopmentNetworkGuard(devOrigin: string, stripeTestSecret?: string): void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    assertDevelopmentRequest(new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
    ), devOrigin, init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET"),
    init?.headers ?? (input instanceof Request ? input.headers : undefined), stripeTestSecret);
    // A redirect must never forward credentials or requests to an unchecked host.
    return originalFetch(input, { ...init, redirect: "error" });
  };
  for (const [module, protocol] of [[http, "http:"], [https, "https:"]] as const) {
    for (const method of ["request", "get"] as const) {
      const original = module[method];
      (module as any)[method] = function (...args: any[]) {
        const input = args[0];
        const url = input instanceof URL ? input : typeof input === "string"
          ? new URL(input) : new URL(
            `${input.protocol ?? protocol}//${input.hostname ?? input.host}${input.port ? `:${input.port}` : ""}${input.path ?? "/"}`,
          );
        const options = typeof input === "object" && !(input instanceof URL) ? input : args[1] ?? {};
        assertDevelopmentRequest(url, devOrigin, options.method ?? "GET", options.headers, stripeTestSecret);
        return (original as Function).apply(module, args);
      };
    }
  }
  syncBuiltinESMExports();
}
