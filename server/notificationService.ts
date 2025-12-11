import { storage } from "./storage";

export type NotificationType = 
  | 'inAppMessages' 
  | 'paymentRequests' 
  | 'substitutionRequests' 
  | 'joinRequests' 
  | 'upcomingEvents'
  | 'newsAnnouncements';

export interface NotificationSettings {
  inAppMessages: boolean;
  paymentRequests: boolean;
  substitutionRequests: boolean;
  joinRequests: boolean;
  upcomingEvents: boolean;
  newsAnnouncements: boolean;
}

interface OneSignalNotification {
  app_id: string;
  include_aliases?: {
    external_id?: string[];
    onesignal_id?: string[];
  };
  target_channel?: string;
  headings: { en: string };
  contents: { en: string };
  url?: string;
  data?: Record<string, any>;
}

const ONESIGNAL_API_URL = 'https://onesignal.com/api/v1/notifications';

// Verify if an External ID is properly linked in OneSignal
export async function verifyExternalIdLink(displayId: string): Promise<{ linked: boolean; userData?: any; error?: string }> {
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  const appId = process.env.ONESIGNAL_APP_ID;
  
  if (!apiKey || !appId) {
    return { linked: false, error: 'Missing API credentials' };
  }

  try {
    // Query OneSignal to see if the external_id exists
    const url = `https://onesignal.com/api/v1/apps/${appId}/users/by/external_id/${displayId}`;
    console.log('[OneSignal] Verifying external_id:', displayId);
    
    const response = await fetch(url, {
      headers: { 'Authorization': `Basic ${apiKey}` }
    });
    
    const responseText = await response.text();
    console.log('[OneSignal] Verify response status:', response.status);
    console.log('[OneSignal] Verify response body:', responseText);
    
    if (response.ok) {
      const userData = JSON.parse(responseText);
      console.log('[OneSignal] ✓ Found user with external_id:', displayId);
      return { linked: true, userData };
    } else {
      console.log('[OneSignal] ✗ No user found with external_id:', displayId);
      return { linked: false, error: `Status ${response.status}: ${responseText}` };
    }
  } catch (error) {
    console.error('[OneSignal] Error verifying external_id:', error);
    return { linked: false, error: String(error) };
  }
}

// Lookup user by OneSignal ID (subscription ID) to check their properties
export async function lookupOneSignalUser(oneSignalId: string): Promise<{ found: boolean; userData?: any; error?: string }> {
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  const appId = process.env.ONESIGNAL_APP_ID;
  
  if (!apiKey || !appId) {
    return { found: false, error: 'Missing API credentials' };
  }

  try {
    const url = `https://onesignal.com/api/v1/apps/${appId}/users/by/onesignal_id/${oneSignalId}`;
    console.log('[OneSignal] Looking up user by onesignal_id:', oneSignalId);
    
    const response = await fetch(url, {
      headers: { 'Authorization': `Basic ${apiKey}` }
    });
    
    const responseText = await response.text();
    console.log('[OneSignal] Lookup response status:', response.status);
    
    if (response.ok) {
      const userData = JSON.parse(responseText);
      console.log('[OneSignal] ✓ Found user:', JSON.stringify(userData, null, 2));
      return { found: true, userData };
    } else {
      console.log('[OneSignal] ✗ User not found:', oneSignalId);
      return { found: false, error: `Status ${response.status}` };
    }
  } catch (error) {
    console.error('[OneSignal] Lookup error:', error);
    return { found: false, error: String(error) };
  }
}

