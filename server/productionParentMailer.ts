import { PARENT_CODE_PATTERN, PARENT_CODE_SECONDS } from "../shared/highSchoolParentCodePolicy";
import { ParentSecurityError, type ParentCodeMailer } from "./highSchoolParentSecurity";

/** Separate from the synthetic, allowlisted DEV transport. No codes or
 * provider response bodies may be logged, cached or returned to a client. */
export function createProductionParentMailer(env: NodeJS.ProcessEnv = process.env,
  transport: typeof fetch = fetch): ParentCodeMailer {
  return async ({ to, code, purpose }) => {
    if (env.NODE_ENV !== "production" || env.NONPRODUCTION_ISOLATED === "1" ||
      env.PREVIEW_USE_LIVE_SECRETS === "1" || !env.RESEND_API_KEY || !PARENT_CODE_PATTERN.test(code) ||
      !["parent_action", "password_change"].includes(purpose) || /[\r\n]/.test(to)) {
      throw new ParentSecurityError("PARENT_EMAIL_DELIVERY_UNAVAILABLE", 503);
    }
    const subject = purpose === "password_change"
      ? "RosterHockey family password-change code" : "RosterHockey parent verification code";
    const text = `Your ${purpose === "password_change" ? "password-change" : "parent verification"} code is ${code}.\n\n` +
      `It expires in ${PARENT_CODE_SECONDS / 60} minutes. Never share this code, including with someone who knows the family password.\n\n` +
      "If you did not request this code, ignore it. No parent access or password change has been approved.";
    try {
      const response = await transport("https://api.resend.com/emails", {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: env.RESEND_FROM_EMAIL || "contact@notifications.roster-app.com", to, subject, text }),
      });
      if (!response.ok) throw new Error("Delivery not accepted");
      const result = await response.json() as { id?: unknown };
      if (typeof result.id !== "string" || !result.id) throw new Error("No delivery identifier");
    } catch { throw new ParentSecurityError("PARENT_EMAIL_DELIVERY_UNAVAILABLE", 503); }
  };
}
