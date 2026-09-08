import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmail } from '../emailNormalization.js';

describe('email identity normalization', () => {
  test('trims and lowercases imported email addresses', () => {
    assert.equal(normalizeEmail('  Laguns148@SBCGLOBAL.NET '), 'laguns148@sbcglobal.net');
  });

  test('uses the same identity for case-only variations', () => {
    assert.equal(
      normalizeEmail('Player@Example.com'),
      normalizeEmail('player@example.COM'),
    );
  });

  test('treats blank and missing values as no email', () => {
    assert.equal(normalizeEmail('   '), null);
    assert.equal(normalizeEmail(null), null);
    assert.equal(normalizeEmail(undefined), null);
  });
});