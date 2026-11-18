/** Public navigation/campaign data only. None of these values grant credit. */
export const REFERRAL_QUERY_KEYS = [
  "ref", "referral", "referral_code", "referralCode", "partner", "partner_code", "partnerCode",
] as const;

export type CampaignContext = Record<string, string>;
export type CapturedPartner = { id: string; code: string; orgName: string };

export function normalizeReferralCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9_-]{1,20}$/.test(code) ? code : null;
}

export function referralCodesFromUrl(url: string): string[] {
  const params = new URL(url, "https://www.roster-app.com").searchParams;
  return Array.from(new Set(REFERRAL_QUERY_KEYS.flatMap(key =>
    params.getAll(key).map(normalizeReferralCode).filter((code): code is string => !!code))));
}

export function campaignFromUrl(url: string): CampaignContext {
  const result: CampaignContext = {};
  new URL(url, "https://www.roster-app.com").searchParams.forEach((value, key) => {
    if (Object.keys(result).length >= 20) return;
    if (!/^utm_[a-z0-9_]{1,40}$/i.test(key) && !["campaign", "campaign_id"].includes(key)) return;
    const clean = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200);
    if (clean && !(key in result)) result[key] = clean;
  });
  return result;
}

/** Used by the later WEBSITE export; deliberately not wired into marketing yet. */
export function appAttributionUrl(destination: string, currentUrl: string): string {
  const target = new URL(destination, "https://www.roster-app.com");
  if (target.origin !== "https://www.roster-app.com") throw new Error("App attribution links require the canonical app origin");
  const current = new URL(currentUrl, target.origin);
  // Canonical ordered candidates preserve first-touch order across aliases and
  // allow the APP to skip an invalid first code rather than discard the next.
  const candidates = Array.from(new Set([...referralCodesFromUrl(target.href), ...referralCodesFromUrl(current.href)]));
  for (const key of REFERRAL_QUERY_KEYS) target.searchParams.delete(key);
  candidates.forEach(code => target.searchParams.append("ref", code));
  for (const [key, value] of Object.entries(campaignFromUrl(current.href))) {
    if (!target.searchParams.has(key)) target.searchParams.set(key, value);
  }
  return target.href;
}
