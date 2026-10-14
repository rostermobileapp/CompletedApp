// Unlaunched sports remain reachable and crawlable, but must not be indexed.
export const unindexedPublicPagePaths = ['/soccer', '/baseball'] as const;

export function isUnindexedPublicPage(pathname: string) {
  const cleanPath = pathname.replace(/\/+$/, '').replace(/\/index\.html$/, '');
  return unindexedPublicPagePaths.some(path => path === cleanPath);
}
