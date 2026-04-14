/**
 * Apple App Store Server API utilities.
 *
 * Provides:
 * - JWT generation for authenticating with Apple's App Store Server API
 * - JWS payload decoding with FULL certificate chain validation against Apple Root CA G3
 * - Transaction lookup and subscription status via the App Store Server API
 *
 * Security model:
 * - JWS payloads are verified against the x5c certificate chain embedded in each payload
 * - The chain is validated up to Apple Root CA G3 (hardcoded public cert)
 * - This prevents an attacker from forging payloads with their own self-signed certs
 */

import { SignJWT, importPKCS8, decodeProtectedHeader, importX509, compactVerify } from 'jose';
import { X509Certificate } from 'node:crypto';

// Apple Root CA G3 (EC key) — publicly available at https://www.apple.com/certificateauthority/
// This is the trust anchor for all Apple App Store Server API JWS payloads.
const APPLE_ROOT_CA_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`;

// Pre-compute Apple root fingerprint for fast comparison
const APPLE_ROOT_CERT = new X509Certificate(APPLE_ROOT_CA_G3_PEM);

export const BUNDLE_ID = 'com.rosterapp';

const API_BASE_PROD = 'https://api.storekit.itunes.apple.com';
const API_BASE_SANDBOX = 'https://api.storekit-sandbox.itunes.apple.com';

export interface AppleTransactionPayload {
  bundleId: string;
  productId: string;
  transactionId: string;
  originalTransactionId: string;
  purchaseDate: number;
  expiresDate?: number;
  appAccountToken?: string;
  environment: 'Sandbox' | 'Production';
  type: string;
  inAppOwnershipType?: string;
  revocationDate?: number;
  revocationReason?: number;
}

export interface AppleNotificationPayload {
  notificationType: string;
  subtype?: string;
  version?: string;
  bundleId: string;
  appAppleId?: number;
  bundleVersion?: string;
  environment: string;
  signedDate: number;
  data?: {
    bundleId: string;
    bundleVersion?: string;
    environment: string;
    signedTransactionInfo: string;
    signedRenewalInfo?: string;
  };
  summary?: unknown;
  externalPurchaseToken?: unknown;
}

// Cached JWT to avoid regenerating for every API call
let _cachedJWT: { token: string; exp: number } | null = null;

/** Returns true if all required Apple IAP environment variables are set. */
export function isAppleIapConfigured(): boolean {
  return !!(
    process.env.APPLE_IAP_KEY_ID &&
    process.env.APPLE_IAP_ISSUER_ID &&
    process.env.APPLE_IAP_PRIVATE_KEY
  );
}

/**
 * Generates (and caches) a signed JWT for the App Store Server API.
 * Uses ES256 with the private key from APPLE_IAP_PRIVATE_KEY env var.
 */
export async function generateAppleJWT(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (_cachedJWT && _cachedJWT.exp > now + 60) {
    return _cachedJWT.token;
  }

  const keyId = process.env.APPLE_IAP_KEY_ID!;
  const issuerId = process.env.APPLE_IAP_ISSUER_ID!;
  const privateKeyPem = process.env.APPLE_IAP_PRIVATE_KEY!;

  const privateKey = await importPKCS8(privateKeyPem, 'ES256');

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(issuerId)
    .setAudience('appstoreconnect-v1')
    .setIssuedAt()
    .setExpirationTime('30m')
    .sign(privateKey);

  _cachedJWT = { token, exp: now + 30 * 60 };
  return token;
}

/**
 * Validates the x5c certificate chain embedded in an Apple JWS header.
 *
 * Steps:
 * 1. Decode each DER cert from base64
 * 2. Verify every cert is issued by (and its signature verifiable by) the next cert in the chain
 * 3. Verify the root cert in the chain is Apple Root CA G3 (by fingerprint)
 *
 * Throws if the chain is invalid or does not root to Apple's known CA.
 */
async function validateAppleCertChain(x5c: string[]): Promise<void> {
  if (x5c.length < 2) {
    throw new Error('Apple JWS x5c chain too short — expected at least leaf + intermediate');
  }

  // Parse all certs from base64 DER
  const certs = x5c.map((b64) => new X509Certificate(Buffer.from(b64, 'base64')));

  // Verify each cert is signed by the next one in the chain
  for (let i = 0; i < certs.length - 1; i++) {
    const subject = certs[i];
    const issuer = certs[i + 1];

    if (!subject.checkIssued(issuer)) {
      throw new Error(`Apple cert chain broken: cert[${i}] was not issued by cert[${i + 1}]`);
    }
    if (!subject.verify(issuer.publicKey)) {
      throw new Error(`Apple cert chain signature invalid at position ${i}`);
    }
  }

  // Verify the root of the chain (the last cert) is the Apple Root CA G3 we trust.
  // Compare fingerprints of the chain root against our hardcoded Apple root CA.
  const chainRoot = certs[certs.length - 1];
  const isAppleRoot =
    chainRoot.fingerprint256 === APPLE_ROOT_CERT.fingerprint256 ||
    // Also handle: x5c only contains [leaf, intermediate]; the intermediate should
    // itself be verifiable by Apple Root CA G3.
    chainRoot.verify(APPLE_ROOT_CERT.publicKey);

  if (!isAppleRoot) {
    throw new Error('Apple JWS certificate chain does not root to Apple Root CA G3');
  }
}

/**
 * Decodes and verifies a JWS payload signed by Apple.
 *
 * Security guarantees:
 * - Verifies the full x5c certificate chain against Apple Root CA G3
 * - Verifies the JWS signature against the leaf cert's public key
 * - Rejects any payload whose certificate chain does not originate from Apple
 */
export async function decodeAppleJWSPayload(jws: string): Promise<Record<string, unknown>> {
  const header = decodeProtectedHeader(jws) as Record<string, unknown>;
  const x5c = header.x5c as string[] | undefined;

  if (!x5c || x5c.length === 0) {
    throw new Error('No x5c certificates in Apple JWS header — cannot verify signature');
  }

  // Step 1: validate the full certificate chain against Apple Root CA G3
  await validateAppleCertChain(x5c);

  // Step 2: import the leaf cert's public key and verify the JWS signature
  const leafCertPem = `-----BEGIN CERTIFICATE-----\n${x5c[0]}\n-----END CERTIFICATE-----`;
  const leafPublicKey = await importX509(leafCertPem, 'ES256');

  const { payload } = await compactVerify(jws, leafPublicKey);
  return JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;
}

/**
 * Look up a single transaction by its transaction ID using the App Store Server API.
 * Tries production first, falls back to sandbox.
 */
export async function lookupTransactionById(transactionId: string): Promise<{
  payload: AppleTransactionPayload;
  environment: 'Sandbox' | 'Production';
}> {
  const jwt = await generateAppleJWT();

  let res = await fetch(`${API_BASE_PROD}/inApps/v1/transactions/${transactionId}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  let environment: 'Sandbox' | 'Production' = 'Production';

  // 4xx on production typically means sandbox receipt — retry
  if (res.status === 404 || res.status === 400) {
    res = await fetch(`${API_BASE_SANDBOX}/inApps/v1/transactions/${transactionId}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    environment = 'Sandbox';
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Apple transactions API error ${res.status}: ${body}`);
  }

  const data = await res.json() as { signedTransactionInfo: string };
  const payload = await decodeAppleJWSPayload(data.signedTransactionInfo) as unknown as AppleTransactionPayload;
  return { payload, environment };
}

