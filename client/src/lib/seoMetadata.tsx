import { createContext, type MutableRefObject, type ReactNode } from 'react';

export const CANONICAL_SITE_ORIGIN = 'https://www.roster-app.com';

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

export function canonicalUrl(path: string) {
  const normalized = new URL(path, CANONICAL_SITE_ORIGIN);
  return `${CANONICAL_SITE_ORIGIN}${normalized.pathname || '/'}`;
}

export function applyCanonicalUrl(path: string) {
  if (typeof document === 'undefined') return;
  const href = canonicalUrl(path);
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
