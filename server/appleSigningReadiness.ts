import { importPKCS8, SignJWT } from 'jose';

const REQUIRED_SETTINGS = [
  'APPLE_IAP_KEY_ID', 'APPLE_IAP_ISSUER_ID', 'APPLE_IAP_PRIVATE_KEY',
] as const;

export interface AppleSigningReadiness {
  available: boolean;
  reason: 'ready' | 'missing_settings' | 'invalid_key_format' | 'invalid_signing_key' | 'runtime_unavailable';
  missing?: string[];
}

/** Preserve the key material; normalize only common environment-variable paste formatting. */
export function normalizeApplePrivateKey(value: string): string {
  const trimmed = value.trim();
  const unquoted = trimmed.replace(/^(['"])([\s\S]*)\1$/, '$2').trim();
  return unquoted.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();
}

/** Local-only self-test: never calls Apple, writes data, or returns credentials or a JWT. */
export async function checkAppleSigningReadiness(
  env: Record<string, string | undefined> = process.env,
): Promise<AppleSigningReadiness> {
  const missing = REQUIRED_SETTINGS.filter(name => !env[name]?.trim());
  if (missing.length) return { available: false, reason: 'missing_settings', missing };
  const pem = normalizeApplePrivateKey(env.APPLE_IAP_PRIVATE_KEY!);
  if (!pem.startsWith('-----BEGIN PRIVATE KEY-----') ||
      !pem.endsWith('-----END PRIVATE KEY-----')) {
    return { available: false, reason: 'invalid_key_format' };
  }
  try {
    const key = await importPKCS8(pem, 'ES256');
    // Import alone can accept a key that cannot actually sign ES256 requests.
    await new SignJWT({ diagnostic: true })
      .setProtectedHeader({ alg: 'ES256' })
      .sign(key);
    return { available: true, reason: 'ready' };
  } catch (error) {
    return {
      available: false,
      reason: error instanceof ReferenceError && error.message.includes('crypto')
        ? 'runtime_unavailable' : 'invalid_signing_key',
    };
  }
}