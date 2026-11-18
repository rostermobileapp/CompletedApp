import { appAttributionUrl } from "@shared/signupAttribution";
export function openAppEntry(path: string) {
  const destination = `https://www.roster-app.com${path}`;
  let source = window.location.href;
  try { source = sessionStorage.getItem("roster.website-attribution.v1") || source; } catch { /* current URL still preserved */ }
  window.open(appAttributionUrl(appAttributionUrl(destination, source), window.location.href), "_blank", "noopener,noreferrer");
}
