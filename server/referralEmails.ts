import { getUncachableResendClient } from './resend';

function getAppUrl(): string {
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  return process.env.APP_URL || 'https://rosters.replit.app';
}

function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:#f5f5f5;">
<table role="presentation" style="width:100%;border-collapse:collapse;">
<tr><td align="center" style="padding:40px 20px;">
<table role="presentation" style="width:600px;max-width:100%;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.12);overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,#3b82f6 0%,#1d4ed8 100%);padding:32px 40px;text-align:center;">
<h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">Roster Referral Program</h1>
</td></tr>
<tr><td style="padding:40px;">${content}</td></tr>
<tr><td style="background:#f8f9fa;padding:24px 40px;text-align:center;font-size:12px;color:#6b7280;">
Roster, LLC &nbsp;·&nbsp; <a href="${getAppUrl()}" style="color:#3b82f6;text-decoration:none;">roster-app.com</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Interpolate {{variable}} placeholders in a template string.
 * Variables not present in `vars` are left as-is.
 */
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

/**
 * Convert plain-text template (with line breaks) to minimal HTML body.
 * If the caller provides a custom template it is expected to be plain text;
 * the hardcoded fallbacks are already HTML fragments.
 */
function templateToHtml(text: string): string {
  return `<div style="color:#374151;font-size:15px;line-height:24px;">${
    text.replace(/\n/g, '<br>')
  }</div>`;
}

export async function sendNewApplicationAdminEmail(
  adminEmail: string,
  data: { orgName: string; contactName: string; email: string; orgType?: string }
): Promise<void> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const appUrl = getAppUrl();
    await client.emails.send({
      from: fromEmail,
      to: adminEmail,
      subject: `New Referral Partner Application — ${data.orgName}`,
      html: emailWrapper(`
        <h2 style="margin:0 0 16px 0;color:#111827;font-size:20px;">New Application Received</h2>
        <p style="margin:0 0 20px 0;color:#374151;font-size:15px;line-height:24px;">A new referral partner application has been submitted.</p>
        <div style="background:#f8f9fa;border-left:4px solid #3b82f6;padding:20px;border-radius:4px;margin-bottom:24px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Organization</td><td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;">${data.orgName}</td></tr>
            <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Contact</td><td style="padding:6px 0;font-size:14px;color:#111827;">${data.contactName}</td></tr>
            <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Email</td><td style="padding:6px 0;font-size:14px;color:#111827;">${data.email}</td></tr>
            ${data.orgType ? `<tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Org Type</td><td style="padding:6px 0;font-size:14px;color:#111827;">${data.orgType}</td></tr>` : ''}
          </table>
        </div>
        <a href="https://www.roster-app.com/admin/referrals/login" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:14px;">Review Application</a>
      `),
    });
    console.log(`[ReferralEmail] Sent new application admin notification for ${data.orgName}`);
  } catch (err) {
    console.error('[ReferralEmail] Failed to send new application admin email:', err);
  }
}

/**
 * Send approval email to partner.
 * If `customTemplate` is provided and non-empty, it is used as the email body
 * (plain text with {{variable}} interpolation). Otherwise the default branded
 * HTML template is used.
 *
 * Supported template variables:
 *   {{contactName}}, {{orgName}}, {{referralCode}}, {{loginUrl}}, {{portalUrl}}
 */
export async function sendPartnerApprovalEmail(
  toEmail: string,
  data: { orgName: string; contactName: string; referralCode: string; setupLink?: string },
  customTemplate?: string
): Promise<void> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const portalUrl = `https://www.roster-app.com/referral-program/portal`;
    const loginUrl = `https://www.roster-app.com/referral-program/portal/login`;
    const setupLink = data.setupLink || loginUrl;

    let html: string;
    if (customTemplate && customTemplate.trim()) {
      const vars: Record<string, string> = {
        contactName: data.contactName,
        orgName: data.orgName,
        referralCode: data.referralCode,
        loginUrl,
        portalUrl,
        setupLink,
      };
      html = emailWrapper(templateToHtml(interpolate(customTemplate, vars)));
    } else {
      html = emailWrapper(`
        <h2 style="margin:0 0 8px 0;color:#111827;font-size:20px;">Welcome to the Roster Referral Program!</h2>
        <p style="margin:0 0 20px 0;color:#374151;font-size:15px;line-height:24px;">Hi ${data.contactName}, congratulations! Your application for <strong>${data.orgName}</strong> has been approved.</p>
        <h3 style="margin:0 0 12px 0;color:#111827;font-size:16px;">Getting Started</h3>
        <ol style="margin:0 0 24px 0;padding-left:24px;color:#374151;font-size:14px;line-height:24px;">
          <li><strong>Create your password</strong> using the button below — this link is valid for 24 hours</li>
          <li>Share your referral code with your organization members and hockey community</li>
          <li>When someone signs up for Roster and enters your code during onboarding, the conversion is automatically tracked</li>
          <li>Earn commissions on net revenue for every active subscriber you refer</li>
          <li>View your stats and payout history anytime in your portal</li>
        </ol>
        <div style="text-align:center;margin:32px 0;">
          <a href="${setupLink}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-weight:600;font-size:16px;">Create Your Password</a>
        </div>
        <p style="margin:0 0 8px 0;font-size:13px;color:#6b7280;text-align:center;">This link expires in 24 hours. After setting your password you can sign in anytime at:</p>
        <p style="margin:0;font-size:13px;text-align:center;"><a href="${loginUrl}" style="color:#3b82f6;">${loginUrl}</a></p>
      `);
    }

    await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: `Your Referral Partnership Has Been Approved — ${data.orgName}`,
      html,
    });
    console.log(`[ReferralEmail] Sent approval email to ${toEmail}`);
  } catch (err) {
    console.error('[ReferralEmail] Failed to send approval email:', err);
  }
}

