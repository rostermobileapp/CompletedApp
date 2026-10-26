import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";

export function assertDevelopmentRequest(url: URL, devOrigin: string, method = "GET"): void {
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

export function installDevelopmentNetworkGuard(devOrigin: string): void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    assertDevelopmentRequest(new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
    ), devOrigin, init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET"));
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
        assertDevelopmentRequest(url, devOrigin, typeof input === "object" && !(input instanceof URL)
          ? input.method ?? "GET" : args[1]?.method ?? "GET");
        return (original as Function).apply(module, args);
      };
    }
  }
  syncBuiltinESMExports();
}
