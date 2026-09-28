// Only restore stable destinations. Forms, admin pages, drafts, demo mode,
// onboarding and auth callbacks must never be reopened implicitly.
const STABLE_PATHS = new Set([
  '/', '/teams', '/messages', '/payment-requests', '/profile',
  '/league-tournament-search', '/league-search', '/team-search',
  '/trophy-case', '/trophy-case/earned-patches', '/roster',
  '/scrimmage-management', '/invite-groups', '/league-management',
  '/league-list', '/calendar', '/announcements',
  '/substitute-confirmations', '/stats', '/stats-management',
  '/scorekeeper', '/facilities', '/facility-memberships',
  '/tournaments', '/tournament-search',
]);

const DETAIL_PATHS = [
  /^\/messages\/[a-zA-Z0-9_-]{1,100}$/,
  /^\/user\/[a-zA-Z0-9_-]{1,100}$/,
  /^\/(?:game|scrimmage|team-event|team)\/[a-zA-Z0-9_-]{1,100}$/,
  /^\/player-stats\/[a-zA-Z0-9_-]{1,100}$/,
  /^\/payment-requests\/[a-zA-Z0-9_-]{1,100}$/,
  /^\/facilities\/[a-zA-Z0-9_-]{1,100}$/,
  /^\/tournaments\/[a-zA-Z0-9_-]{1,100}$/,
  /^\/tournament-teams\/[a-zA-Z0-9_-]{1,100}$/,
  /^\/leagues\/[a-zA-Z0-9_-]{1,100}\/tournaments$/,
  /^\/media\/(?:tournament|league|team)\/[a-zA-Z0-9_-]{1,100}$/,
];

export const MOBILE_SCREEN_KEY = 'roster.mobile.lastScreen';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function isRestorablePath(path: string): boolean {
  return STABLE_PATHS.has(path) || DETAIL_PATHS.some(pattern => pattern.test(path));
}

export function shouldRestoreOnLaunch(native: boolean, pathname: string, search: string, hash: string): boolean {
  // A direct URL (including a notification target) always wins. No redirect on
  // an already mounted app: this decision is made only on Router's first render.
  return native && (pathname === '/' || pathname === '/app') && !search && !hash;
}

export function forgetMobileScreen(storage: Pick<Storage, 'removeItem'>): void {
  try { storage.removeItem(MOBILE_SCREEN_KEY); } catch { /* storage may be unavailable */ }
}

export function rememberMobileScreen(
  storage: Pick<Storage, 'setItem'>,
  userId: string,
  path: string,
  now = Date.now(),
): void {
  if (!userId || !isRestorablePath(path)) return;
  try {
    storage.setItem(MOBILE_SCREEN_KEY, JSON.stringify({ userId, path, savedAt: now }));
  } catch { /* private mode or full storage: continue without resume */ }
}

export function readMobileScreen(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  userId: string,
  now = Date.now(),
): string | null {
  try {
    const raw = storage.getItem(MOBILE_SCREEN_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (
      saved?.userId === userId &&
      typeof saved.path === 'string' &&
      isRestorablePath(saved.path) &&
      typeof saved.savedAt === 'number' &&
      saved.savedAt <= now &&
      saved.savedAt > now - MAX_AGE_MS
    ) return saved.path;
    forgetMobileScreen(storage);
  } catch {
    forgetMobileScreen(storage);
  }
  return null;
}

export function resolveLaunchScreen(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  userId: string,
  launchWasNativeRoot: boolean,
  currentPath: string,
  search: string,
  hash: string,
  demoActive: boolean,
  now = Date.now(),
): string | null {
  if (!launchWasNativeRoot || (currentPath !== '/' && currentPath !== '/app') ||
      search || hash || demoActive) return null;
  const path = readMobileScreen(storage, userId, now);
  return path && path !== '/' ? path : null;
}