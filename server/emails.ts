import { getUncachableResendClient } from './resend';
import { format } from 'date-fns';

const APP_URL = process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : 'https://rosters.replit.app';

const APPLE_URL = 'https://apps.apple.com/us/app/roster-hockey/id6756852981';
const GOOGLE_URL = 'https://play.google.com/store/apps/details?id=com.aFFhvtIzJvyF.natively&utm_source=na_Med';

// Use a publicly hosted URL for the logo so email clients can load it.
// base64 data URIs are blocked by Gmail and inflate email size past Gmail's
// 102 KB clipping threshold, causing emails to show as "[Message clipped]".
const LOGO_URL = 'https://rosters.replit.app/roster-logo-email.png';

function emailShell(title: string, bodyContent: string, accentColor = '#3b82f6'): string {
  const logoUrl = LOGO_URL;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f2f5;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">

          <!-- HEADER -->
          <tr>
            <td align="center" style="background-color:#0a0a0a;padding:28px 40px;">
              <img src="${logoUrl}" alt="Roster Hockey" width="200" style="display:block;max-width:200px;height:auto;">
            </td>
          </tr>

          <!-- ACCENT BAR -->
          <tr>
            <td style="height:4px;background-color:${accentColor};font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- BODY -->
          ${bodyContent}

          <!-- APP DOWNLOAD -->
          <tr>
            <td style="padding:0 40px 32px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8faff;border:1px solid #dbeafe;border-radius:10px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 6px 0;font-size:13px;font-weight:700;color:#1e3a8a;text-transform:uppercase;letter-spacing:0.05em;">Get Roster Hockey</p>
                    <p style="margin:0 0 16px 0;font-size:13px;color:#64748b;line-height:1.5;">Download the app to RSVP, view schedules, and stay connected with your team.</p>
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-right:10px;">
                          <a href="${APPLE_URL}" style="display:inline-block;background-color:#0a0a0a;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;letter-spacing:0.01em;">&#xf8ff; App Store</a>
                        </td>
                        <td>
                          <a href="${GOOGLE_URL}" style="display:inline-block;background-color:#1a73e8;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;letter-spacing:0.01em;">&#9654; Google Play</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background-color:#0a0a0a;padding:20px 40px;text-align:center;">
              <p style="margin:0 0 6px 0;font-size:12px;color:#6b7280;line-height:1.6;">
                Sent by <strong style="color:#9ca3af;">Roster Hockey</strong> &mdash; Your beer league hockey app.
              </p>
              <a href="https://RosterHockey.com" style="font-size:12px;color:#3b82f6;text-decoration:none;">RosterHockey.com</a>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

interface ScrimmageInviteData {
  scrimmageId: string;
  title: string;
  dateTime: Date;
  location: string;
  creatorName: string;
  skillLevel?: string;
  costPerPlayer?: string;
  notes?: string;
  maxPlayers: number;
}

export async function sendScrimmageInviteEmail(
  recipientEmail: string,
  scrimmageData: ScrimmageInviteData
): Promise<void> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();

    const formattedDate = format(scrimmageData.dateTime, 'EEEE, MMMM d, yyyy');
    const formattedTime = format(scrimmageData.dateTime, 'h:mm a');
    const scrimmageUrl = `${APP_URL}/?scrimmage=${scrimmageData.scrimmageId}`;

    const body = `
          <tr>
            <td style="padding:36px 40px 8px 40px;">
              <p style="margin:0 0 4px 0;font-size:13px;font-weight:600;color:#3b82f6;text-transform:uppercase;letter-spacing:0.08em;">Scrimmage Invitation</p>
              <h1 style="margin:0 0 8px 0;font-size:26px;font-weight:800;color:#0a0a0a;line-height:1.2;">${scrimmageData.title}</h1>
              <p style="margin:0 0 28px 0;font-size:15px;color:#475569;line-height:1.5;">
                <strong style="color:#0a0a0a;">${scrimmageData.creatorName}</strong> has invited you to hit the ice.
              </p>

              <!-- Details card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
                          <span style="font-size:13px;color:#64748b;display:block;margin-bottom:2px;">Date</span>
                          <span style="font-size:15px;font-weight:600;color:#0a0a0a;">${formattedDate}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
                          <span style="font-size:13px;color:#64748b;display:block;margin-bottom:2px;">Time</span>
                          <span style="font-size:15px;font-weight:600;color:#0a0a0a;">${formattedTime}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
                          <span style="font-size:13px;color:#64748b;display:block;margin-bottom:2px;">Location</span>
                          <span style="font-size:15px;font-weight:600;color:#0a0a0a;">${scrimmageData.location}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0${scrimmageData.skillLevel || scrimmageData.costPerPlayer ? ';border-bottom:1px solid #e2e8f0' : ''};">
                          <span style="font-size:13px;color:#64748b;display:block;margin-bottom:2px;">Max Players</span>
                          <span style="font-size:15px;font-weight:600;color:#0a0a0a;">${scrimmageData.maxPlayers}</span>
                        </td>
                      </tr>
                      ${scrimmageData.skillLevel ? `
                      <tr>
                        <td style="padding:8px 0;${scrimmageData.costPerPlayer ? 'border-bottom:1px solid #e2e8f0;' : ''}">
                          <span style="font-size:13px;color:#64748b;display:block;margin-bottom:2px;">Skill Level</span>
                          <span style="font-size:15px;font-weight:600;color:#0a0a0a;">${scrimmageData.skillLevel}</span>
                        </td>
                      </tr>` : ''}
                      ${scrimmageData.costPerPlayer ? `
                      <tr>
                        <td style="padding:8px 0;">
                          <span style="font-size:13px;color:#64748b;display:block;margin-bottom:2px;">Cost per Player</span>
                          <span style="font-size:15px;font-weight:600;color:#0a0a0a;">$${scrimmageData.costPerPlayer}</span>
                        </td>
                      </tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>

              ${scrimmageData.notes ? `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fffbeb;border:1px solid #fde68a;border-radius:10px;margin-bottom:28px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 6px 0;font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.06em;">Notes from the organizer</p>
                    <p style="margin:0;font-size:14px;color:#78350f;line-height:1.6;">${scrimmageData.notes}</p>
                  </td>
                </tr>
              </table>` : ''}

              <!-- CTA -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td align="center">
                    <div style="background-color:#0a0a0a;border-radius:12px;padding:20px 32px;display:inline-block;">
                      <p style="margin:0 0 4px 0;font-size:18px;font-weight:800;color:#ffffff;text-align:center;letter-spacing:0.01em;">Open the Roster Hockey app to RSVP</p>
                      <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;">Download the app using the links below</p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;

    const htmlContent = emailShell("You're Invited to a Scrimmage", body);

    const textContent = `
You're Invited to a Scrimmage!

${scrimmageData.creatorName} has invited you to join:

${scrimmageData.title}

Date: ${formattedDate}
Time: ${formattedTime}
Location: ${scrimmageData.location}
Max Players: ${scrimmageData.maxPlayers}
${scrimmageData.skillLevel ? `Skill Level: ${scrimmageData.skillLevel}\n` : ''}${scrimmageData.costPerPlayer ? `Cost: $${scrimmageData.costPerPlayer} per player\n` : ''}
${scrimmageData.notes ? `\nNotes:\n${scrimmageData.notes}\n` : ''}
RSVP and view details:
${scrimmageUrl}

Download Roster Hockey to manage your RSVP:
App Store: ${APPLE_URL}
Google Play: ${GOOGLE_URL}

---
Sent by Roster Hockey - Your beer league hockey app
Visit: https://RosterHockey.com
    `.trim();

    await client.emails.send({
      from: fromEmail,
      to: recipientEmail,
      subject: `You're invited: ${scrimmageData.title}`,
      html: htmlContent,
      text: textContent,
    });

    console.log(`✅ Sent scrimmage invite email to ${recipientEmail}`);
  } catch (error) {
    console.error(`❌ Failed to send scrimmage invite email to ${recipientEmail}:`, error);
    throw error;
  }
}

