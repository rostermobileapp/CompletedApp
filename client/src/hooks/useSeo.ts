import { useContext, useEffect } from 'react';
import { useLocation } from 'wouter';
import { applyCanonicalUrl, CANONICAL_SITE_ORIGIN, canonicalUrl, SeoMetadataContext } from '@/lib/seoMetadata';

interface SeoOptions {
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
  canonical?: string;
}

const DEFAULT_TITLE = 'Roster — Hockey Team Management App';
const OG_IMAGE = `${CANONICAL_SITE_ORIGIN}/roster-logo.png`;

export function useSeo({ title, description, ogTitle, ogDescription, canonical }: SeoOptions) {
  const [location] = useLocation();
  const collector = useContext(SeoMetadataContext);
  const resolvedCanonical = canonicalUrl(canonical ?? location);
  if (collector) collector.current = { title, description, ogTitle, ogDescription, canonical: resolvedCanonical };

  useEffect(() => {
    document.title = title;

    const setMeta = (name: string, content: string, property = false) => {
      const attr = property ? 'property' : 'name';
      let el = document.querySelector(`meta[${attr}="${name}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    const setCanonical = (href: string) => {
      let el = document.querySelector('link[rel="canonical"]');
      if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', 'canonical');
        document.head.appendChild(el);
      }
      el.setAttribute('href', href);
    };

    const resolvedOgTitle = ogTitle ?? title;
    const resolvedOgDesc = ogDescription ?? description;

    setMeta('description', description);
    setMeta('og:title', resolvedOgTitle, true);
    setMeta('og:description', resolvedOgDesc, true);
    setMeta('og:type', 'website', true);
    setMeta('og:image', OG_IMAGE, true);
    setMeta('og:url', resolvedCanonical, true);
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', resolvedOgTitle);
    setMeta('twitter:description', resolvedOgDesc);
    setMeta('twitter:image', OG_IMAGE);
    setCanonical(resolvedCanonical);
    applyCanonicalUrl(canonical ?? location);

    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [title, description, ogTitle, ogDescription, canonical, location, resolvedCanonical]);
}
