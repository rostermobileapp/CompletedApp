import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { checkAppleSigningReadiness, normalizeApplePrivateKey } from '../appleSigningReadiness';

const { privateKey: pem } = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const settings = (key: string) => ({
  APPLE_IAP_KEY_ID: 'diagnostic-key',
  APPLE_IAP_ISSUER_ID: 'diagnostic-issuer',
  APPLE_IAP_PRIVATE_KEY: key,
});

test('valid P-256 PKCS#8 imports and signs ES256', async () => {
  assert.deepEqual(await checkAppleSigningReadiness(settings(pem)), { available: true, reason: 'ready' });
});

test('normalizes actual newlines, literal newlines, quoted values and CRLF consistently', async () => {
  for (const key of [
    pem.replace(/\n/g, '\\n'),
    `"${pem.replace(/\n/g, '\\n')}"`,
    `'\n${pem}\n'`,
    pem.replace(/\n/g, '\r\n'),
    pem.replace(/\n/g, '\\r\\n'),
  ]) {
    assert.equal(normalizeApplePrivateKey(key), pem.trim());
    assert.deepEqual(await checkAppleSigningReadiness(settings(key)), { available: true, reason: 'ready' });
  }
});

test('missing or whitespace-only settings fail closed with names only', async () => {
  assert.deepEqual(await checkAppleSigningReadiness({}), {
    available: false, reason: 'missing_settings',
    missing: ['APPLE_IAP_KEY_ID', 'APPLE_IAP_ISSUER_ID', 'APPLE_IAP_PRIVATE_KEY'],
  });
  assert.deepEqual(await checkAppleSigningReadiness({ ...settings(pem), APPLE_IAP_KEY_ID: '  ' }), {
    available: false, reason: 'missing_settings', missing: ['APPLE_IAP_KEY_ID'],
  });
});

test('filename and non-PKCS#8 values are rejected without exposing the input', async () => {
  for (const key of ['AuthKey_example.p8', 'private-diagnostic-value', '-----BEGIN EC PRIVATE KEY-----\nabc\n-----END EC PRIVATE KEY-----']) {
    const result = await checkAppleSigningReadiness(settings(key));
    assert.deepEqual(result, { available: false, reason: 'invalid_key_format' });
    assert.equal(JSON.stringify(result).includes(key), false);
  }
});

test('malformed key body is rejected without returning provider errors', async () => {
  assert.deepEqual(await checkAppleSigningReadiness(settings(
    '-----BEGIN PRIVATE KEY-----\nnot-a-valid-key\n-----END PRIVATE KEY-----',
  )), { available: false, reason: 'invalid_signing_key' });
});

test('a valid RSA PKCS#8 key cannot masquerade as an ES256 key', async () => {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  assert.deepEqual(await checkAppleSigningReadiness(settings(privateKey)), {
    available: false, reason: 'invalid_signing_key',
  });
});

test('a valid EC key on the wrong curve cannot masquerade as ES256', async () => {
  const { privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'secp384r1',
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  assert.deepEqual(await checkAppleSigningReadiness(settings(privateKey)), {
    available: false, reason: 'invalid_signing_key',
  });
});