export async function sendBulkScrimmageInvites(
  emails: string[],
  scrimmageData: ScrimmageInviteData
): Promise<{ sent: string[]; failed: string[] }> {
  const sent: string[] = [];
  const failed: string[] = [];

  for (const email of emails) {
    try {
      await sendScrimmageInviteEmail(email, scrimmageData);
      sent.push(email);
    } catch (error) {
      console.error(`Failed to send invite to ${email}:`, error);
      failed.push(email);
    }
  }

  return { sent, failed };
}

interface ScrimmageApprovalData {
  scrimmageId: string;
  title: string;
  dateTime: Date;
  location: string;
  organizerName: string;
  playerName: string;
  maxPlayers: number;
  currentPlayers: number;
}

export async function sendScrimmageApprovalEmail(
  recipientEmail: string,
  data: ScrimmageApprovalData
): Promise<void> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();

    const formattedDate = format(data.dateTime, 'EEEE, MMMM d, yyyy');
    const formattedTime = format(data.dateTime, 'h:mm a');
    const scrimmageUrl = `${APP_URL}/?scrimmage=${data.scrimmageId}`;

    const body = `
          <tr>
            <td style="padding:36px 40px 8px 40px;">
              <p style="margin:0 0 4px 0;font-size:13px;font-weight:600;color:#10b981;text-transform:uppercase;letter-spacing:0.08em;">Spot Confirmed</p>
              <h1 style="margin:0 0 8px 0;font-size:26px;font-weight:800;color:#0a0a0a;line-height:1.2;">You're In!</h1>
              <p style="margin:0 0 28px 0;font-size:15px;color:#475569;line-height:1.5;">
                Hey <strong style="color:#0a0a0a;">${data.playerName}</strong> — <strong style="color:#0a0a0a;">${data.organizerName}</strong> has approved your spot for:
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 12px 0;font-size:17px;font-weight:700;color:#0a0a0a;">${data.title}</p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;border-bottom:1px solid #d1fae5;">
                          <span style="font-size:13px;color:#065f46;display:block;margin-bottom:1px;">Date</span>
                          <span style="font-size:14px;font-weight:600;color:#0a0a0a;">${formattedDate}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;border-bottom:1px solid #d1fae5;">
                          <span style="font-size:13px;color:#065f46;display:block;margin-bottom:1px;">Time</span>
                          <span style="font-size:14px;font-weight:600;color:#0a0a0a;">${formattedTime}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;border-bottom:1px solid #d1fae5;">
                          <span style="font-size:13px;color:#065f46;display:block;margin-bottom:1px;">Location</span>
                          <span style="font-size:14px;font-weight:600;color:#0a0a0a;">${data.location}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;">
                          <span style="font-size:13px;color:#065f46;display:block;margin-bottom:1px;">Roster</span>
                          <span style="font-size:14px;font-weight:600;color:#0a0a0a;">${data.currentPlayers} / ${data.maxPlayers} players confirmed</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
                <tr>
                  <td align="center">
                    <a href="${scrimmageUrl}" style="display:inline-block;background-color:#10b981;color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:8px;font-size:16px;font-weight:700;letter-spacing:0.01em;">View Scrimmage</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 32px 0;font-size:13px;color:#94a3b8;text-align:center;">See you on the ice!</p>
            </td>
          </tr>`;

    const htmlContent = emailShell("Your Scrimmage Spot is Confirmed", body, '#10b981');

    const textContent = `
You're In! Your Scrimmage Spot is Confirmed

Hey ${data.playerName}, great news! ${data.organizerName} has approved your request to join:

${data.title}

Date: ${formattedDate}
Time: ${formattedTime}
Location: ${data.location}
Players: ${data.currentPlayers} / ${data.maxPlayers} confirmed

View scrimmage details: ${scrimmageUrl}

See you on the ice!

Download Roster Hockey:
App Store: ${APPLE_URL}
Google Play: ${GOOGLE_URL}

---
Sent by Roster Hockey - Your beer league hockey app
Visit: https://RosterHockey.com
    `.trim();

    await client.emails.send({
      from: fromEmail,
      to: recipientEmail,
      subject: `Spot confirmed: ${data.title}`,
      html: htmlContent,
      text: textContent,
    });

    console.log(`✅ Sent scrimmage approval email to ${recipientEmail}`);
  } catch (error) {
    console.error(`❌ Failed to send scrimmage approval email to ${recipientEmail}:`, error);
    throw error;
  }
}

