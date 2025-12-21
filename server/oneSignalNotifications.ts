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
