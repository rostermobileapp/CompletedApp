// Routes that require a session. Public/partner/admin-login pages deliberately
// stay outside this list. Keep coverage in appRouteEntry.test.ts in sync with
// the router so a new notification destination cannot become a signed-out 404.
export const PROTECTED_APP_ROUTES = [
  '/teams', '/profile', '/payment-requests',
  '/demo', '/league-tournament-search', '/league-search', '/team-search',
  '/messages', '/messages/:conversationId', '/user/:userId',
  '/trophy-case/earned-patches', '/trophy-case', '/admin/badges',
  '/subscription', '/settings/billing', '/subscriptions', '/roster',
  '/create-league', '/create-team', '/create-scrimmage', '/edit-scrimmage/:id',
  '/scrimmage-management', '/invite-groups', '/invite-groups/new', '/invite-groups/:id',
  '/league-management', '/league-management/:leagueId', '/draft/:draftId',
  '/league/:leagueId/score-verification', '/league-list', '/calendar',
  '/game/:id', '/scrimmage/:id', '/team-event/:id', '/team/:id',
  '/player-stats/:userId', '/announcements', '/substitute-confirmations',
  '/stats', '/stats-management', '/scorekeeper', '/create-payment-request',
  '/payment-requests/:id/edit', '/payment-requests/:id',
  '/facility-memberships', '/calendar-events/create', '/tournaments',
  '/tournament-search', '/tournaments/create', '/leagues/:leagueId/tournaments/create',
  '/leagues/:leagueId/tournaments', '/tournaments/:tournamentId/edit',
  '/tournaments/:tournamentId/custom-builder', '/tournament-teams/:tournamentId',
  '/tournaments/:tournamentId', '/media/tournament/:id', '/media/league/:id',
  '/media/team/:id', '/privacy', '/admin/stripe', '/admin/metrics',
] as const;

const matchers = PROTECTED_APP_ROUTES.map(template => ({
  template,
  pattern: new RegExp(`^${template.replace(/:[^/]+/g, '[^/]+')}/?$`),
}));

export function isProtectedAppPath(path: string): boolean {
  return matchers.some(({ pattern }) => pattern.test(path));
}

export function shouldShowAppLogin(path: string, native: boolean, search: string): boolean {
  const params = new URLSearchParams(search);
  return path === '/app' || isProtectedAppPath(path) ||
    (path === '/' && (native || params.get('trivia') === '1' || params.get('notification') === '1'));
}

export function loginDestination(path: string, search: string, hash: string): string {
  // Only the current app-owned location is accepted, never a returnTo URL
  // supplied by a query parameter (which could introduce an open redirect).
  return `${isProtectedAppPath(path) ? path : '/'}${search}${hash}`;
}

export function authenticatedEntryDestination(
  path: string, search: string, hash: string, savedPath: string | null,
): string | null {
  if (savedPath) return savedPath;
  return path === '/app' || path === '/login' ? `/${search}${hash}` : null;
}

/** No unknown path segments, IDs, query values, tokens or hashes leave the device. */
export function diagnosticRouteShape(path: string): string {
  const known = matchers.find(({ pattern }) => pattern.test(path));
  if (known) return known.template;
  if (path === '/app' || path === '/login' || path === '/') return path;
  return `/unknown/${Math.min(path.split('/').filter(Boolean).length, 10)}-segments`;
}

export function createRouteMissReporter(send: (body: object) => void) {
  const reported = new Set<string>();
  return (path: string, context: { native: boolean; entry: 'launch' | 'navigation'; linked: boolean }) => {
    const shape = diagnosticRouteShape(path);
    if (reported.has(shape) || reported.size >= 5) return;
    reported.add(shape);
    send({ message: `Unmatched app route: ${shape}`, componentStack: 'Router.NotFound',
      stack: JSON.stringify(context) });
  };
}
