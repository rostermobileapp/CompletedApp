// Browser regression checks against scripts/routing-browser-fixture.ts only.
// Requires Chromium with --remote-debugging-port=9222. No real auth or app data.
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { once } from 'node:events';

const target = await (await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await once(ws, 'open');
let id = 0;
const pending = new Map();
const errors = [];
ws.on('message', raw => {
  const msg = JSON.parse(String(raw));
  if (msg.id) {
    const entry = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) entry?.reject(new Error(JSON.stringify(msg.error)));
    else entry?.resolve(msg.result);
  }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const key = ++id;
    pending.set(key, { resolve, reject });
    ws.send(JSON.stringify({ id: key, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function wait(expression) {
  const end = Date.now() + 7000;
  while (Date.now() < end) {
    if (await evaluate(expression)) return;
    await new Promise(r => setTimeout(r, 40));
  }
  throw new Error(`Timed out: ${expression}\n${await evaluate('document.body.innerText')}\n${errors.join('\n')}`);
}
let initId;
async function open(path, { signedIn = true, loading = false, saved = null, native = true } = {}) {
  if (initId) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: initId });
  const init = await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__routeFixtureInitial=${JSON.stringify({ user: signedIn ? { id: 'fixture-user', role: 'free_tier' } : null, isLoading: loading })};
    window.__fixtureNative=${native};
    if(location.origin==='http://127.0.0.1:3001') {
      localStorage.clear();
      ${saved ? `localStorage.setItem('roster.mobile.lastScreen',${JSON.stringify(typeof saved === 'string' ? saved : JSON.stringify(saved))});` : ''}
    }
    window.__notFoundSeen=false;
    new MutationObserver(()=>{if(document.querySelector('[data-testid="route-not-found"]'))window.__notFoundSeen=true})
      .observe(document,{childList:true,subtree:true});
  ` });
  initId = init.identifier;
  await send('Page.navigate', { url: `http://127.0.0.1:3001${path}` });
  await wait('!!window.fixture');
}
async function expectPath(path, screen = null) {
  await wait(`location.pathname+location.search+location.hash===${JSON.stringify(path)}${screen ? ` && !!document.querySelector('[data-testid="screen-${screen}"][aria-hidden="false"]')` : ''}`);
  assert.equal(await evaluate('window.__notFoundSeen'), false, 'valid entry mounted NotFound');
}
const savedProfile = () => ({ userId: 'fixture-user', path: '/profile', savedAt: Date.now() });
let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log(`PASS ${name}`);
}
try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await check('native /app with no saved screen -> Home, no 404 flash', async () => {
    await open('/app'); await expectPath('/', 'home');
  });
  await check('native /app restores a current same-account saved screen', async () => {
    await open('/app', { saved: savedProfile() }); await expectPath('/profile', 'profile');
  });
  for (const [label, saved] of [
    ['expired', { ...savedProfile(), savedAt: Date.now() - 8 * 86400000 }],
    ['malformed', '{broken'],
    ['other-account', { ...savedProfile(), userId: 'different-user' }],
    ['removed-route', { ...savedProfile(), path: '/removed' }],
  ]) {
    await check(`${label} saved screen -> Home`, async () => {
      await open('/app', { saved }); await expectPath('/', 'home');
    });
  }
  await check('notification during delayed auth overrides saved profile', async () => {
    await open('/app', { signedIn: false, loading: true, saved: savedProfile() });
    await evaluate(`fixture.accountDelay=150;fixture.navigate('/scrimmage/notify');fixture.setAuth('fixture-user')`);
    await wait(`document.querySelector('[data-testid="fixture-page"]')?.textContent==='GameDetails'`);
    await expectPath('/scrimmage/notify');
  });
  await check('trivia and root notification links override saved screen', async () => {
    for (const path of ['/?trivia=1', '/?notification=1', '/app?trivia=1']) {
      await open(path, { saved: savedProfile() });
      await expectPath(path.replace('/app?', '/?'), 'home');
    }
  });
  await check('expired-session notification shows real Login and preserves destination after real form submission', async () => {
    await open('/messages/thread-1?tab=unread#latest', { signedIn: false });
    await wait(`!!document.querySelector('[data-testid="button-login-initial"]')`);
    assert.equal(await evaluate('window.__notFoundSeen'), false);
    await evaluate(`document.querySelector('[data-testid="button-login-initial"]').click()`);
    await wait(`!!document.querySelector('input[type="email"]')`);
    await evaluate(`(() => {
      const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      for (const [selector,value] of [['input[type="email"]','fixture@example.test'],['input[type="password"]','fixture-password']]) {
        const input=document.querySelector(selector); setter.call(input,value);
        input.dispatchEvent(new Event('input',{bubbles:true}));
      }
    })()`);
    // Use the form's native submit event; Supabase is replaced only in this fixture.
    await evaluate(`document.querySelector('form').requestSubmit()`);
    await wait(`document.querySelector('[data-testid="fixture-page"]')?.textContent==='Messages'`);
    await expectPath('/messages/thread-1?tab=unread#latest');
  });
  await check('signed-out /app and signed-in /login resolve without 404', async () => {
    await open('/app', { signedIn: false });
    await wait(`!!document.querySelector('[data-testid="button-login-initial"]')`);
    assert.equal(await evaluate('window.__notFoundSeen'), false);
    await open('/login');
    await expectPath('/', 'home');
  });
  await check('push arriving during credential submission wins over late login callback', async () => {
    await open('/messages/old-thread', { signedIn: false });
    await wait(`!!document.querySelector('[data-testid="button-login-initial"]')`);
    await evaluate(`fixture.loginDelay=250;document.querySelector('[data-testid="button-login-initial"]').click()`);
    await wait(`!!document.querySelector('input[type="email"]')`);
    await evaluate(`(() => {
      const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      for (const [selector,value] of [['input[type="email"]','fixture@example.test'],['input[type="password"]','fixture-password']]) {
        const input=document.querySelector(selector); setter.call(input,value);
        input.dispatchEvent(new Event('input',{bubbles:true}));
      }
      document.querySelector('form').requestSubmit();
      setTimeout(()=>fixture.navigate('/game/new-push?from=notification#details'),50);
    })()`);
    await wait(`document.querySelector('[data-testid="fixture-page"]')?.textContent==='GameDetails'`);
    await expectPath('/game/new-push?from=notification#details');
  });
  await check('account switch and sign-out do not restore another account screen', async () => {
    await open('/app', { saved: savedProfile() });
    await expectPath('/profile', 'profile');
    await evaluate(`fixture.setAuth('second-user')`);
    await wait(`localStorage.getItem('roster.mobile.lastScreen')===null || JSON.parse(localStorage.getItem('roster.mobile.lastScreen')).userId==='second-user'`);
    await evaluate(`fixture.setAuth(null)`);
    await wait(`!!document.querySelector('[data-testid="button-login-initial"]')`);
    assert.equal(await evaluate(`localStorage.getItem('roster.mobile.lastScreen')`), null);
    assert.equal(await evaluate('window.__notFoundSeen'), false);
  });
  await check('warm push and primary tabs resolve normally', async () => {
    await open('/profile'); await expectPath('/profile', 'profile');
    await evaluate(`fixture.navigate('/game/warm-push')`);
    await wait(`document.querySelector('[data-testid="fixture-page"]')?.textContent==='GameDetails'`);
    await expectPath('/game/warm-push');
    for (const [label, path, screen] of [
      ['My Team', '/teams', 'teams'], ['Messages', '/messages', 'messages'],
      ['Payments', '/payment-requests', 'payments'], ['Profile', '/profile', 'profile'], ['Home', '/', 'home'],
    ]) {
      await evaluate(`Array.from(document.querySelectorAll('nav button')).find(b=>b.textContent===${JSON.stringify(label)}).click()`);
      await expectPath(path, screen);
    }
  });
  await check('unknown route remains observable, recovery reaches Home', async () => {
    await open('/private@example.test/secret-token?token=secret');
    await wait(`!!document.querySelector('[data-testid="route-not-found"]')`);
    await new Promise(r => setTimeout(r, 450));
    const reports = await (await fetch('http://127.0.0.1:3001/__reports')).json();
    assert.ok(reports.some(r => r.message === 'Unmatched app route: /unknown/2-segments'));
    assert.doesNotMatch(JSON.stringify(reports), /private@example|secret-token|token=secret/);
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Go Home').click()`);
    await wait(`location.pathname==='/' && !!document.querySelector('[data-testid="screen-home"][aria-hidden="false"]')`);
  });
  assert.deepEqual(errors, []);
  console.log(`${passed} browser scenarios passed; no uncaught browser exceptions.`);
} finally {
  ws.close();
  await fetch(`http://127.0.0.1:9222/json/close/${target.id}`);
}