interface ScrimmageReminderData {
  scrimmageId: string;
  title: string;
  dateTime: Date;
  location: string;
  organizerName: string;
  playerName: string;
  currentPlayers: number;
  maxPlayers: number;
  hoursUntil: number;
}

export async function sendScrimmageReminderEmail(
  recipientEmail: string,
  data: ScrimmageReminderData
): Promise<void> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();

    const formattedDate = format(data.dateTime, 'EEEE, MMMM d, yyyy');
    const formattedTime = format(data.dateTime, 'h:mm a');
    const scrimmageUrl = `${APP_URL}/?scrimmage=${data.scrimmageId}`;

    const timeLabel = data.hoursUntil >= 24
      ? `${Math.round(data.hoursUntil / 24)} day${Math.round(data.hoursUntil / 24) !== 1 ? 's' : ''}`
      : `${data.hoursUntil} hour${data.hoursUntil !== 1 ? 's' : ''}`;

    const body = `
          <tr>
            <td style="padding:36px 40px 8px 40px;">
              <p style="margin:0 0 4px 0;font-size:13px;font-weight:600;color:#f59e0b;text-transform:uppercase;letter-spacing:0.08em;">Reminder</p>
              <h1 style="margin:0 0 8px 0;font-size:26px;font-weight:800;color:#0a0a0a;line-height:1.2;">${timeLabel} to go!</h1>
              <p style="margin:0 0 28px 0;font-size:15px;color:#475569;line-height:1.5;">
                Hey <strong style="color:#0a0a0a;">${data.playerName}</strong> — don't forget you've got a scrimmage coming up:
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fffbeb;border:1px solid #fde68a;border-radius:10px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 12px 0;font-size:17px;font-weight:700;color:#0a0a0a;">${data.title}</p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;border-bottom:1px solid #fde68a;">
                          <span style="font-size:13px;color:#92400e;display:block;margin-bottom:1px;">Date</span>
                          <span style="font-size:14px;font-weight:600;color:#0a0a0a;">${formattedDate}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;border-bottom:1px solid #fde68a;">
                          <span style="font-size:13px;color:#92400e;display:block;margin-bottom:1px;">Time</span>
                          <span style="font-size:14px;font-weight:600;color:#0a0a0a;">${formattedTime}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;border-bottom:1px solid #fde68a;">
                          <span style="font-size:13px;color:#92400e;display:block;margin-bottom:1px;">Location</span>
                          <span style="font-size:14px;font-weight:600;color:#0a0a0a;">${data.location}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;border-bottom:1px solid #fde68a;">
                          <span style="font-size:13px;color:#92400e;display:block;margin-bottom:1px;">Roster</span>
                          <span style="font-size:14px;font-weight:600;color:#0a0a0a;">${data.currentPlayers} / ${data.maxPlayers} confirmed</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;">
                          <span style="font-size:13px;color:#92400e;display:block;margin-bottom:1px;">Organized by</span>
                          <span style="font-size:14px;font-weight:600;color:#0a0a0a;">${data.organizerName}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
                <tr>
                  <td align="center">
                    <a href="${scrimmageUrl}" style="display:inline-block;background-color:#f59e0b;color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:8px;font-size:16px;font-weight:700;letter-spacing:0.01em;">View Scrimmage</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 32px 0;font-size:13px;color:#94a3b8;text-align:center;">Don't forget your gear. See you out there!</p>
            </td>
          </tr>`;

    const htmlContent = emailShell(`Scrimmage Reminder: ${data.title}`, body, '#f59e0b');

    const textContent = `
Reminder: ${timeLabel} to go!

Hey ${data.playerName}, this is a friendly reminder that you have an upcoming scrimmage:

${data.title}

Date: ${formattedDate}
Time: ${formattedTime}
Location: ${data.location}
Players: ${data.currentPlayers} / ${data.maxPlayers} confirmed
Organized by: ${data.organizerName}

View scrimmage details: ${scrimmageUrl}

Don't forget your gear. See you out there!

Download Roster Hockey:
App Store: ${APPLE_URL}
Google Play: ${GOOGLE_URL}

---
Sent by Roster Hockey - Your beer league hockey app
Visit: https://RosterHockey.com
    `.trim();

    await client.emails.send({
      from: fromEmail,
      to: recipientEmail,
      subject: `Reminder: ${data.title} in ${timeLabel}`,
      html: htmlContent,
      text: textContent,
    });

    console.log(`✅ Sent scrimmage reminder email to ${recipientEmail}`);
  } catch (error) {
    console.error(`❌ Failed to send scrimmage reminder email to ${recipientEmail}:`, error);
    throw error;
  }
}

