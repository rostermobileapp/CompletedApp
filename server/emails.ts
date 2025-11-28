import { getUncachableResendClient } from './resend';
import { format } from 'date-fns';

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
    
    // Build the scrimmage details URL
    const appUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : 'https://rosters.replit.app';
    const scrimmageUrl = `${appUrl}/?scrimmage=${scrimmageData.scrimmageId}`;
    
    // Build email HTML
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>You're Invited to a Scrimmage</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <!-- Header -->
                  <tr>
                    <td style="padding: 40px 40px 20px 40px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0;">
                      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">You're Invited!</h1>
                    </td>
                  </tr>
                  
                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px;">
                      <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 24px; color: #333333;">
                        <strong>${scrimmageData.creatorName}</strong> has invited you to join a scrimmage:
                      </p>
                      
                      <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 20px 0; border-radius: 4px;">
                        <h2 style="margin: 0 0 16px 0; font-size: 22px; color: #333333;">${scrimmageData.title}</h2>
                        
                        <table role="presentation" style="width: 100%; border-collapse: collapse;">
                          <tr>
                            <td style="padding: 8px 0; font-size: 14px; color: #666666;">
                              <strong>📅 Date:</strong> ${formattedDate}
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0; font-size: 14px; color: #666666;">
                              <strong>🕐 Time:</strong> ${formattedTime}
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0; font-size: 14px; color: #666666;">
                              <strong>📍 Location:</strong> ${scrimmageData.location}
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0; font-size: 14px; color: #666666;">
                              <strong>👥 Max Players:</strong> ${scrimmageData.maxPlayers}
                            </td>
                          </tr>
                          ${scrimmageData.skillLevel ? `
                          <tr>
                            <td style="padding: 8px 0; font-size: 14px; color: #666666;">
                              <strong>⭐ Skill Level:</strong> ${scrimmageData.skillLevel}
                            </td>
                          </tr>
                          ` : ''}
                          ${scrimmageData.costPerPlayer ? `
                          <tr>
                            <td style="padding: 8px 0; font-size: 14px; color: #666666;">
                              <strong>💰 Cost:</strong> $${scrimmageData.costPerPlayer} per player
                            </td>
                          </tr>
                          ` : ''}
                        </table>
                        
                        ${scrimmageData.notes ? `
                        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e0e0e0;">
                          <p style="margin: 0; font-size: 14px; color: #666666; line-height: 20px;">
                            <strong>📝 Notes:</strong><br>
                            ${scrimmageData.notes}
                          </p>
                        </div>
                        ` : ''}
                      </div>
                      
                      <!-- CTA Button -->
                      <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 30px 0;">
                        <tr>
                          <td align="center">
                            <a href="${scrimmageUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">View Scrimmage Details</a>
                          </td>
                        </tr>
                      </table>
                      
                      <p style="margin: 20px 0 0 0; font-size: 14px; line-height: 20px; color: #666666;">
                        Click the button above to view full details and respond to this invitation on Rosters.
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="padding: 20px 40px; background-color: #f8f9fa; border-radius: 0 0 8px 8px; text-align: center;">
                      <p style="margin: 0; font-size: 12px; color: #999999; line-height: 18px;">
                        This invitation was sent through <strong>Rosters</strong> - Your sports team management platform<br>
                        <a href="${appUrl}" style="color: #667eea; text-decoration: none;">Visit Rosters</a>
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
    
    // Plain text version
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
View and respond to this invitation:
${scrimmageUrl}

