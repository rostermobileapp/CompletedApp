import { apiRequest } from "./queryClient";
import { supabase } from "./supabase";
import { createSignupAttribution } from "./signupAttribution";
import { normalizeReferralCode, type CapturedPartner } from "@shared/signupAttribution";

async function validate(code: string): Promise<CapturedPartner | null> {
  let response: Response;
  try {
    response = await apiRequest("GET", `/api/referral/validate-code?code=${encodeURIComponent(code)}`);
  } catch (error: any) {
    if (error?.status === 404) return null;
    throw new Error("Your referral could not be verified. Please try again before completing signup.");
  }
  const result = await response.json();
  if (result.valid !== true || typeof result.id !== "string") throw new Error("Referral verification is temporarily unavailable.");
  return { id: result.id, code, orgName: result.orgName };
}

let controller: ReturnType<typeof createSignupAttribution> | undefined;
export function signupAttribution() {
  return controller ??= createSignupAttribution(window.localStorage, validate);
}

export function beginSignupAttribution() {
  // Not a hidden fallback: retain the original queue and surface the same error
  // at signup/confirmation, without breaking unrelated app startup.
  try {
    void signupAttribution().capture(window.location.href).catch(() => {
      console.warn("Signup attribution is pending verification; it will be retried at signup/onboarding.");
    });
    supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_OUT") return;
      try {
        if (signupAttribution().read().ownerUserId) signupAttribution().clear();
      } catch {
        console.warn("Signup attribution could not be cleared after sign-out; it remains account-bound.");
      }
    });
  } catch {
    console.warn("Signup attribution storage is unavailable; signup will show an explicit error rather than lose referral data.");
  }
}

export async function signupAttributionMetadata() {
  await signupAttribution().capture(window.location.href);
  return signupAttribution().metadata();
}

export function bindSignupAttributionUser(userId: string) {
  signupAttribution().forUser(userId);
}

export async function loadSignupAttribution() {
  await signupAttribution().capture(window.location.href);
  const { data, error } = await supabase.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError") {
    throw new Error("Your account could not be verified. Please retry before confirming your referral.");
  }
  if (!data.user) {
    const pending = signupAttribution().read();
    return { partner: !pending.ownerUserId && pending.partner ? await validate(pending.partner.code) ?? undefined : undefined };
  }
  const user = data.user;
  const local = signupAttribution().forUser(user.id);
  // Supabase metadata is untrusted campaign context, never a credit record.
  // Revalidate even metadata received through a confirmation link/device.
  const savedCode = normalizeReferralCode(user.user_metadata?.initial_referral?.code);
  const previousPartner = savedCode ? await validate(savedCode) : null;
  const partner = previousPartner || (local?.partner ? await validate(local.partner.code) : undefined);
  const metadata: Record<string, unknown> = {};
  if (!user.user_metadata?.acquisition_campaign && local?.campaign) metadata.acquisition_campaign = local.campaign;
  if (!user.user_metadata?.initial_referral && partner) metadata.initial_referral = partner;
  if (Object.keys(metadata).length) {
    const updated = await supabase.auth.updateUser({ data: metadata });
    if (updated.error) throw new Error("Campaign information could not be saved. Please retry.");
  }
  return { partner, userId: user.id };
}
