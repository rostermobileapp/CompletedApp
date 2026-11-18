/** Public document policy only; never imports auth, database or native services. */
export const APP_ORIGIN = "https://www.roster-app.com";
export const WEBSITE_ORIGIN = "https://www.rosterhockey.com";
export const MARKETING_REDIRECT_PATHS = [
  "/features", "/line-combos-predictions", "/rosterhockey-vs-benchapp",
  "/rosterhockey-vs-teamsnap", "/rosterhockey-vs-rosterlytic", "/pricing",
  "/about", "/hockey", "/for-youth-teams", "/for-adult-leagues", "/for-varsity",
  "/referral-program", "/faq", "/support", "/contact",
] as const;
const marketingPaths = new Set<string>(MARKETING_REDIRECT_PATHS);
export function documentPath(path: string): string {
  return new URL(path, APP_ORIGIN).pathname.replace(/\/+$/, "") || "/";
}
export function marketingDestination(path: string, search = ""): string | null {
  const pathname = documentPath(path);
  if (/^\/(?:soccer|baseball)(?:\/|$)/.test(pathname)) return `${WEBSITE_ORIGIN}/hockey${search}`;
  return marketingPaths.has(pathname) ? `${WEBSITE_ORIGIN}${pathname}${search}` : null;
}
export function isIndexableAppPage(path: string): boolean {
  // Signup uses the existing onboarding/auth flow, not an invented /signup page.
  return documentPath(path) === "/login";
}
export function appRobots(path: string, preview = false): string {
  return !preview && isIndexableAppPage(path) ? "index, follow" : "noindex, nofollow";
}
const escapeHtml = (text: string) => text.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
  .replaceAll("<", "&lt;").replaceAll(">", "&gt;");
export function appDocumentHtml(template: string, path: string, preview = false): string {
  const pathname = documentPath(path);
  const title = pathname === "/login" ? "Log In | RosterHockey" : "RosterHockey App";
  const description = "Sign in to RosterHockey to manage your teams, games and hockey community.";
  const canonical = `${APP_ORIGIN}${pathname}`;
  let html = template.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  const meta = (attribute: "name" | "property", name: string, value: string) => {
    const tag = `<meta ${attribute}="${name}" content="${escapeHtml(value)}" />`;
    const pattern = new RegExp(`<meta\\s+${attribute}=["']${name}["'][^>]*>`, "i");
    html = pattern.test(html) ? html.replace(pattern, () => tag) : html.replace("</head>", `${tag}\n</head>`);
  };
  meta("name", "description", description);
  meta("name", "robots", appRobots(pathname, preview));
  for (const [key, value] of Object.entries({ title, description, url: canonical, image: `${APP_ORIGIN}/roster-logo.png` })) {
    meta("property", `og:${key}`, value);
    if (key !== "url") meta("name", `twitter:${key}`, value);
  }
  const canonicalTag = `<link rel="canonical" href="${escapeHtml(canonical)}" />`;
  html = /<link\s+rel=["']canonical["'][^>]*>/i.test(html)
    ? html.replace(/<link\s+rel=["']canonical["'][^>]*>/i, () => canonicalTag)
    : html.replace("</head>", `${canonicalTag}\n</head>`);
  return html;
}
export const APP_CRAWL_FILES: Record<string, { contentType: string; body: string }> = {
  "/robots.txt": { contentType: "text/plain; charset=utf-8", body:
    `User-agent: *\nDisallow: /\nAllow: /login$\nAllow: /assets/\nAllow: /roster-logo.png\nSitemap: ${APP_ORIGIN}/sitemap.xml\n` },
  "/sitemap.xml": { contentType: "application/xml; charset=utf-8", body:
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${APP_ORIGIN}/login</loc></url></urlset>` },
  "/llms.txt": { contentType: "text/plain; charset=utf-8", body:
    `# RosterHockey application\n\nAccount entry: ${APP_ORIGIN}/login\nPublic product information: ${WEBSITE_ORIGIN}/\nApp account data and private screens are not public content.\n` },
};
