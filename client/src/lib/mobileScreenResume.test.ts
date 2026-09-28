import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOBILE_SCREEN_KEY, forgetMobileScreen, isRestorablePath,
  readMobileScreen, rememberMobileScreen, resolveLaunchScreen, shouldRestoreOnLaunch,
} from './mobileScreenResume';

function makeStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); },
    removeItem: (key: string) => { items.delete(key); },
  };
}

test('native cold root launch is eligible, but a warm route or deep link wins', () => {
  assert.equal(shouldRestoreOnLaunch(true, '/', '', ''), true);
  assert.equal(shouldRestoreOnLaunch(true, '/app', '', ''), true);
  assert.equal(shouldRestoreOnLaunch(true, '/game/123', '', ''), false);
  assert.equal(shouldRestoreOnLaunch(true, '/', '?notification=123', ''), false);
  assert.equal(shouldRestoreOnLaunch(true, '/', '', '#/game/123'), false);
  assert.equal(shouldRestoreOnLaunch(false, '/', '', ''), false);
});

test('a signed-in user can return to a main screen or stable detail page', () => {
  const storage = makeStorage();
  rememberMobileScreen(storage, 'user-a', '/messages', 1000);
  assert.equal(readMobileScreen(storage, 'user-a', 1100), '/messages');
  rememberMobileScreen(storage, 'user-a', '/scrimmage/123-abc', 1200);
  assert.equal(readMobileScreen(storage, 'user-a', 1300), '/scrimmage/123-abc');
  rememberMobileScreen(storage, 'user-a', '/', 1400);
  assert.equal(readMobileScreen(storage, 'user-a', 1500), '/');
});

test('restoration respects later notification navigation and Demo mode', () => {
  const storage = makeStorage();
  rememberMobileScreen(storage, 'user-a', '/game/123', 1000);
  const resolve = (eligible: boolean, path: string, search = '', hash = '', demo = false) =>
    resolveLaunchScreen(storage, 'user-a', eligible, path, search, hash, demo, 1100);
  assert.equal(resolve(true, '/'), '/game/123');
  assert.equal(resolve(true, '/app'), '/game/123');
  assert.equal(resolve(true, '/scrimmage/456'), null); // navigation while auth loads
  assert.equal(resolve(true, '/', '?notification=456'), null);
  assert.equal(resolve(true, '/', '', '#/scrimmage/456'), null);
  assert.equal(resolve(false, '/'), null); // direct URL / warm navigation
  assert.equal(resolve(true, '/', '', '', true), null);
  assert.equal(resolveLaunchScreen(storage, 'user-b', true, '/', '', '', false, 1100), null);
});

test('logout and account changes never expose the previous account screen', () => {
  const storage = makeStorage();
  rememberMobileScreen(storage, 'user-a', '/messages/thread-1', 1000);
  assert.equal(readMobileScreen(storage, 'user-b', 1100), null);
  assert.equal(storage.getItem(MOBILE_SCREEN_KEY), null);
  rememberMobileScreen(storage, 'user-a', '/profile', 1200);
  forgetMobileScreen(storage);
  assert.equal(readMobileScreen(storage, 'user-a', 1300), null);
});

test('removed, stale, malformed, and transient paths fall back safely', () => {
  const storage = makeStorage();
  assert.equal(isRestorablePath('/tournaments/abc123'), true);
  for (const path of ['/login', '/get-started', '/draft/abc', '/payment-requests/abc/edit',
    '/create-scrimmage', '/demo', '/admin/badges', '/removed-screen', '//evil.test', '/game/123?secret=1']) {
    assert.equal(isRestorablePath(path), false, path);
    rememberMobileScreen(storage, 'user-a', path, 1000);
    assert.equal(storage.getItem(MOBILE_SCREEN_KEY), null);
  }
  rememberMobileScreen(storage, 'user-a', '/game/123', 1000);
  assert.equal(readMobileScreen(storage, 'user-a', 1000 + 8 * 86400000), null);
  storage.setItem(MOBILE_SCREEN_KEY, '{not json');
  assert.equal(readMobileScreen(storage, 'user-a', 2000), null);
  storage.setItem(MOBILE_SCREEN_KEY, JSON.stringify({ userId: 'user-a', path: '/removed-screen', savedAt: 1900 }));
  assert.equal(readMobileScreen(storage, 'user-a', 2000), null);
});

test('storage failures cannot prevent the app from opening', () => {
  const unavailable = {
    getItem: (_key: string): string | null => { throw new Error('unavailable'); },
    setItem: (_key: string, _value: string): void => { throw new Error('unavailable'); },
    removeItem: (_key: string): void => { throw new Error('unavailable'); },
  };
  rememberMobileScreen(unavailable, 'a', '/teams');
  assert.equal(readMobileScreen(unavailable, 'a'), null);
  forgetMobileScreen(unavailable);
});