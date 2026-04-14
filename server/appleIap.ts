/**
 * Apple App Store Server API utilities.
 *
 * Provides:
 * - JWT generation for authenticating with Apple's App Store Server API
 * - JWS payload decoding (for StoreKit 2 transactions and server notifications)
 * - Transaction lookup and subscription status via the App Store Server API
 */

import { SignJWT, importPKCS8, decodeProtectedHeader, importX509, compactVerify } from 'jose';

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

export interface AppleRenewalInfoPayload {
  originalTransactionId: string;
  productId: string;
  autoRenewStatus: number;
  expirationReason?: number;
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
  summary?: any;
  externalPurchaseToken?: any;
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
 * Decodes and verifies a JWS payload signed by Apple.
 * Apple signs transactions and notification payloads using their own certificate
 * chain, which is embedded in the `x5c` header of the JWS.
 *
 * Security: verifies the signature against the leaf cert from Apple's x5c chain.
 * The cert chain itself should be validated against Apple's root CA in production
 * hardening — for now we verify the signature is cryptographically valid.
 */
export async function decodeAppleJWSPayload(jws: string): Promise<any> {
  const header = decodeProtectedHeader(jws) as any;
  const x5c: string[] = header.x5c;

  if (!x5c || x5c.length === 0) {
    throw new Error('No x5c certificates in Apple JWS header — cannot verify signature');
  }

  // The first certificate in x5c is the leaf (signing) cert
  const leafCertPem = `-----BEGIN CERTIFICATE-----\n${x5c[0]}\n-----END CERTIFICATE-----`;
  const leafPublicKey = await importX509(leafCertPem, 'ES256');

  const { payload } = await compactVerify(jws, leafPublicKey);
  return JSON.parse(new TextDecoder().decode(payload));
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

  // 4xx on production usually means sandbox receipt — retry
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
  const payload = await decodeAppleJWSPayload(data.signedTransactionInfo) as AppleTransactionPayload;
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
          const decoded = await decodeAppleJWSPayload(tx.signedTransactionInfo) as AppleTransactionPayload;
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
