import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PROTECTED_APP_ROUTES, authenticatedEntryDestination, createRouteMissReporter,
  diagnosticRouteShape, isProtectedAppPath, loginDestination, shouldShowAppLogin,
} from './appRouteEntry';
import { MOBILE_SCREEN_KEY, resolveLaunchScreen } from './mobileScreenResume';
import { getNotificationClickUrl } from '../../../server/notificationClickUrl';

test('authenticated launch and completed login have a deterministic Home fallback', () => {
  for (const path of ['/app', '/login']) {
    assert.equal(authenticatedEntryDestination(path, '', '', null), '/');
    assert.equal(authenticatedEntryDestination(path, '?trivia=1', '#play', null), '/?trivia=1#play');
  }
  assert.equal(authenticatedEntryDestination('/app', '', '', '/messages/thread'), '/messages/thread');
  assert.equal(authenticatedEntryDestination('/game/new', '', '', null), null);
});

test('missing, stale, malformed and other-account saved screens cannot strand /app', () => {
  for (const raw of [
    null, '{bad', JSON.stringify({ userId: 'a', path: '/removed', savedAt: 1000 }),
    JSON.stringify({ userId: 'a', path: '/profile', savedAt: 1 }),
    JSON.stringify({ userId: 'b', path: '/profile', savedAt: 1000 }),
  ]) {
    const store = new Map(raw ? [[MOBILE_SCREEN_KEY, raw]] : []);
    const storage = { getItem: (key: string) => store.get(key) ?? null, removeItem: (key: string) => { store.delete(key); } };
    const saved = resolveLaunchScreen(storage, 'a', true, '/app', '', '', false, 7 * 86400000 + 500);
    assert.equal(authenticatedEntryDestination('/app', '', '', saved), '/');
  }
});

test('all current push destinations survive expired-session entry and login', () => {
  const types = [
    'daily_trivia', 'message', 'payment_request', 'tournament_access_open',
    'tournament_schedule_changed', 'substitution', 'player_rsvp', 'join_request',
    'membership_approved', 'team_league_approved', 'added_to_team', 'schedule_reminder',
    'announcement', 'wall_reply', 'scrimmage_invite', 'scrimmage_open_spot',
    'scrimmage_approved', 'scrimmage_updated', 'scrimmage_player_withdrawn',
    'scrimmage_cohost_added', 'scrimmage_canceled', 'co_commissioner_added',
    'commissioner_transfer', 'personal_reminder', 'team_event', 'rsvp_reminder',
    'photo_tag', 'draft_starting', 'admin_new_signup', 'birthday',
  ];
  for (const type of types) {
    const url = new URL(getNotificationClickUrl({
      type, conversationId: 'thread', paymentRequestId: 'payment', tournamentId: 'cup',
      gameId: 'match', entityId: 'league', teamId: 'team', eventId: 'event',
      eventType: 'game', scrimmageId: 'scrim', leagueId: 'league',
      teamEventId: 'practice', entityType: 'league', draftId: 'draft', newUserId: 'player',
    }, 'https://example.test'));
    assert.equal(shouldShowAppLogin(url.pathname, true, url.search), true, type);
    assert.equal(loginDestination(url.pathname, url.search, url.hash), `${url.pathname}${url.search}`, type);
    assert.equal(resolveLaunchScreen({ getItem: () => JSON.stringify({
      userId: 'a', path: '/profile', savedAt: 1000,
    }), removeItem: () => {} }, 'a', true, url.pathname, url.search, '', false, 1100), null, type);
  }
});

test('login destinations never accept query-supplied redirects or external paths', () => {
  assert.equal(loginDestination('/messages/thread', '?tab=unread', '#latest'), '/messages/thread?tab=unread#latest');
  assert.equal(loginDestination('//evil.test', '', ''), '/');
  assert.equal(loginDestination('/login', '?returnTo=https://evil.test', ''), '/?returnTo=https://evil.test');
  assert.equal(shouldShowAppLogin('/unknown', true, ''), false);
  assert.equal(shouldShowAppLogin('/', false, ''), false);
  assert.equal(shouldShowAppLogin('/', false, '?trivia=1'), true);
  assert.equal(shouldShowAppLogin('/app', false, ''), true);
});

test('protected entry list covers router destinations not available to signed-out users', () => {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const signedOut = source.slice(source.indexOf('if (!isAuthenticated)'), source.indexOf('if (!userData &&'));
  const signedIn = source.slice(source.indexOf('const routesSwitch'));
  const paths = (text: string) => [...text.matchAll(/<Route path="([^"]+)"/g)].map(m => m[1]);
  const publicPaths = new Set(paths(signedOut));
  for (const path of paths(signedIn)) {
    if (!publicPaths.has(path)) assert.ok(PROTECTED_APP_ROUTES.includes(path as any), path);
  }
  for (const path of ['/teams', '/messages', '/profile', '/payment-requests']) {
    assert.ok(isProtectedAppPath(path));
  }
});

test('route diagnostics redact private segments and are bounded and deduplicated', () => {
  const sent: object[] = [];
  const report = createRouteMissReporter(body => sent.push(body));
  const context = { native: true, entry: 'launch' as const, linked: true };
  report('/messages/private-user-id', context);
  report('/messages/another-private-id', context);
  report('/private@example.test/token-value', context);
  for (let i = 1; i <= 12; i++) report('/' + Array(i).fill('secret').join('/'), context);
  assert.equal(sent.length, 5);
  assert.equal(diagnosticRouteShape('/messages/private-user-id'), '/messages/:conversationId');
  assert.doesNotMatch(JSON.stringify(sent), /private-user|another-private|example\.test|token-value|secret/);
});
