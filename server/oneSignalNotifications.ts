import { storage } from './storage';

interface SendPushNotificationOptions {
  userId: string;
  title: string;
  message: string;
  data?: Record<string, string>;
}

export async function sendPushNotificationToUser(options: SendPushNotificationOptions): Promise<boolean> {
  const { userId, title, message, data } = options;
  
  const oneSignalAppId = process.env.ONESIGNAL_APP_ID;
  const oneSignalRestApiKey = process.env.ONESIGNAL_REST_API_KEY;
  
  if (!oneSignalAppId || !oneSignalRestApiKey) {
    console.log('[OneSignal] Not configured - skipping push notification');
    return false;
  }
  
  try {
    const preferences = await storage.getNotificationPreferences(userId);
    
    if (!preferences?.oneSignalPlayerId && !preferences?.oneSignalExternalId) {
      console.log(`[OneSignal] No subscription found for user ${userId}`);
      return false;
    }
    
    // Use include_subscription_ids (modern API) instead of deprecated include_player_ids
    // Player ID and Subscription ID are the same value in OneSignal
    const targetFilter = preferences.oneSignalExternalId
      ? { include_external_user_ids: [preferences.oneSignalExternalId] }
      : { include_subscription_ids: [preferences.oneSignalPlayerId] };
    
    console.log(`[OneSignal] Targeting user ${userId} with:`, JSON.stringify(targetFilter));
    
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${oneSignalRestApiKey}`,
      },
      body: JSON.stringify({
        app_id: oneSignalAppId,
        ...targetFilter,
        headings: { en: title },
        contents: { en: message },
        ios_badgeType: 'Increase',
        ios_badgeCount: 1,
        android_channel_id: process.env.ONESIGNAL_ANDROID_CHANNEL_ID,
        data,
      }),
    });
    
    const responseData = await response.json();
    
    if (response.ok && responseData.id) {
      console.log(`[OneSignal] Push sent to user ${userId}:`, responseData.id);
      return true;
    } else {
      console.warn(`[OneSignal] Push failed for user ${userId}:`, responseData);
      return false;
    }
  } catch (error) {
    console.error(`[OneSignal] Error sending push to user ${userId}:`, error);
    return false;
  }
}

export async function sendMessagePushNotification(
  senderId: string,
  senderName: string,
  recipientId: string,
  conversationId: string,
  messagePreview: string
): Promise<boolean> {
  const truncatedPreview = messagePreview.length > 50 
    ? messagePreview.substring(0, 50) + '...' 
    : messagePreview;
  
  return sendPushNotificationToUser({
    userId: recipientId,
    title: `💬 ${senderName}`,
    message: truncatedPreview,
    data: {
      type: 'message',
      conversationId,
      senderId,
    },
  });
}

export async function sendPaymentRequestPushNotification(
  recipientId: string,
  requesterName: string,
  amount: string,
  description: string,
  paymentRequestId: string
): Promise<boolean> {
  const prefs = await storage.getNotificationPreferences(recipientId);
  const settings = prefs?.notificationSettings as Record<string, boolean> | undefined;
  if (settings?.paymentRequests === false) {
    console.log(`[OneSignal] Payment request notifications disabled for user ${recipientId}`);
    return false;
  }
  
  return sendPushNotificationToUser({
    userId: recipientId,
    title: `💰 Payment Request from ${requesterName}`,
    message: `$${amount} - ${description}`,
    data: {
      type: 'payment_request',
      paymentRequestId,
    },
  });
}

export async function sendSubstitutionPushNotification(
  recipientId: string,
  title: string,
  message: string,
  gameId: string,
  requestId: string
): Promise<boolean> {
  const prefs = await storage.getNotificationPreferences(recipientId);
  const settings = prefs?.notificationSettings as Record<string, boolean> | undefined;
  if (settings?.substitutionRequests === false) {
    console.log(`[OneSignal] Substitution notifications disabled for user ${recipientId}`);
    return false;
  }
  
  return sendPushNotificationToUser({
    userId: recipientId,
    title: `🔄 ${title}`,
    message,
    data: {
      type: 'substitution',
      gameId,
      requestId,
    },
  });
}

export async function sendJoinRequestPushNotification(
  recipientId: string,
  requesterName: string,
  entityType: 'team' | 'league',
  entityName: string,
  requestId: string
): Promise<boolean> {
  const prefs = await storage.getNotificationPreferences(recipientId);
  const settings = prefs?.notificationSettings as Record<string, boolean> | undefined;
  if (settings?.joinRequests === false) {
    console.log(`[OneSignal] Join request notifications disabled for user ${recipientId}`);
    return false;
  }
  
  return sendPushNotificationToUser({
    userId: recipientId,
    title: `👋 New ${entityType} join request`,
    message: `${requesterName} wants to join ${entityName}`,
    data: {
      type: 'join_request',
      entityType,
      requestId,
    },
  });
}

export async function sendScheduleReminderPushNotification(
  recipientId: string,
  eventTitle: string,
  timeLabel: string,
  location: string,
  eventId: string,
  eventType: 'scrimmage' | 'game'
): Promise<boolean> {
  const prefs = await storage.getNotificationPreferences(recipientId);
  const settings = prefs?.notificationSettings as Record<string, boolean> | undefined;
  if (settings?.upcomingEvents === false) {
    console.log(`[OneSignal] Schedule reminder notifications disabled for user ${recipientId}`);
    return false;
  }
  
  return sendPushNotificationToUser({
    userId: recipientId,
    title: `⏰ Reminder: ${eventTitle}`,
    message: `Starting in ${timeLabel} at ${location}`,
    data: {
      type: 'schedule_reminder',
      eventType,
      eventId,
    },
  });
}

export async function sendAnnouncementPushNotification(
  recipientId: string,
  authorName: string,
  announcementPreview: string,
  leagueOrTournamentName: string,
  announcementId: string
): Promise<boolean> {
  const prefs = await storage.getNotificationPreferences(recipientId);
  const settings = prefs?.notificationSettings as Record<string, boolean> | undefined;
  if (settings?.newsAnnouncements === false) {
    console.log(`[OneSignal] Announcement notifications disabled for user ${recipientId}`);
    return false;
  }
  
  const truncatedPreview = announcementPreview.length > 50 
    ? announcementPreview.substring(0, 50) + '...' 
    : announcementPreview;
  
  return sendPushNotificationToUser({
    userId: recipientId,
    title: `📢 ${leagueOrTournamentName}`,
    message: `${authorName}: ${truncatedPreview}`,
    data: {
      type: 'announcement',
      announcementId,
    },
  });
}

export async function sendScrimmageInvitePushNotification(
  recipientId: string,
  organizerName: string,
  scrimmageTitle: string,
  dateTime: string,
  location: string,
  scrimmageId: string
): Promise<boolean> {
  const prefs = await storage.getNotificationPreferences(recipientId);
  const settings = prefs?.notificationSettings as Record<string, boolean> | undefined;
  if (settings?.scrimmageInvites === false) {
    console.log(`[OneSignal] Scrimmage invite notifications disabled for user ${recipientId}`);
    return false;
  }
  
  return sendPushNotificationToUser({
    userId: recipientId,
    title: `🏒 Scrimmage Invite: ${scrimmageTitle}`,
    message: `${organizerName} invited you - ${dateTime} at ${location}`,
    data: {
      type: 'scrimmage_invite',
      scrimmageId,
    },
  });
}