interface WelcomeEmailData {
  playerName: string;
  leagueName: string;
  teamName?: string;
}

export async function sendWelcomeEmail(
  recipientEmail: string,
  data: WelcomeEmailData
): Promise<void> {
  try {
    console.log(`[Email] Starting sendWelcomeEmail for ${recipientEmail}`);
    const { client, fromEmail } = await getUncachableResendClient();
    console.log(`[Email] Resend client initialized, fromEmail: ${fromEmail}`);

    const signupUrl = `${APP_URL}/?email=${encodeURIComponent(recipientEmail)}`;

    const body = `
          <tr>
            <td style="padding:36px 40px 8px 40px;">
              <p style="margin:0 0 4px 0;font-size:13px;font-weight:600;color:#3b82f6;text-transform:uppercase;letter-spacing:0.08em;">Welcome</p>
              <h1 style="margin:0 0 8px 0;font-size:26px;font-weight:800;color:#0a0a0a;line-height:1.2;">You're on the team!</h1>
              <p style="margin:0 0 28px 0;font-size:15px;color:#475569;line-height:1.5;">
                Hey <strong style="color:#0a0a0a;">${data.playerName}</strong> — you've been added to <strong style="color:#0a0a0a;">${data.leagueName}</strong>${data.teamName ? ` to play for <strong style="color:#0a0a0a;">${data.teamName}</strong>` : ''} on Roster Hockey. Create your account to get started.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
                <tr>
                  <td align="center">
                    <a href="${signupUrl}" style="display:inline-block;background-color:#3b82f6;color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:8px;font-size:16px;font-weight:700;letter-spacing:0.01em;">Log In / Create Account</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px 0;font-size:13px;color:#94a3b8;text-align:center;">
                Already have an account? Log in with <strong>${recipientEmail}</strong> and you'll be added automatically.
              </p>

              <p style="margin:0 0 32px 0;font-size:14px;color:#475569;line-height:1.5;">
                Questions? Reach out to your league commissioner or visit our support page.
              </p>
            </td>
          </tr>`;

    const htmlContent = emailShell('Welcome to Roster Hockey', body);

    const textContent = `
Welcome to Roster Hockey!

Hey ${data.playerName},

You've been added to ${data.leagueName}${data.teamName ? ` to play for ${data.teamName}` : ''} on Roster Hockey. Now it's time to create your account and join the action!

CREATE YOUR ACCOUNT:
${signupUrl}

DOWNLOAD ROSTER HOCKEY:
App Store: ${APPLE_URL}
Google Play: ${GOOGLE_URL}

If you already have a Roster Hockey account, you can simply log in with ${recipientEmail} and you'll automatically be added to the team.

Questions? Contact your league commissioner or visit our support page.

---
Sent by Roster Hockey - Your beer league hockey app
Visit: https://RosterHockey.com
    `.trim();

    await client.emails.send({
      from: fromEmail,
      to: recipientEmail,
      subject: `Welcome to ${data.leagueName} on Roster Hockey`,
      html: htmlContent,
      text: textContent,
    });

    console.log(`✅ Sent welcome email to ${recipientEmail}`);
  } catch (error) {
    console.error(`❌ Failed to send welcome email to ${recipientEmail}:`, error);
    throw error;
  }
}

