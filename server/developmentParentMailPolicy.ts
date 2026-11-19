/** Dedicated DEV-only sending; never reuse the application's live mailer. */
import { PARENT_CODE_PATTERN, PARENT_CODE_SECONDS } from "../shared/highSchoolParentCodePolicy";
export type DevParentMailConfig = { key: string; from: string; recipients: string[] };
const email = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/;
export function developmentParentMailConfig(env: NodeJS.ProcessEnv): DevParentMailConfig | undefined {
  if (env.NODE_ENV !== "development" || env.NONPRODUCTION_ISOLATED !== "1"
    || env.PREVIEW_USE_LIVE_SECRETS === "1" || env.DEV_PARENT_EMAIL_ENABLED !== "1") return;
  const key = env.DEV_RESEND_API_KEY;
  const from = env.DEV_PARENT_EMAIL_FROM?.trim();
  const recipients = Array.from(new Set((env.DEV_PARENT_EMAIL_ALLOWLIST ?? "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean)));
  if (!key || !/^re_[A-Za-z0-9_]+$/.test(key) || key === env.RESEND_API_KEY ||
      !from || !email.test(from) || recipients.length < 1 || recipients.length > 3
      || recipients.some(value => !email.test(value))) {
    throw new Error("Dedicated DEV parent-mail configuration is incomplete or unsafe.");
  }
  return { key, from, recipients };
}
export function renderDevelopmentParentEmail(code: string, purpose: "parent_action" | "password_change") {
  if (!PARENT_CODE_PATTERN.test(code) || !["parent_action", "password_change"].includes(purpose)) {
    throw new Error("Invalid DEV parent-mail content.");
  }
  const action = purpose === "password_change" ? "change the shared family password" : "unlock parent-only controls";
  return {
    subject: purpose === "password_change" ? "Roster DEV: Verify password change" : "Roster DEV: Verify parent access",
    text: [
      "DEV TEST ONLY — this message is not from production.",
      "",
      `Your verification code is: ${code}`,
      `Use this code to ${action} in Roster DEV.`,
      `The code expires in ${PARENT_CODE_SECONDS / 60} minutes and can be used once, only in the session that requested it.`,
      "Do not share this code with a child or anyone else.",
      "If you did not request it, ignore this message. No parent access or password change has been approved.",
    ].join("\n"),
  };
}
export function allowedDevelopmentParentMail(
  config: DevParentMailConfig, authorization: string | null, body: unknown,
) {
  if (authorization !== `Bearer ${config.key}` || typeof body !== "string") return false;
  try {
    const value = JSON.parse(body);
    if (!value || Object.keys(value).sort().join(",") !== "from,subject,text,to" ||
        value.from !== config.from || typeof value.to !== "string" ||
        !config.recipients.includes(value.to.toLowerCase())) return false;
    const code = typeof value.text === "string" ? value.text.match(/Your verification code is: (\d{4})\n/)?.[1] : undefined;
    if (!code) return false;
    return (["parent_action", "password_change"] as const).some(purpose => {
      const expected = renderDevelopmentParentEmail(code, purpose);
      return value.subject === expected.subject && value.text === expected.text;
    });
  } catch { return false; }
}
