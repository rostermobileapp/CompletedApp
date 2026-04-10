import { useEffect } from 'react';
import { useLocation } from 'wouter';

interface SeoOptions {
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
}

const DEFAULT_TITLE = 'Roster — Hockey Team Management App';
const OG_IMAGE = '/roster-logo.png';

export function useSeo({ title, description, ogTitle, ogDescription }: SeoOptions) {
  const [location] = useLocation();

  useEffect(() => {
    document.title = title;

    const canonical = window.location.origin + location;

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
    setMeta('og:image', window.location.origin + OG_IMAGE, true);
    setMeta('og:url', canonical, true);
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', resolvedOgTitle);
    setMeta('twitter:description', resolvedOgDesc);
    setMeta('twitter:image', window.location.origin + OG_IMAGE);
    setCanonical(canonical);

    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [title, description, ogTitle, ogDescription, location]);
}
