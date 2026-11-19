import { ParentSecurityError, unavailableParentMailer, type ParentCodeMailer } from "./highSchoolParentSecurity";
import { developmentParentMailConfig, renderDevelopmentParentEmail } from "./developmentParentMailPolicy";

export function createDevelopmentParentMailer(env: NodeJS.ProcessEnv = process.env): ParentCodeMailer {
  const config = developmentParentMailConfig(env);
  if (!config) return unavailableParentMailer;
  return async mail => {
    if (!config.recipients.includes(mail.to.toLowerCase())) {
      throw new ParentSecurityError("DEV_PARENT_RECIPIENT_NOT_APPROVED", 503);
    }
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: config.from, to: mail.to, ...renderDevelopmentParentEmail(mail.code, mail.purpose) }),
      });
      if (!response.ok) throw new Error("Sending was not accepted.");
      const result = await response.json() as { id?: unknown };
      if (typeof result.id !== "string" || !result.id) throw new Error("No delivery identifier.");
      // Accepted by provider is NOT proof of inbox receipt. Never log its body.
    } catch { throw new ParentSecurityError("PARENT_EMAIL_DELIVERY_UNAVAILABLE", 503); }
  };
}
