import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));

function pathMatcher(source: string) {
  const match = source.match(/^\/:path\((.*)\)$/);
  assert.ok(match, `Expected a named regex path source: ${source}`);
  return new RegExp(`^/(?:${match[1]})$`);
}

const appHostMarketingRedirect = config.redirects.find((route: any) =>
  route.destination === 'https://www.rosterhockey.com/:path',
);
const marketingHostAppRedirect = config.redirects.find((route: any) =>
  route.destination === 'https://www.roster-app.com/:path*' &&
  route.has?.some((condition: any) => condition.type === 'host' && condition.value === 'www.rosterhockey.com'),
);

test('the app host redirects only exact marketing paths and preserves their queries', () => {
  assert.ok(appHostMarketingRedirect);
  const matches = pathMatcher(appHostMarketingRedirect.source);
  for (const path of [
    '/features', '/pricing', '/about', '/hockey', '/baseball', '/soccer',
    '/for-adult-leagues', '/for-youth-teams', '/for-varsity',
    '/referral-program', '/faq', '/support', '/sitemap.xml', '/llms.txt',
  ]) {
    assert.equal(matches.test(path), true, path);
  }
  for (const path of [
    '/', '/login', '/get-started', '/api/auth/user',
    '/referral-program/portal/login', '/referral-program/verify',
    '/.well-known/apple-app-site-association', '/robots.txt', '/manifest.json',
    '/privacy', '/privacy-policy', '/terms-of-service',
  ]) {
    assert.equal(matches.test(path), false, path);
  }
  assert.equal(appHostMarketingRedirect.statusCode, 302);
  assert.equal(appHostMarketingRedirect.preserveQueryParams, true);
});

test('the marketing host sends app paths to the app but keeps marketing and static files', () => {
  assert.ok(marketingHostAppRedirect);
  const matches = pathMatcher(marketingHostAppRedirect.source);
  for (const path of [
    '/login', '/get-started', '/app', '/api/auth/user',
    '/referral-program/portal/login', '/referral-program/verify',
    '/team/123', '/game/123', '/.well-known/apple-app-site-association',
    '/unknown-route',
  ]) {
    assert.equal(matches.test(path), true, path);
  }
  for (const path of [
    '/', '/features', '/pricing', '/referral-program', '/privacy',
    '/privacy-policy', '/terms-of-service', '/sitemap.xml', '/robots.txt',
    '/llms.txt', '/manifest.json', '/assets/app.js',
    '/marketing/roster-home/logo-dark.png', '/badges/beer-me/tier-3.webp',
    '/favicon.png', '/roster-logo.png',
  ]) {
    assert.equal(matches.test(path), false, path);
  }
  assert.equal(marketingHostAppRedirect.statusCode, 302);
  assert.equal(marketingHostAppRedirect.preserveQueryParams, true);
});

test('the app root is not redirected and only the apex marketing host is canonicalized', () => {
  assert.equal(config.redirects.some((route: any) =>
    route.has?.some((condition: any) =>
      condition.type === 'host' &&
      (condition.value === 'roster-app.com' || condition.value === 'www.roster-app.com'),
    ) && route.source === '/',
  ), false);
  const apexMarketingRedirect = config.redirects.find((route: any) =>
    route.has?.some((condition: any) => condition.type === 'host' && condition.value === 'rosterhockey.com'),
  );
  assert.ok(apexMarketingRedirect);
  assert.equal(apexMarketingRedirect.destination, 'https://www.rosterhockey.com/:path*');
  assert.equal(apexMarketingRedirect.statusCode, 302);
  assert.equal(apexMarketingRedirect.preserveQueryParams, true);
});