interface TournamentAccessOpenData {
  tournamentId: string;
  tournamentName: string;
  accessStartDate: Date | null;
  accessEndDate: Date | null;
  uniqueTournamentId: string;
}

export async function sendTournamentAccessOpenEmail(
  recipientEmail: string,
  data: TournamentAccessOpenData
): Promise<void> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();

    const searchUrl = `${APP_URL}/tournament-search`;

    const startDateStr = data.accessStartDate
      ? format(data.accessStartDate, 'MMMM d, yyyy')
      : null;
    const endDateStr = data.accessEndDate
      ? format(data.accessEndDate, 'MMMM d, yyyy')
      : null;

    const body = `
          <tr>
            <td style="padding:36px 40px 8px 40px;">
              <p style="margin:0 0 4px 0;font-size:13px;font-weight:600;color:#3b82f6;text-transform:uppercase;letter-spacing:0.08em;">Tournament</p>
              <h1 style="margin:0 0 8px 0;font-size:26px;font-weight:800;color:#0a0a0a;line-height:1.2;">Registration is Open!</h1>
              <p style="margin:0 0 28px 0;font-size:15px;color:#475569;line-height:1.5;">
                The registration window for <strong style="color:#0a0a0a;">${data.tournamentName}</strong> is now open.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:${startDateStr || endDateStr ? '16' : '28'}px;">
                <tr>
                  <td style="padding:20px 24px;text-align:center;">
                    <p style="margin:0 0 6px 0;font-size:13px;color:#64748b;">Your Tournament ID</p>
                    <p style="margin:0;font-size:34px;font-weight:800;font-family:monospace;color:#0a0a0a;letter-spacing:6px;">${data.uniqueTournamentId}</p>
                  </td>
                </tr>
              </table>

              ${(startDateStr || endDateStr) ? `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;margin-bottom:28px;">
                <tr>
                  <td style="padding:16px 20px;">
                    ${startDateStr ? `<p style="margin:0 0 4px 0;font-size:14px;color:#0c4a6e;"><strong>Opens:</strong> ${startDateStr}</p>` : ''}
                    ${endDateStr ? `<p style="margin:0;font-size:14px;color:#0c4a6e;"><strong>Closes:</strong> ${endDateStr}</p>` : ''}
                  </td>
                </tr>
              </table>` : ''}

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
                <tr>
                  <td align="center">
                    <a href="${searchUrl}" style="display:inline-block;background-color:#3b82f6;color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:8px;font-size:16px;font-weight:700;letter-spacing:0.01em;">Find &amp; Join Tournament</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 32px 0;font-size:13px;color:#94a3b8;text-align:center;">Enter your Tournament ID on the Find a Tournament page to register.</p>
            </td>
          </tr>`;

    const htmlContent = emailShell('Tournament Registration Open', body);

    const textContent = `
Tournament Registration is Now Open!

${data.tournamentName} registration is now open.

Your Tournament ID: ${data.uniqueTournamentId}
${startDateStr ? `Registration opens: ${startDateStr}\n` : ''}${endDateStr ? `Registration closes: ${endDateStr}\n` : ''}
Join the tournament at: ${searchUrl}

Enter the tournament ID on the Find a Tournament page to register your spot.

Download Roster Hockey:
App Store: ${APPLE_URL}
Google Play: ${GOOGLE_URL}

---
Sent by Roster Hockey - Your beer league hockey app
Visit: https://RosterHockey.com
    `.trim();

    await client.emails.send({
      from: fromEmail,
      to: recipientEmail,
      subject: `Registration open: ${data.tournamentName}`,
      html: htmlContent,
      text: textContent,
    });

    console.log(`✅ Sent tournament access open email to ${recipientEmail}`);
  } catch (error) {
    console.error(`❌ Failed to send tournament access open email to ${recipientEmail}:`, error);
    throw error;
  }
}