/**
 * Send rejection email to partner.
 * If `customTemplate` is provided and non-empty, it is used as the email body
 * (plain text with {{variable}} interpolation).
 *
 * Supported template variables:
 *   {{contactName}}, {{orgName}}, {{reason}}
 */
export async function sendPartnerRejectionEmail(
  toEmail: string,
  data: { orgName: string; contactName: string; reason: string },
  customTemplate?: string
): Promise<void> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();

    let html: string;
    if (customTemplate && customTemplate.trim()) {
      const vars: Record<string, string> = {
        contactName: data.contactName,
        orgName: data.orgName,
        reason: data.reason,
      };
      html = emailWrapper(templateToHtml(interpolate(customTemplate, vars)));
    } else {
      html = emailWrapper(`
        <h2 style="margin:0 0 16px 0;color:#111827;font-size:20px;">Application Status Update</h2>
        <p style="margin:0 0 20px 0;color:#374151;font-size:15px;line-height:24px;">Hi ${data.contactName}, thank you for your interest in the Roster Referral Program.</p>
        <p style="margin:0 0 16px 0;color:#374151;font-size:15px;line-height:24px;">After reviewing your application for <strong>${data.orgName}</strong>, we're unable to approve it at this time.</p>
        <div style="background:#fef2f2;border-left:4px solid #f87171;padding:16px;border-radius:4px;margin-bottom:24px;">
          <p style="margin:0;font-size:14px;color:#374151;"><strong>Reason:</strong> ${data.reason}</p>
        </div>
        <p style="margin:0;font-size:14px;color:#6b7280;line-height:22px;">If you believe this was made in error or have questions, please contact us at <a href="mailto:roster.mobile.app@gmail.com" style="color:#3b82f6;">roster.mobile.app@gmail.com</a>.</p>
      `);
    }

    await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: `Update on Your Referral Partner Application — ${data.orgName}`,
      html,
    });
    console.log(`[ReferralEmail] Sent rejection email to ${toEmail}`);
  } catch (err) {
    console.error('[ReferralEmail] Failed to send rejection email:', err);
  }
}

/**
 * Send a password reset / setup email to a partner.
 */
export async function sendPasswordResetEmail(
  toEmail: string,
  data: { contactName: string; resetLink: string }
): Promise<void> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const loginUrl = `https://www.roster-app.com/referral-program/portal/login`;
    const html = emailWrapper(`
      <h2 style="margin:0 0 16px 0;color:#111827;font-size:20px;">Reset Your Partner Portal Password</h2>
      <p style="margin:0 0 20px 0;color:#374151;font-size:15px;line-height:24px;">Hi ${data.contactName}, click the button below to set a new password for your Roster Partner Portal.</p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${data.resetLink}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-weight:600;font-size:16px;">Set New Password</a>
      </div>
      <p style="margin:0 0 8px 0;font-size:13px;color:#6b7280;text-align:center;">This link expires in 1 hour and can only be used once.</p>
      <p style="margin:0 0 8px 0;font-size:13px;color:#6b7280;text-align:center;">If you didn't request this, you can safely ignore this email.</p>
      <p style="margin:16px 0 0 0;font-size:13px;text-align:center;color:#6b7280;">Sign in at: <a href="${loginUrl}" style="color:#3b82f6;">${loginUrl}</a></p>
    `);
    await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: 'Reset Your Roster Partner Portal Password',
      html,
    });
    console.log(`[ReferralEmail] Sent password reset email to ${toEmail}`);
  } catch (err) {
    console.error('[ReferralEmail] Failed to send password reset email:', err);
  }
}

export async function sendPartnerCustomEmail(
  toEmail: string,
  subject: string,
  body: string
): Promise<void> {
  const { client, fromEmail } = await getUncachableResendClient();
  await client.emails.send({
    from: fromEmail,
    to: toEmail,
    subject,
    html: emailWrapper(`<div style="color:#374151;font-size:15px;line-height:24px;">${body.replace(/\n/g, '<br>')}</div>`),
  });
}