---
This invitation was sent through Rosters - Your Beer League Hockey App
Visit: ${appUrl}
    `.trim();
    
    await client.emails.send({
      from: fromEmail,
      to: recipientEmail,
      subject: `🏒 You're invited: ${scrimmageData.title}`,
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
    
    const appUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : 'https://rosters.replit.app';
    const scrimmageUrl = `${appUrl}/?scrimmage=${data.scrimmageId}`;
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>You're In! Scrimmage Approved</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <!-- Header -->
                  <tr>
                    <td style="padding: 40px 40px 20px 40px; text-align: center; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 8px 8px 0 0;">
                      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">You're In!</h1>
                      <p style="margin: 10px 0 0 0; color: #d1fae5; font-size: 16px;">Your spot has been confirmed</p>
                    </td>
                  </tr>
                  
                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px;">
                      <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 24px; color: #333333;">
                        Hey ${data.playerName}, great news! <strong>${data.organizerName}</strong> has approved your request to join:
                      </p>
                      
                      <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 4px;">
                        <h2 style="margin: 0 0 16px 0; font-size: 22px; color: #333333;">${data.title}</h2>
                        
                        <table role="presentation" style="width: 100%; border-collapse: collapse;">
                          <tr>
                            <td style="padding: 8px 0; font-size: 14px; color: #666666;">
                              <strong>📅 Date:</strong> ${formattedDate}
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0; font-size: 14px; color: #666666;">
                              <strong>🕐 Time:</strong> ${formattedTime}
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0; font-size: 14px; color: #666666;">
                              <strong>📍 Location:</strong> ${data.location}
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0; font-size: 14px; color: #666666;">
                              <strong>👥 Players:</strong> ${data.currentPlayers} / ${data.maxPlayers} confirmed
                            </td>
                          </tr>
                        </table>
                      </div>
                      
                      <!-- CTA Button -->
                      <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 30px 0;">
                        <tr>
                          <td align="center">
                            <a href="${scrimmageUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">View Scrimmage Details</a>
                          </td>
                        </tr>
                      </table>
                      
                      <p style="margin: 20px 0 0 0; font-size: 14px; line-height: 20px; color: #666666;">
                        Make sure to add this event to your calendar. See you on the ice!
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="padding: 20px 40px; background-color: #f8f9fa; border-radius: 0 0 8px 8px; text-align: center;">
                      <p style="margin: 0; font-size: 12px; color: #999999; line-height: 18px;">
                        This notification was sent through <strong>Rosters</strong> - Your sports team management platform<br>
                        <a href="${appUrl}" style="color: #10b981; text-decoration: none;">Visit Rosters</a>
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
    
    const textContent = `
You're In! Your Scrimmage Spot is Confirmed

Hey ${data.playerName}, great news! ${data.organizerName} has approved your request to join:

${data.title}

Date: ${formattedDate}
Time: ${formattedTime}
Location: ${data.location}
Players: ${data.currentPlayers} / ${data.maxPlayers} confirmed

View scrimmage details: ${scrimmageUrl}

Make sure to add this event to your calendar. See you on the ice!

---
This notification was sent through Rosters - Your Beer League Hockey App
Visit: ${appUrl}
    `.trim();
    
    await client.emails.send({
      from: fromEmail,
      to: recipientEmail,
      subject: `✅ You're in! ${data.title}`,
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
    
    const appUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : 'https://rosters.replit.app';
    const scrimmageUrl = `${appUrl}/?scrimmage=${data.scrimmageId}`;
    
    const timeLabel = data.hoursUntil >= 24 
      ? `${Math.round(data.hoursUntil / 24)} day${Math.round(data.hoursUntil / 24) !== 1 ? 's' : ''}` 
      : `${data.hoursUntil} hour${data.hoursUntil !== 1 ? 's' : ''}`;
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Scrimmage Reminder</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <!-- Header -->
                  <tr>
                    <td style="padding: 40px 40px 20px 40px; text-align: center; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius: 8px 8px 0 0;">
                      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">Reminder: ${timeLabel} to go!</h1>
                    </td>
                  </tr>
                  
                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px;">
                      <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 24px; color: #333333;">
                        Hey ${data.playerName}, this is a friendly reminder that you have an upcoming scrimmage:
                      </p>
                      
                      <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 4px;">
                        <h2 style="margin: 0 0 16px 0; font-size: 22px; color: #333333;">${data.title}</h2>
                        
                        <table role="presentation" style="width: 100%; border-collapse: collapse;">
                          <tr>
                            <td style="padding: 8px 0; font-size: 14px; color: #666666;">
                              <strong>📅 Date:</strong> ${formattedDate}
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0; font-size: 14px; color: #666666;">
                              <strong>🕐 Time:</strong> ${formattedTime}
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0; font-size: 14px; color: #666666;">
                              <strong>📍 Location:</strong> ${data.location}
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0; font-size: 14px; color: #666666;">
                              <strong>👥 Players:</strong> ${data.currentPlayers} / ${data.maxPlayers} confirmed
                            </td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0; font-size: 14px; color: #666666;">
                              <strong>🎯 Organized by:</strong> ${data.organizerName}
                            </td>
                          </tr>
                        </table>
                      </div>
                      
                      <!-- CTA Button -->
                      <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 30px 0;">
                        <tr>
                          <td align="center">
                            <a href="${scrimmageUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">View Scrimmage Details</a>
                          </td>
                        </tr>
                      </table>
                      
                      <p style="margin: 20px 0 0 0; font-size: 14px; line-height: 20px; color: #666666;">
                        Don't forget to pack your gear! See you there.
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="padding: 20px 40px; background-color: #f8f9fa; border-radius: 0 0 8px 8px; text-align: center;">
                      <p style="margin: 0; font-size: 12px; color: #999999; line-height: 18px;">
                        This reminder was sent through <strong>Rosters</strong> - Your sports team management platform<br>
                        <a href="${appUrl}" style="color: #f59e0b; text-decoration: none;">Visit Rosters</a>
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
    
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

Don't forget to pack your gear! See you there.

---
This reminder was sent through Rosters - Your Beer League Hockey App
Visit: ${appUrl}
    `.trim();
    
    await client.emails.send({
      from: fromEmail,
      to: recipientEmail,
      subject: `⏰ Reminder: ${data.title} in ${timeLabel}`,
      html: htmlContent,
      text: textContent,
    });
    
    console.log(`✅ Sent scrimmage reminder email to ${recipientEmail}`);
  } catch (error) {
    console.error(`❌ Failed to send scrimmage reminder email to ${recipientEmail}:`, error);
    throw error;
  }
}
