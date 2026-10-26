export const isNonProductionClient =
  Boolean(import.meta.env?.DEV || import.meta.env?.VITE_ISOLATED_DEVELOPMENT === "true");

export function assertClientDeliveryAllowed(): void {
  if (isNonProductionClient) {
    throw Object.assign(new Error("Push registration and billing are disabled in isolated development."), {
      code: "NONPRODUCTION_DELIVERY_DISABLED",
    });
  }
}

export function assertDevelopmentClientRequest(value: string | URL, method = "GET"): void {
  if (!isNonProductionClient) return;
  const url = new URL(value, window.location.href);
  const devApp = import.meta.env?.VITE_ISOLATED_APP_ORIGIN;
  const devAuth = import.meta.env?.VITE_SUPABASE_URL;
  const origin = url.origin.replace(/^ws/, "http");
  const localPreview = ["http://127.0.0.1:5000", "http://localhost:5000"].includes(origin);
  const path = decodeURIComponent(url.pathname).replace(/\/+$/, "");
  const authMutation = path.startsWith("/auth/v1/") &&
    !["GET", "HEAD"].includes(method.toUpperCase()) &&
    !["/auth/v1/token", "/auth/v1/logout"].includes(path);
  if ((!localPreview && origin !== devApp && origin !== devAuth) || authMutation) {
    throw Object.assign(new Error("This request is disabled in isolated development."), {
      code: "NONPRODUCTION_DELIVERY_DISABLED",
    });
  }
}

if (isNonProductionClient && typeof window !== "undefined") {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    assertDevelopmentClientRequest(typeof input === "string" || input instanceof URL ? input : input.url,
      init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET"));
    return originalFetch(input, { ...init, redirect: "error" });
  };
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...args: any[]) {
    assertDevelopmentClientRequest(url, method);
    return (originalOpen as Function).call(this, method, url, ...args);
  } as typeof originalOpen;
  const OriginalWebSocket = window.WebSocket;
  window.WebSocket = class extends OriginalWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      assertDevelopmentClientRequest(url);
      super(url, protocols);
    }
  };
  void navigator.serviceWorker?.getRegistrations().then(
    registrations => Promise.all(registrations.map(registration => registration.unregister())),
  ).catch(() => {});
}
