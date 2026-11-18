import { appAttributionUrl } from "@shared/signupAttribution";

const entryPaths = new Set(["/", "/login", "/signup", "/get-started", "/referral-program/apply", "/referral-program/portal/login"]);

/** Only outbound APP entry links; never store buttons, HPIB events, or APIs. */
export function installAppAttributionLinks(doc: Document, currentUrl: () => string) {
  const key = "roster.website-attribution.v1";
  const origin = "https://www.roster-app.com";
  let source = appAttributionUrl(origin, currentUrl());
  // Sanitized public parameters only; no APP account, auth client, or API needed.
  // This also survives ordinary WEBSITE page loads before the outbound CTA.
  try {
    const previous = doc.defaultView?.sessionStorage.getItem(key);
    if (previous && new URL(previous).origin === origin) source = appAttributionUrl(previous, source);
    if (new URL(source).search) doc.defaultView?.sessionStorage.setItem(key, source);
  } catch {
    console.warn("Website attribution storage is unavailable; links will preserve this page's campaign context only.");
  }
  const decorated = new WeakMap<HTMLAnchorElement, { original: string; href: string }>();
  const decorate = (anchor: HTMLAnchorElement) => {
    // Attribute observations also include <link rel="canonical">. Never turn
    // document metadata into an outbound CTA or append campaign parameters.
    if (anchor.tagName !== "A") return;
    const current = anchor.getAttribute("href");
    const previous = decorated.get(anchor);
    const original = previous && current === previous.href ? previous.original : current;
    if (!original || !/^https?:\/\//i.test(original)) return;
    const destination = new URL(original);
    if (!["https://roster-app.com", origin].includes(destination.origin) || !entryPaths.has(destination.pathname)) return;
    destination.hostname = "www.roster-app.com";
    const href = appAttributionUrl(appAttributionUrl(destination.href, source), currentUrl());
    if (anchor.href !== href) anchor.href = href;
    decorated.set(anchor, { original, href });
    anchor.target = "_blank";
    anchor.rel = Array.from(new Set([...anchor.rel.split(/\s+/).filter(Boolean), "noopener", "noreferrer"])).join(" ");
  };
  const scan = () => doc.querySelectorAll<HTMLAnchorElement>("a[href]").forEach(decorate);
  const click = (event: Event) => {
    const target = event.target as Element | null;
    const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (anchor) decorate(anchor);
  };
  scan();
  // Process only changed links/subtrees. Do not rescan the entire app whenever
  // an unrelated score, chat message, or other piece of text changes.
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "attributes") {
        decorate(record.target as HTMLAnchorElement);
        continue;
      }
      record.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        const element = node as Element;
        if (element.matches("a[href]")) decorate(element as HTMLAnchorElement);
        element.querySelectorAll<HTMLAnchorElement>("a[href]").forEach(decorate);
      });
    }
  });
  observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
  doc.addEventListener("click", click, true);
  doc.addEventListener("auxclick", click, true);
  return () => {
    observer.disconnect();
    doc.removeEventListener("click", click, true);
    doc.removeEventListener("auxclick", click, true);
  };
}
