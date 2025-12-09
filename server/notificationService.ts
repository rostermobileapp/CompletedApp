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
    external_id: string[];
  };
  include_player_ids?: string[];
  target_channel?: string;
  headings: { en: string };
  contents: { en: string };
  url?: string;
  data?: Record<string, any>;
}

const ONESIGNAL_API_URL = 'https://onesignal.com/api/v1/notifications';

async function sendToOneSignal(notification: OneSignalNotification): Promise<boolean> {
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  
  if (!apiKey) {
    console.error('[OneSignal] Missing ONESIGNAL_REST_API_KEY');
    return false;
  }

  console.log('[OneSignal] Sending notification:', JSON.stringify({
    app_id: notification.app_id,
    target: notification.include_aliases || notification.include_player_ids,
    title: notification.headings?.en,
    message: notification.contents?.en?.substring(0, 50) + '...',
  }));

  try {
    const response = await fetch(ONESIGNAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${apiKey}`,
      },
      body: JSON.stringify(notification),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[OneSignal] API error:', response.status, error);
      return false;
    }

    const result = await response.json();
    console.log('[OneSignal] Notification sent successfully:', {
      id: result.id,
      recipients: result.recipients,
      external_id: result.external_id,
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
    usersWithPush.map(u => ({ userId: u.userId, playerId: u.oneSignalPlayerId?.substring(0, 8) + '...' }))
  );
  
  const eligiblePlayerIds: string[] = [];
  let skipped = 0;

  for (const user of usersWithPush) {
    const settings = user.notificationSettings as NotificationSettings;
    
    if (settings && settings[notificationType] === true) {
      if (user.oneSignalPlayerId) {
        eligiblePlayerIds.push(user.oneSignalPlayerId);
        console.log(`[OneSignal] User ${user.userId} eligible for ${notificationType}, playerId: ${user.oneSignalPlayerId.substring(0, 8)}...`);
      } else {
        console.log(`[OneSignal] User ${user.userId} has no Player ID, skipping`);
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

  if (eligiblePlayerIds.length === 0) {
    console.log(`[OneSignal] No eligible Player IDs found, returning`);
    return { sent: 0, skipped };
  }

  // Use include_player_ids for direct device targeting (more reliable than aliases)
  const notification: OneSignalNotification = {
    app_id: appId,
    include_player_ids: eligiblePlayerIds,
    headings: { en: title },
    contents: { en: message },
    url,
    data,
  };

  const success = await sendToOneSignal(notification);
  
  return {
    sent: success ? eligiblePlayerIds.length : 0,
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
};
