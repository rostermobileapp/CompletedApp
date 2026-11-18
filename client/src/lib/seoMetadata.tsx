import { createContext, type MutableRefObject, type ReactNode } from 'react';
import { MARKETING_REDIRECT_PATHS, appRobots } from '@shared/appWebPolicy';

export const APP_SITE_ORIGIN = 'https://www.roster-app.com';
export const MARKETING_SITE_ORIGIN = 'https://www.rosterhockey.com';
// Retained for app-facing callers that need the app's canonical origin.
export const CANONICAL_SITE_ORIGIN = APP_SITE_ORIGIN;

const marketingPagePaths = new Set<string>(MARKETING_REDIRECT_PATHS);

function currentHostname() {
  return typeof window === 'undefined' ? 'www.roster-app.com' : window.location.hostname.toLowerCase();
}

function normalizedPath(path: string) {
  return new URL(path, MARKETING_SITE_ORIGIN).pathname.replace(/\/+$/, '') || '/';
}

export function isMarketingPagePath(path: string) {
  return marketingPagePaths.has(normalizedPath(path));
}

export function canonicalOriginForPath(_path: string, _hostname = currentHostname()) {
  // This source now belongs exclusively to APP. WEBSITE owns an independent copy.
  return APP_SITE_ORIGIN;
}

export type SeoMetadata = {
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  canonical?: string;
};

export const SeoMetadataContext = createContext<MutableRefObject<SeoMetadata | null> | null>(null);

export function SeoMetadataCollector({
  value,
  children,
}: {
  value: MutableRefObject<SeoMetadata | null>;
  children: ReactNode;
}) {
  return <SeoMetadataContext.Provider value={value}>{children}</SeoMetadataContext.Provider>;
}

export function canonicalUrl(path: string, options: { appRoot?: boolean; hostname?: string } = {}) {
  const pathname = normalizedPath(path);
  const origin = options.appRoot && pathname === '/'
    ? APP_SITE_ORIGIN
    : canonicalOriginForPath(pathname, options.hostname);
  return `${origin}${pathname}`;
}

export function applyCanonicalUrl(path: string, appRoot = false) {
  if (typeof document === 'undefined') return;
  const href = canonicalUrl(path, { appRoot });
  let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = href;
  let ogUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
  if (!ogUrl) {
    ogUrl = document.createElement('meta');
    ogUrl.setAttribute('property', 'og:url');
    document.head.appendChild(ogUrl);
  }
  ogUrl.content = href;
  let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (!robots) {
    robots = document.createElement('meta');
    robots.name = 'robots';
    document.head.appendChild(robots);
  }
  const preview = /(?:\.replit\.(?:dev|app)|\.vercel\.app)$/.test(currentHostname())
    || ['localhost', '127.0.0.1'].includes(currentHostname());
  robots.content = appRobots(path, preview);
}
