export const BILLING_WEB_RELEASE = 'natively-account-association-2026-10-02';
export function logBillingStage(platform: 'android' | 'ios', stage: 'preflight' | 'checkout' | 'restore' | 'verify' | 'refresh' | 'active' | 'pending'): void {
  console.info('[NativeBilling]', { platform, stage, webRelease: BILLING_WEB_RELEASE, nativeBuild: 'unreported' });
}