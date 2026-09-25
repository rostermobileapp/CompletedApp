export type BirthdayStatus = { eligible: boolean; birthdayDate?: string; expiresAt?: string };

export function shouldShowBirthdayGreeting(
  status: BirthdayStatus | undefined,
  now: number,
  pendingBadges: unknown,
): boolean {
  const expiresAt = status?.expiresAt ? Date.parse(status.expiresAt) : NaN;
  // The badge request may still be loading when a native WebView resumes.
  // Only a confirmed pending badge should defer the birthday greeting.
  return !!status?.eligible && Number.isFinite(expiresAt) && now < expiresAt
    && !(Array.isArray(pendingBadges) && pendingBadges.length > 0);
}