interface TournamentScheduleShiftEmailData {
  tournamentId: string;
  tournamentName: string;
  matchCount: number;
  dayDelta: number;
  firstNewMatchTime: Date | null;
}

export async function sendTournamentScheduleShiftEmail(
  recipientEmail: string,
  data: TournamentScheduleShiftEmailData
): Promise<void> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();

    const tournamentUrl = `${APP_URL}/tournaments/${data.tournamentId}`;

    const direction = data.dayDelta > 0 ? 'later' : 'earlier';
    const days = Math.abs(data.dayDelta);
    const matchWord = data.matchCount === 1 ? 'match' : 'matches';
    const dayWord = days === 1 ? 'day' : 'days';

    const firstNewDateStr = data.firstNewMatchTime
      ? format(data.firstNewMatchTime, 'EEEE, MMMM d, yyyy')
      : null;
    const firstNewTimeStr = data.firstNewMatchTime
      ? format(data.firstNewMatchTime, 'h:mm a')
      : null;

    const body = `
          <tr>
            <td style="padding:36px 40px 8px 40px;">
              <p style="margin:0 0 4px 0;font-size:13px;font-weight:600;color:#f59e0b;text-transform:uppercase;letter-spacing:0.08em;">Schedule Update</p>
              <h1 style="margin:0 0 8px 0;font-size:26px;font-weight:800;color:#0a0a0a;line-height:1.2;">${data.tournamentName}</h1>
              <p style="margin:0 0 28px 0;font-size:15px;color:#475569;line-height:1.5;">
                <strong style="color:#0a0a0a;">${data.matchCount} ${matchWord}</strong> moved <strong style="color:#0a0a0a;">${days} ${dayWord} ${direction}</strong>.
              </p>

              ${firstNewDateStr ? `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fffbeb;border:1px solid #fde68a;border-radius:10px;margin-bottom:28px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 4px 0;font-size:13px;color:#92400e;">Your next affected match is now on:</p>
                    <p style="margin:0;font-size:16px;font-weight:700;color:#0a0a0a;">${firstNewDateStr}${firstNewTimeStr ? ` at ${firstNewTimeStr}` : ''}</p>
                  </td>
                </tr>
              </table>` : ''}

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
                <tr>
                  <td align="center">
                    <a href="${tournamentUrl}" style="display:inline-block;background-color:#3b82f6;color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:8px;font-size:16px;font-weight:700;letter-spacing:0.01em;">View Updated Schedule</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 32px 0;font-size:13px;color:#94a3b8;text-align:center;">Open the tournament for the full updated schedule.</p>
            </td>
          </tr>`;

    const htmlContent = emailShell(`${data.tournamentName} schedule updated`, body, '#f59e0b');

    const textContent = `
${data.tournamentName} schedule updated

${data.matchCount} of your ${matchWord} moved ${days} ${dayWord} ${direction}.
${firstNewDateStr ? `Your next affected match is now on ${firstNewDateStr}${firstNewTimeStr ? ` at ${firstNewTimeStr}` : ''}.\n` : ''}
View the full schedule: ${tournamentUrl}

---
Sent by Roster Hockey - Your beer league hockey app
Visit: https://RosterHockey.com
    `.trim();

    await client.emails.send({
      from: fromEmail,
      to: recipientEmail,
      subject: `Schedule update: ${data.tournamentName}`,
      html: htmlContent,
      text: textContent,
    });

    console.log(`✅ Sent tournament shift email to ${recipientEmail}`);
  } catch (error) {
    console.error(`❌ Failed to send tournament shift email to ${recipientEmail}:`, error);
  }
}