export async function setExternalIdViaApi(oneSignalId: string, externalUserId: string, retryCount = 0): Promise<boolean> {
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  const appId = process.env.ONESIGNAL_APP_ID;
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 2000; // 2 seconds between retries
  
  if (!apiKey || !appId) {
    console.error('[OneSignal] Missing API key or App ID for setExternalId');
    return false;
  }

  // Enhanced logging to debug ID type issues
  console.log(`[OneSignal] Setting External ID via Identity API (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
  console.log('[OneSignal] ID type check:', {
    oneSignalId,
    idLength: oneSignalId.length,
    format: oneSignalId.match(/^[a-f0-9-]{36}$/) ? 'UUID' : 'other',
    externalUserId
  });

  try {
    // Use the newer OneSignal Identity API which accepts the OneSignal ID (alias) directly
    // This endpoint allows setting the external_id for a user identified by their OneSignal ID
    const identityUrl = `https://onesignal.com/api/v1/apps/${appId}/users/by/onesignal_id/${oneSignalId}/identity`;
    
    const response = await fetch(identityUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${apiKey}`,
      },
      body: JSON.stringify({
        identity: {
          external_id: externalUserId,
        },
      }),
    });

    const responseText = await response.text();
    console.log('[OneSignal] Set External ID Response status:', response.status);
    console.log('[OneSignal] Set External ID Response body:', responseText);

    if (!response.ok) {
      // Check if it's a "not found" error (404) - subscription might not be propagated yet
      if (response.status === 404 && retryCount < MAX_RETRIES) {
        console.log(`[OneSignal] Subscription not found yet, retrying in ${RETRY_DELAY_MS}ms...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        return setExternalIdViaApi(oneSignalId, externalUserId, retryCount + 1);
      }
      
      // If Identity API fails, try the alternative approach using Users API
      console.log('[OneSignal] Identity API failed, trying Users API...');
      return await setExternalIdViaUsersApi(oneSignalId, externalUserId, appId, apiKey);
    }

    console.log('[OneSignal] External ID set successfully via Identity API for:', oneSignalId.substring(0, 8) + '...');
    return true;
  } catch (error) {
    console.error('[OneSignal] Error setting External ID:', error);
    
    // Retry on network errors
    if (retryCount < MAX_RETRIES) {
      console.log(`[OneSignal] Network error, retrying in ${RETRY_DELAY_MS}ms...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      return setExternalIdViaApi(oneSignalId, externalUserId, retryCount + 1);
    }
    
    return false;
  }
}

async function setExternalIdViaUsersApi(oneSignalId: string, externalUserId: string, appId: string, apiKey: string): Promise<boolean> {
  try {
    // Alternative: Use the Users API to update user aliases
    const usersUrl = `https://onesignal.com/api/v1/apps/${appId}/users/by/onesignal_id/${oneSignalId}`;
    
    const response = await fetch(usersUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${apiKey}`,
      },
      body: JSON.stringify({
        properties: {},
        identity: {
          external_id: externalUserId,
        },
      }),
    });

    const responseText = await response.text();
    console.log('[OneSignal] Users API Response status:', response.status);
    console.log('[OneSignal] Users API Response body:', responseText);

    if (!response.ok) {
      console.error('[OneSignal] Users API also failed:', response.status, responseText);
      return false;
    }

    console.log('[OneSignal] External ID set successfully via Users API for:', oneSignalId.substring(0, 8) + '...');
    return true;
  } catch (error) {
    console.error('[OneSignal] Error in Users API fallback:', error);
    return false;
  }
}

async function sendToOneSignal(notification: OneSignalNotification): Promise<boolean> {
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  
  if (!apiKey) {
    console.error('[OneSignal] Missing ONESIGNAL_REST_API_KEY');
    return false;
  }

  console.log('[OneSignal] Sending notification:', JSON.stringify({
    app_id: notification.app_id,
    target: notification.include_aliases,
    target_channel: notification.target_channel,
    title: notification.headings?.en,
    message: notification.contents?.en?.substring(0, 50) + '...',
  }));

  try {
    const payload = JSON.stringify(notification);
    console.log('[OneSignal] Full payload:', payload);
    
    const response = await fetch(ONESIGNAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${apiKey}`,
      },
      body: payload,
    });

    const responseText = await response.text();
    console.log('[OneSignal] API Response status:', response.status);
    console.log('[OneSignal] API Response body:', responseText);

    if (!response.ok) {
      console.error('[OneSignal] API error:', response.status, responseText);
      return false;
    }

    const result = JSON.parse(responseText);
    console.log('[OneSignal] Notification sent successfully:', {
      id: result.id,
      recipients: result.recipients,
      errors: result.errors,
    });
    return true;
  } catch (error) {
    console.error('[OneSignal] Failed to send notification:', error);
    return false;
  }
}

