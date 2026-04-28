import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

function showFatalOverlay(label: string, detail: string) {
  try {
    if (document.getElementById("__fatal_overlay__")) return;
    const overlay = document.createElement("div");
    overlay.id = "__fatal_overlay__";
    overlay.setAttribute("data-testid", "fatal-overlay");
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:2147483647",
      "background:#0a0a0a",
      "color:#f5f5f5",
      "font-family:system-ui,-apple-system,sans-serif",
      "padding:24px",
      "overflow:auto",
      "white-space:pre-wrap",
      "word-break:break-word",
      "font-size:13px",
      "line-height:1.5",
    ].join(";");
    overlay.innerHTML =
      '<div style="max-width:760px;margin:32px auto;">' +
      '<div style="font-size:18px;font-weight:600;margin-bottom:8px;">App failed to load</div>' +
      '<div style="font-size:13px;color:#a1a1a1;margin-bottom:16px;">Share the details below with support.</div>' +
      '<div style="background:#171717;border:1px solid #2a2a2a;border-radius:8px;padding:12px 16px;">' +
      '<strong>' +
      String(label) +
      "</strong>\n" +
      String(detail) +
      "</div>" +
      '<div style="margin-top:16px;display:flex;gap:12px;">' +
      '<button id="__fatal_reload__" style="padding:8px 16px;border-radius:8px;border:1px solid #404040;background:#1f1f1f;color:#f5f5f5;cursor:pointer;font-size:14px;">Reload</button>' +
      '<button id="__fatal_home__" style="padding:8px 16px;border-radius:8px;border:1px solid #404040;background:transparent;color:#f5f5f5;cursor:pointer;font-size:14px;">Go home</button>' +
      "</div>" +
      "</div>";
    document.body.appendChild(overlay);
    document.getElementById("__fatal_reload__")?.addEventListener("click", () => window.location.reload());
    document.getElementById("__fatal_home__")?.addEventListener("click", () => {
      window.location.href = "/";
    });
  } catch {
    /* swallow — last-resort */
  }
}

window.addEventListener("error", (event) => {
  const msg = (event.error && (event.error.stack || event.error.message)) || event.message || "Unknown error";
  // eslint-disable-next-line no-console
  console.error("[GlobalError]", event.message, event.error);
  showFatalOverlay("Uncaught error:", String(msg));
});

window.addEventListener("unhandledrejection", (event) => {
  const reason: any = event.reason;
  const msg = (reason && (reason.stack || reason.message)) || String(reason);
  // eslint-disable-next-line no-console
  console.error("[UnhandledRejection]", reason);
  showFatalOverlay("Unhandled promise rejection:", String(msg));
});

try {
  const rootEl = document.getElementById("root");
  if (!rootEl) {
    showFatalOverlay("Bootstrap error:", 'No #root element found in document.');
  } else {
    createRoot(rootEl).render(<App />);
  }
} catch (err: any) {
  console.error("[Bootstrap] Failed to mount React:", err);
  showFatalOverlay("Bootstrap error:", String(err?.stack || err?.message || err));
}