export async function sendTeamPlayerInviteEmail(
  recipientEmail: string,
  data: {
    playerFirstName: string;
    teamName: string;
    inviterName: string;
  }
): Promise<void> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();

    const body = `
          <tr>
            <td style="padding:36px 40px 8px 40px;">
              <p style="margin:0 0 4px 0;font-size:13px;font-weight:600;color:#3b82f6;text-transform:uppercase;letter-spacing:0.08em;">Team Invitation</p>
              <h1 style="margin:0 0 8px 0;font-size:26px;font-weight:800;color:#0a0a0a;line-height:1.2;">You've been added to a team!</h1>
              <p style="margin:0 0 28px 0;font-size:15px;color:#475569;line-height:1.5;">
                Hey <strong style="color:#0a0a0a;">${data.playerFirstName}</strong> — <strong style="color:#0a0a0a;">${data.inviterName}</strong> has added you to <strong style="color:#0a0a0a;">${data.teamName}</strong> on Roster Hockey.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 8px 0;font-size:15px;font-weight:700;color:#1e40af;">How to join your team</p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #dbeafe;">
                          <span style="font-size:14px;color:#1e3a8a;font-weight:600;">Step 1</span>
                          <span style="font-size:14px;color:#374151;margin-left:8px;">Download the Roster Hockey app below</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #dbeafe;">
                          <span style="font-size:14px;color:#1e3a8a;font-weight:600;">Step 2</span>
                          <span style="font-size:14px;color:#374151;margin-left:8px;">Sign up using <strong>${recipientEmail}</strong></span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;">
                          <span style="font-size:14px;color:#1e3a8a;font-weight:600;">Step 3</span>
                          <span style="font-size:14px;color:#374151;margin-left:8px;">You'll automatically appear on <strong>${data.teamName}</strong> — no extra steps needed!</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 32px 0;font-size:13px;color:#94a3b8;text-align:center;">Make sure to sign up with this email address so we can connect you to your team automatically.</p>
            </td>
          </tr>`;

    const htmlContent = emailShell(`You've been added to ${data.teamName}`, body, '#3b82f6');

    const textContent = `
You've been added to ${data.teamName}!

Hey ${data.playerFirstName} — ${data.inviterName} has added you to ${data.teamName} on Roster Hockey.

How to join your team:
1. Download the Roster Hockey app (links below)
2. Sign up using ${recipientEmail}
3. You'll automatically appear on ${data.teamName} — no extra steps needed!

Make sure to sign up with this email address so we can connect you to your team automatically.

Download Roster Hockey:
App Store: ${APPLE_URL}
Google Play: ${GOOGLE_URL}

---
Sent by Roster Hockey - Your beer league hockey app
Visit: https://RosterHockey.com
    `.trim();

    await client.emails.send({
      from: fromEmail,
      to: recipientEmail,
      subject: `You've been added to ${data.teamName} on Roster Hockey`,
      html: htmlContent,
      text: textContent,
    });

    console.log(`✅ Sent team player invite email to ${recipientEmail}`);
  } catch (error) {
    console.error(`❌ Failed to send team player invite email to ${recipientEmail}:`, error);
  }
}