export async function sendPushNotification(
  userIds: string[],
  notificationType: NotificationType,
  title: string,
  message: string,
  url?: string,
  data?: Record<string, any>
): Promise<{ sent: number; skipped: number }> {
  console.log(`[OneSignal] sendPushNotification called:`, {
    userIds,
    notificationType,
    title: title.substring(0, 30),
  });

  const appId = process.env.ONESIGNAL_APP_ID;
  
  if (!appId) {
    console.error('[OneSignal] Missing ONESIGNAL_APP_ID');
    return { sent: 0, skipped: userIds.length };
  }

  if (userIds.length === 0) {
    console.log('[OneSignal] No user IDs provided');
    return { sent: 0, skipped: 0 };
  }

  const usersWithPush = await storage.getUsersWithPushEnabled(userIds);
  console.log(`[OneSignal] Users with push enabled: ${usersWithPush.length}/${userIds.length}`, 
    usersWithPush.map(u => ({ userId: u.userId, displayId: u.displayId, playerId: u.oneSignalPlayerId?.substring(0, 8) + '...' }))
  );
  
  const eligibleDisplayIds: string[] = [];
  let skipped = 0;

  for (const user of usersWithPush) {
    const settings = user.notificationSettings as NotificationSettings;
    
    if (settings && settings[notificationType] === true) {
      // Use the user's displayId as the external_id for OneSignal targeting
      // This matches what the mobile app sends when calling login(displayId)
      if (user.displayId) {
        eligibleDisplayIds.push(user.displayId);
        console.log(`[OneSignal] User ${user.userId} (displayId: ${user.displayId}) eligible for ${notificationType}`);
      } else {
        console.log(`[OneSignal] User ${user.userId} skipped - no displayId assigned`);
        skipped++;
      }
    } else {
      console.log(`[OneSignal] User ${user.userId} skipped - ${notificationType} disabled in settings:`, settings);
      skipped++;
    }
  }

  const usersWithoutPush = userIds.length - usersWithPush.length;
  skipped += usersWithoutPush;
  console.log(`[OneSignal] Users without push enabled: ${usersWithoutPush}`);

  if (eligibleDisplayIds.length === 0) {
    console.log(`[OneSignal] No eligible users with displayId found, returning`);
    return { sent: 0, skipped };
  }

  // Use include_aliases with external_id for device targeting
  // The external_id is the user's displayId (e.g., "LFB3Kf") which is linked in OneSignal
  console.log(`[OneSignal] Sending notification to displayIds:`, eligibleDisplayIds);
  const notification: OneSignalNotification = {
    app_id: appId,
    include_aliases: {
      external_id: eligibleDisplayIds,
    },
    target_channel: 'push',
    headings: { en: title },
    contents: { en: message },
    url,
    data,
  };

  const success = await sendToOneSignal(notification);
  
  return {
    sent: success ? eligibleDisplayIds.length : 0,
    skipped: success ? skipped : userIds.length,
  };
}

export async function sendMessageNotification(
  recipientUserIds: string[],
  senderName: string,
  messagePreview: string,
  conversationId?: string
): Promise<{ sent: number; skipped: number }> {
  const title = `New message from ${senderName}`;
  const message = messagePreview.length > 100 
    ? messagePreview.substring(0, 97) + '...' 
    : messagePreview;
  const url = conversationId ? `/messages?conversation=${conversationId}` : '/messages';
  
  return sendPushNotification(
    recipientUserIds,
    'inAppMessages',
    title,
    message,
    url,
    { type: 'message', conversationId }
  );
}

export async function sendPaymentRequestNotification(
  recipientUserIds: string[],
  requesterName: string,
  amount: number,
  description?: string,
  paymentRequestId?: string
): Promise<{ sent: number; skipped: number }> {
  const title = 'Payment Request';
  const amountFormatted = `$${(amount / 100).toFixed(2)}`;
  const message = description 
    ? `${requesterName} requested ${amountFormatted} for ${description}`
    : `${requesterName} requested ${amountFormatted}`;
  
  return sendPushNotification(
    recipientUserIds,
    'paymentRequests',
    title,
    message,
    '/payments',
    { type: 'paymentRequest', paymentRequestId }
  );
}

export async function sendSubstitutionRequestNotification(
  recipientUserIds: string[],
  requesterName: string,
  gameInfo: string,
  requestId?: string
): Promise<{ sent: number; skipped: number }> {
  const title = 'Substitution Request';
  const message = `${requesterName} is looking for a substitute for ${gameInfo}`;
  
  return sendPushNotification(
    recipientUserIds,
    'substitutionRequests',
    title,
    message,
    '/substitutions',
    { type: 'substitutionRequest', requestId }
  );
}

