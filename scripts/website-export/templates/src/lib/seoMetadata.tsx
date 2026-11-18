import { createContext, type MutableRefObject, type ReactNode } from "react";
export const APP_SITE_ORIGIN = "https://www.roster-app.com";
export const MARKETING_SITE_ORIGIN = "https://www.rosterhockey.com";
export const CANONICAL_SITE_ORIGIN = MARKETING_SITE_ORIGIN;
export function canonicalOriginForPath(_path: string) { return MARKETING_SITE_ORIGIN; }
export function canonicalUrl(path: string) {
  return `${MARKETING_SITE_ORIGIN}${new URL(path, MARKETING_SITE_ORIGIN).pathname.replace(/\/+$/, "") || "/"}`;
}
export function applyCanonicalUrl(path: string) {
  if (typeof document === "undefined") return;
  const link = document.querySelector('link[rel="canonical"]') || document.head.appendChild(document.createElement("link"));
  link.setAttribute("rel", "canonical");
  link.setAttribute("href", canonicalUrl(path));
}
export interface SeoMetadata { title: string; description: string; ogTitle?: string; ogDescription?: string; ogImage?: string; canonical: string }
export const SeoMetadataContext = createContext<MutableRefObject<SeoMetadata | null> | null>(null);
export function SeoMetadataCollector({ value, children }: { value: MutableRefObject<SeoMetadata | null>; children: ReactNode }) {
  return <SeoMetadataContext.Provider value={value}>{children}</SeoMetadataContext.Provider>;
}
