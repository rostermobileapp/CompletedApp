import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_SITE_ORIGIN,
  MARKETING_SITE_ORIGIN,
  canonicalOriginForPath,
  canonicalUrl,
  isMarketingPagePath,
} from './seoMetadata';

test('marketing routes are exact, including referral portal boundary', () => {
  for (const path of [
    '/', '/features', '/pricing', '/about', '/hockey', '/baseball', '/soccer',
    '/for-adult-leagues', '/for-youth-teams', '/for-varsity', '/referral-program',
    '/faq', '/support', '/privacy-policy', '/privacy', '/terms-of-service',
    '/sitemap.xml', '/robots.txt', '/llms.txt',
  ]) {
    assert.equal(isMarketingPagePath(path), true, path);
  }
  assert.equal(isMarketingPagePath('/referral-program/portal/login'), false);
  assert.equal(isMarketingPagePath('/referral-program/verify'), false);
  assert.equal(isMarketingPagePath('/privacy-policy/subpage'), false);
  assert.equal(isMarketingPagePath('/manifest.json'), false);
});

test('canonical URLs split marketing paths from app paths and normalize trailing slashes', () => {
  assert.equal(canonicalUrl('/features/'), `${MARKETING_SITE_ORIGIN}/features`);
  assert.equal(canonicalUrl('/privacy'), `${MARKETING_SITE_ORIGIN}/privacy`);
  assert.equal(canonicalUrl('/referral-program/portal/login'), `${APP_SITE_ORIGIN}/referral-program/portal/login`);
  assert.equal(canonicalUrl('/manifest.json'), `${APP_SITE_ORIGIN}/manifest.json`);
  assert.equal(canonicalUrl('/login?next=%2Fcalendar'), `${APP_SITE_ORIGIN}/login`);
});

test('root canonical stays on the app domain for app-host visitors', () => {
  assert.equal(canonicalOriginForPath('/', 'www.roster-app.com'), APP_SITE_ORIGIN);
  assert.equal(canonicalOriginForPath('/', 'roster-app.com'), APP_SITE_ORIGIN);
  assert.equal(canonicalOriginForPath('/', 'www.rosterhockey.com'), MARKETING_SITE_ORIGIN);
  assert.equal(canonicalUrl('/', { appRoot: true }), `${APP_SITE_ORIGIN}/`);
});