export async function sendSubstitutionApprovalNotification(
  recipientUserId: string,
  status: 'approved' | 'denied',
  gameInfo: string,
  requestId?: string
): Promise<{ sent: number; skipped: number }> {
  const title = status === 'approved' ? 'Substitution Approved' : 'Substitution Denied';
  const message = status === 'approved'
    ? `Your substitution request for ${gameInfo} has been approved`
    : `Your substitution request for ${gameInfo} was not approved`;
  
  return sendPushNotification(
    [recipientUserId],
    'substitutionRequests',
    title,
    message,
    '/substitutions',
    { type: 'substitutionApproval', status, requestId }
  );
}

export async function sendJoinRequestNotification(
  recipientUserIds: string[],
  requesterName: string,
  entityType: 'team' | 'league',
  entityName: string,
  requestId?: string
): Promise<{ sent: number; skipped: number }> {
  const title = `${entityType === 'team' ? 'Team' : 'League'} Join Request`;
  const message = `${requesterName} wants to join ${entityName}`;
  const url = entityType === 'team' ? '/teams' : '/leagues';
  
  return sendPushNotification(
    recipientUserIds,
    'joinRequests',
    title,
    message,
    url,
    { type: 'joinRequest', entityType, requestId }
  );
}

export async function sendGameReminderNotification(
  recipientUserIds: string[],
  gameInfo: string,
  timeUntil: '24h' | '2h',
  gameId?: string,
  dutyInfo?: string
): Promise<{ sent: number; skipped: number }> {
  const title = 'Upcoming Game Reminder';
  const timeText = timeUntil === '24h' ? 'tomorrow' : 'in 2 hours';
  let message = `${gameInfo} is ${timeText}`;
  
  // Add duty reminder if the user has a claimed duty
  if (dutyInfo) {
    message += `. Don't forget: ${dutyInfo}`;
  }
  
  return sendPushNotification(
    recipientUserIds,
    'upcomingEvents',
    title,
    message,
    gameId ? `/games/${gameId}` : '/schedule',
    { type: 'gameReminder', timeUntil, gameId, dutyInfo }
  );
}

export async function sendScrimmageReminderNotification(
  recipientUserId: string,
  scrimmageTitle: string,
  location: string,
  timeLabel: string,
  scrimmageId?: string
): Promise<{ sent: number; skipped: number }> {
  const title = 'Upcoming Scrimmage Reminder';
  const message = `${scrimmageTitle} at ${location} starts ${timeLabel}`;
  
  return sendPushNotification(
    [recipientUserId],
    'upcomingEvents',
    title,
    message,
    scrimmageId ? `/scrimmage/${scrimmageId}` : '/schedule',
    { type: 'scrimmageReminder', scrimmageId }
  );
}

export async function sendEventReminderNotification(
  recipientUserIds: string[],
  eventName: string,
  eventTime: string,
  eventId?: string
): Promise<{ sent: number; skipped: number }> {
  const title = 'Upcoming Event';
  const message = `Reminder: ${eventName} at ${eventTime}`;
  
  return sendPushNotification(
    recipientUserIds,
    'upcomingEvents',
    title,
    message,
    eventId ? `/events/${eventId}` : '/schedule',
    { type: 'eventReminder', eventId }
  );
}

export async function sendNewsAnnouncementNotification(
  recipientUserIds: string[],
  authorName: string,
  announcementTitle: string,
  entityType: 'league' | 'team' | 'tournament',
  entityName: string,
  announcementId?: string,
  entityId?: string
): Promise<{ sent: number; skipped: number }> {
  const title = 'New Announcement';
  const message = `${authorName} posted in ${entityName}: ${announcementTitle}`;
  
  let url = '/announcements';
  if (entityType === 'league' && entityId) {
    url = `/league/${entityId}/announcements`;
  } else if (entityType === 'tournament' && entityId) {
    url = `/tournament/${entityId}/announcements`;
  } else if (entityType === 'team' && entityId) {
    url = `/team/${entityId}/announcements`;
  }
  
  return sendPushNotification(
    recipientUserIds,
    'newsAnnouncements',
    title,
    message,
    url,
    { type: 'newsAnnouncement', announcementId, entityType, entityId }
  );
}

export const notificationService = {
  sendPushNotification,
  sendMessageNotification,
  sendPaymentRequestNotification,
  sendSubstitutionRequestNotification,
  sendSubstitutionApprovalNotification,
  sendJoinRequestNotification,
  sendGameReminderNotification,
  sendScrimmageReminderNotification,
  sendEventReminderNotification,
  sendNewsAnnouncementNotification,
  setExternalIdViaApi,
  verifyExternalIdLink,
  lookupOneSignalUser,
};
