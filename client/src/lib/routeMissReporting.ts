import { createRouteMissReporter } from './appRouteEntry';

const launchPath = window.location.pathname;
const report = createRouteMissReporter(body => {
  void fetch('/api/client-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Do not supply window.location.href: even the path can contain private IDs.
    body: JSON.stringify({ ...body, url: `${window.location.origin}/[unmatched-route]` }),
    keepalive: true,
  }).catch(() => { /* reporting must never break recovery */ });
});

export function reportRouteMiss(path: string, native: boolean): void {
  report(path, {
    native,
    entry: path === launchPath ? 'launch' : 'navigation',
    linked: !!window.location.search || !!window.location.hash,
  });
}