/**
 * Get all active subscription items for a given originalTransactionId.
 * Returns only entries where status is active (1) or in grace period (4).
 */
export async function getSubscriptionStatuses(originalTransactionId: string): Promise<{
  activePayloads: AppleTransactionPayload[];
  environment: 'Sandbox' | 'Production';
}> {
  const jwt = await generateAppleJWT();
  const now = Date.now();

  let res = await fetch(`${API_BASE_PROD}/inApps/v1/subscriptions/${originalTransactionId}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  let environment: 'Sandbox' | 'Production' = 'Production';

  if (res.status === 404 || res.status === 400) {
    res = await fetch(`${API_BASE_SANDBOX}/inApps/v1/subscriptions/${originalTransactionId}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    environment = 'Sandbox';
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Apple subscriptions API error ${res.status}: ${body}`);
  }

  const data = await res.json() as {
    data: Array<{
      lastTransactions: Array<{
        status: number;
        originalTransactionId: string;
        signedTransactionInfo: string;
      }>;
    }>;
  };

  const activePayloads: AppleTransactionPayload[] = [];
  for (const sub of data.data ?? []) {
    for (const tx of sub.lastTransactions ?? []) {
      // status 1 = Active, 4 = In Billing Grace Period
      if (tx.status === 1 || tx.status === 4) {
        try {
          const decoded = await decodeAppleJWSPayload(tx.signedTransactionInfo) as unknown as AppleTransactionPayload;
          // Double-check expiry from the payload itself
          if (!decoded.expiresDate || decoded.expiresDate > now) {
            activePayloads.push(decoded);
          }
        } catch (e) {
          console.warn('[IAP] Failed to decode signedTransactionInfo in subscription status:', e);
        }
      }
    }
  }

  return { activePayloads, environment };
}
