import { campaignFromUrl, normalizeReferralCode, referralCodesFromUrl, type CapturedPartner, type CampaignContext } from "@shared/signupAttribution";

export const SIGNUP_ATTRIBUTION_KEY = "roster.signup-attribution.v1";
export type PendingAttribution = {
  candidates: string[];
  partner?: CapturedPartner;
  campaign?: CampaignContext;
  ownerUserId?: string;
};
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Validate = (code: string) => Promise<CapturedPartner | null>;

/** Serialized validation makes an invalid code skippable, not a permanent lock. */
export function createSignupAttribution(storage: StorageLike, validate: Validate) {
  let pending: Promise<void> = Promise.resolve();
  const read = (): PendingAttribution => {
    const raw = storage.getItem(SIGNUP_ATTRIBUTION_KEY);
    if (!raw) return { candidates: [] };
    try {
      const value = JSON.parse(raw);
      return {
        candidates: Array.isArray(value.candidates) ? value.candidates.map(normalizeReferralCode).filter(Boolean).slice(0, 10) : [],
        partner: value.partner && typeof value.partner.id === "string" && typeof value.partner.orgName === "string" && normalizeReferralCode(value.partner.code)
          ? { id: value.partner.id.slice(0, 100), code: normalizeReferralCode(value.partner.code)!, orgName: value.partner.orgName.slice(0, 255) } : undefined,
        campaign: value.campaign && typeof value.campaign === "object"
          ? campaignFromUrl(`/?${new URLSearchParams(value.campaign)}`) : undefined,
        ownerUserId: typeof value.ownerUserId === "string" ? value.ownerUserId : undefined,
      };
    } catch {
      throw new Error("Saved signup attribution could not be read. Reload or contact support before continuing.");
    }
  };
  const write = (value: PendingAttribution) => storage.setItem(SIGNUP_ATTRIBUTION_KEY, JSON.stringify(value));
  const capture = (url: string) => {
    // Save the candidates before routing/auth can change the address.
    const value = read();
    if (!value.partner) value.candidates = Array.from(new Set([...value.candidates, ...referralCodesFromUrl(url)])).slice(0, 10);
    const campaign = campaignFromUrl(url);
    if (!value.campaign && Object.keys(campaign).length) value.campaign = campaign;
    write(value);
    pending = pending.catch(() => {}).then(async () => {
      let current = read();
      if (current.partner) return;
      for (const code of current.candidates) {
        // A provider/network error stops validation, leaving the original queue
        // available for retry. It must not let a later referral take precedence.
        const partner = await validate(code);
        current = read();
        if (current.partner) return;
        if (partner) {
          current.partner = partner;
          current.candidates = [];
          write(current);
          return;
        }
        current.candidates = current.candidates.filter(candidate => candidate !== code);
        write(current);
      }
    });
    return pending;
  };
  const forUser = (userId: string) => {
    const value = read();
    if (value.ownerUserId && value.ownerUserId !== userId) return null;
    value.ownerUserId = userId;
    write(value);
    return value;
  };
  return {
    capture, read, forUser,
    ready: () => pending,
    clear: () => storage.removeItem(SIGNUP_ATTRIBUTION_KEY),
    async metadata() {
      await pending;
      const value = read();
      if (value.ownerUserId) return {};
      return {
        ...(value.partner ? { initial_referral: value.partner } : {}),
        ...(value.campaign ? { acquisition_campaign: value.campaign } : {}),
      };
    },
  };
}
