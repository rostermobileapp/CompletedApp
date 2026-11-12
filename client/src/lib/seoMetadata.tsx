import { createContext, type MutableRefObject, type ReactNode } from 'react';

export const APP_SITE_ORIGIN = 'https://www.roster-app.com';
export const MARKETING_SITE_ORIGIN = 'https://www.rosterhockey.com';
// Retained for app-facing callers that need the app's canonical origin.
export const CANONICAL_SITE_ORIGIN = APP_SITE_ORIGIN;

const marketingPagePaths = new Set([
  '/',
  '/features',
  '/pricing',
  '/about',
  '/hockey',
  '/baseball',
  '/soccer',
  '/for-adult-leagues',
  '/for-youth-teams',
  '/for-varsity',
  '/referral-program',
  '/faq',
  '/support',
  '/privacy-policy',
  '/privacy',
  '/terms-of-service',
  '/sitemap.xml',
  '/robots.txt',
  '/llms.txt',
]);

function currentHostname() {
  return typeof window === 'undefined' ? 'www.rosterhockey.com' : window.location.hostname.toLowerCase();
}

function normalizedPath(path: string) {
  return new URL(path, MARKETING_SITE_ORIGIN).pathname.replace(/\/+$/, '') || '/';
}

export function isMarketingPagePath(path: string) {
  return marketingPagePaths.has(normalizedPath(path));
}

export function canonicalOriginForPath(path: string, hostname = currentHostname()) {
  const pathname = normalizedPath(path);
  if (!marketingPagePaths.has(pathname)) return APP_SITE_ORIGIN;

  // The root is also the authenticated app's launch page. Keep its canonical
  // origin on the app host when that is where the visitor is using the app.
  if (pathname === '/' && /(^|\.)roster-app\.com$/.test(hostname)) return APP_SITE_ORIGIN;
  return MARKETING_SITE_ORIGIN;
}

export type SeoMetadata = {
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
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
}
