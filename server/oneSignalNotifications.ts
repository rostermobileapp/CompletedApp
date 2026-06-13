import { storage } from './storage';

// Public, absolute URLs to the brand icons used by OneSignal for web push.
//
// NOTIFICATION_ICON_URL is the colored body image shown inside the
// notification card (Chrome / Firefox / Android expanded view).
//
// NOTIFICATION_BADGE_URL is the *status-bar* small icon that Android Chrome
// renders in the top bar. Android requires this to be a fully monochrome
// silhouette PNG (transparent background, white shapes) — anything else
// gets silently rejected and Android falls back to its default bell icon.
// `notification-badge.png` is a 96x96 white-on-alpha Roster R created
// specifically for this purpose; do not swap it for a colored asset.
const NOTIFICATION_ICON_URL = 'https://www.roster-app.com/icon-512.png';
const NOTIFICATION_BADGE_URL = 'https://www.roster-app.com/notification-badge.png';
const APP_BASE_URL = 'https://www.roster-app.com';

/**
 * Converts a stored team logo path (e.g. "/team-logos/<id>") to a fully
 * qualified public URL served by the app. Returns undefined when the path is
 * absent so callers can fall back to the default Roster icon.
 */
export function resolveTeamLogoUrl(logoPath: string | null | undefined): string | undefined {
  if (!logoPath) return undefined;
  // Paths are normalised to "/team-logos/<id>" by supabaseStorage.normalizeTeamLogoPath
  if (logoPath.startsWith('/team-logos/')) {
    return `${APP_BASE_URL}${logoPath}`;
  }
  // Full URL already (e.g. a Supabase public URL) — use as-is
  if (logoPath.startsWith('http://') || logoPath.startsWith('https://')) {
    return logoPath;
  }
  return undefined;
}

interface SendPushNotificationOptions {
  userId: string;
  title: string;
  message: string;
  data?: Record<string, string>;
  /** Optional override for the large icon shown in the notification card.
   *  Falls back to the default Roster logo when omitted. */
  iconUrl?: string;
}

export async function sendPushNotificationToUser(options: SendPushNotificationOptions): Promise<boolean> {
  const { userId, title, message, data, iconUrl } = options;
  const largeIcon = iconUrl ?? NOTIFICATION_ICON_URL;
  
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
        // Required when using include_external_user_ids to specify push channel
        ...(preferences.oneSignalExternalId ? { channel_for_external_user_ids: 'push' } : {}),
        headings: { en: title },
        contents: { en: message },
        ios_badgeType: 'Increase',
        ios_badgeCount: 1,
        ...(process.env.ONESIGNAL_ANDROID_CHANNEL_ID ? { android_channel_id: process.env.ONESIGNAL_ANDROID_CHANNEL_ID } : {}),
        // Web push (Chrome / Firefox / Edge / Safari) — override the dashboard
        // default with the current Roster logo so old uploads don't appear.
        chrome_web_icon: largeIcon,
        chrome_web_badge: NOTIFICATION_BADGE_URL,
        firefox_icon: largeIcon,
        // Android — the small icon in the status bar uses the bundled
        // `ic_stat_onesignal_default` silhouette from the mobile app, while
        // `large_icon` (this URL) shows the colored logo in the expanded
        // notification card.
        large_icon: largeIcon,
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
  messagePreview: string,
  conversationType?: string,
): Promise<boolean> {
  // Censor direct-message previews for free-tier recipients so we don't leak
  // sender identity or message content via push (the recipient can't read the
  // thread in-app either). Group / team / captain chats keep the rich preview
  // for everyone. The recipient's stored role is the source of truth here —
  // pushes are sent server-side and don't see the in-app dropdown context.
  if (conversationType === 'direct') {
    try {
      const recipient = await storage.getUser(recipientId);
      if (recipient?.role === 'free_tier') {
        return sendPushNotificationToUser({
          userId: recipientId,
          title: 'New Message Received',
          message: 'New Message Received',
          data: {
            type: 'message',
            conversationId,
          },
        });
      }
    } catch (err) {
      console.error('[OneSignal] Failed to look up recipient role for DM censoring:', err);
    }
  }

  const headline = `Message from ${senderName}`;

  return sendPushNotificationToUser({
    userId: recipientId,
    title: headline,
    message: headline,
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

export async function sendTournamentAccessOpenPushNotification(
  recipientId: string,
  tournamentId: string,
  tournamentName: string
): Promise<boolean> {
  return sendPushNotificationToUser({
    userId: recipientId,
    title: `🏆 ${tournamentName} is open!`,
    message: `Registration for ${tournamentName} is now open. Tap to view the tournament.`,
    data: {
      type: 'tournament_access_open',
      tournamentId,
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
  requestId: string,
  teamLogoUrl?: string
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
    iconUrl: teamLogoUrl,
  });
}

export async function sendScheduleReminderPushNotification(
  recipientId: string,
  eventTitle: string,
  timeLabel: string,
  location: string,
  eventId: string,
  eventType: 'scrimmage' | 'game',
  dutyMessage?: string,
  teamLogoUrl?: string
): Promise<boolean> {
  const prefs = await storage.getNotificationPreferences(recipientId);
  const settings = prefs?.notificationSettings as Record<string, boolean> | undefined;
  if (settings?.upcomingEvents === false) {
    console.log(`[OneSignal] Schedule reminder notifications disabled for user ${recipientId}`);
    return false;
  }
  
  let message = `Starting in ${timeLabel} at ${location}`;
  if (dutyMessage) {
    message += ` - ${dutyMessage}`;
  }
  
  return sendPushNotificationToUser({
    userId: recipientId,
    title: `⏰ Reminder: ${eventTitle}`,
    message,
    data: {
      type: 'schedule_reminder',
      eventType,
      eventId,
    },
    iconUrl: teamLogoUrl,
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
    title: `📢 ${leagueOrTournamentName} - The Wall`,
    message: `${authorName}: ${truncatedPreview}`,
    data: {
      type: 'announcement',
      announcementId,
    },
  });
}

export async function sendWallReplyPushNotification(
  recipientId: string,
  replierName: string,
  replyPreview: string,
  leagueOrTournamentName: string,
  announcementId: string
): Promise<boolean> {
  const prefs = await storage.getNotificationPreferences(recipientId);
  const settings = prefs?.notificationSettings as Record<string, boolean> | undefined;
  if (settings?.newsAnnouncements === false) {
    console.log(`[OneSignal] Wall reply notifications disabled for user ${recipientId}`);
    return false;
  }
  
  const truncatedPreview = replyPreview.length > 50 
    ? replyPreview.substring(0, 50) + '...' 
    : replyPreview;
  
  return sendPushNotificationToUser({
    userId: recipientId,
    title: `💬 ${leagueOrTournamentName} - The Wall`,
    message: `${replierName} replied to your comment: ${truncatedPreview}`,
    data: {
      type: 'wall_reply',
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
  scrimmageId: string,
  teamLogoUrl?: string
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
    iconUrl: teamLogoUrl,
  });
}

export async function sendScrimmageApprovalPushNotification(
  recipientId: string,
  scrimmageTitle: string,
  dateTime: string,
  scrimmageId: string,
  teamAssignment?: string | null,
  teamLogoUrl?: string
): Promise<boolean> {
  const prefs = await storage.getNotificationPreferences(recipientId);
  const settings = prefs?.notificationSettings as Record<string, boolean> | undefined;
  if (settings?.scrimmageInvites === false) {
    console.log(`[OneSignal] Scrimmage notifications disabled for user ${recipientId}`);
    return false;
  }

  const teamLabel = teamAssignment === 'light' ? 'Team Light' : teamAssignment === 'dark' ? 'Team Dark' : null;
  const message = teamLabel
    ? `You're on ${teamLabel} – ${dateTime}`
    : `Your request has been approved - ${dateTime}`;

  return sendPushNotificationToUser({
    userId: recipientId,
    title: `✅ You're in! ${scrimmageTitle}`,
    message,
    data: {
      type: 'scrimmage_approved',
      scrimmageId,
    },
    iconUrl: teamLogoUrl,
  });
}

export async function sendTeamAssignmentPushNotification(
  recipientId: string,
  scrimmageTitle: string,
  scrimmageId: string,
  teamAssignment: string | null,
  teamLogoUrl?: string
): Promise<boolean> {
  const prefs = await storage.getNotificationPreferences(recipientId);
  const settings = prefs?.notificationSettings as Record<string, boolean> | undefined;
  if (settings?.scrimmageInvites === false) {
    console.log(`[OneSignal] Scrimmage notifications disabled for user ${recipientId}`);
    return false;
  }

  const teamLabel = teamAssignment === 'light' ? 'Team Light' : teamAssignment === 'dark' ? 'Team Dark' : 'Unassigned';

  return sendPushNotificationToUser({
    userId: recipientId,
    title: `🏒 Team assignment updated`,
    message: `Your team assignment for "${scrimmageTitle}" has been updated to ${teamLabel}.`,
    data: {
      type: 'scrimmage_approved',
      scrimmageId,
    },
    iconUrl: teamLogoUrl,
  });
}

export async function sendCoHostPushNotification(
  recipientId: string,
  scrimmageTitle: string,
  dateTime: string,
  scrimmageId: string,
  teamLogoUrl?: string
): Promise<boolean> {
  const prefs = await storage.getNotificationPreferences(recipientId);
  const settings = prefs?.notificationSettings as Record<string, boolean> | undefined;
  if (settings?.scrimmageInvites === false) {
    console.log(`[OneSignal] Scrimmage notifications disabled for user ${recipientId}`);
    return false;
  }
  
  return sendPushNotificationToUser({
    userId: recipientId,
    title: `🎯 You're a Co-Host!`,
    message: `You've been added as co-host for "${scrimmageTitle}" on ${dateTime}`,
    data: {
      type: 'scrimmage_cohost_added',
      scrimmageId,
    },
    iconUrl: teamLogoUrl,
  });
}

export async function sendCoCommissionerPushNotification(
  recipientId: string,
  leagueName: string,
  commissionerName: string,
  leagueId: string
): Promise<boolean> {
  return sendPushNotificationToUser({
    userId: recipientId,
    title: `🏆 Co-Commissioner Role Granted`,
    message: `${commissionerName} added you as co-commissioner for ${leagueName}`,
    data: {
      type: 'co_commissioner_added',
      leagueId,
    },
  });
}

export async function sendPlayerRsvpPushNotification(
  captainId: string,
  playerName: string,
  rsvpStatus: 'attending' | 'not_attending',
  gameTitle: string,
  gameId: string,
  teamId: string
): Promise<boolean> {
  const prefs = await storage.getNotificationPreferences(captainId);
  const settings = prefs?.notificationSettings as Record<string, boolean> | undefined;
  if (settings?.playerRsvpUpdates === false) {
    console.log(`[OneSignal] Player RSVP notifications disabled for user ${captainId}`);
    return false;
  }
  
  const statusText = rsvpStatus === 'attending' ? 'IN' : 'OUT';
  const emoji = rsvpStatus === 'attending' ? '✅' : '❌';

  let teamLogoUrl: string | undefined;
  try {
    const team = await storage.getTeam(teamId);
    teamLogoUrl = resolveTeamLogoUrl(team?.logoUrl);
  } catch {
    // Non-fatal — fall back to default Roster icon
  }
  
  return sendPushNotificationToUser({
    userId: captainId,
    title: `${emoji} RSVP Update`,
    message: `${playerName} is ${statusText} for ${gameTitle}`,
    data: {
      type: 'player_rsvp',
      gameId,
      teamId,
    },
    iconUrl: teamLogoUrl,
  });
}

export async function sendPersonalReminderPushNotification(
  userId: string,
  reminderId: string,
  title: string,
  description?: string | null
): Promise<boolean> {
  const prefs = await storage.getNotificationPreferences(userId);
  const settings = prefs?.notificationSettings as Record<string, boolean> | undefined;
  if (settings?.personalReminders === false) {
    console.log(`[OneSignal] Personal reminder notifications disabled for user ${userId}`);
    return false;
  }
  
  return sendPushNotificationToUser({
    userId,
    title: `🔔 Reminder`,
    message: title,
    data: {
      type: 'personal_reminder',
      reminderId,
    },
  });
}

export async function sendTeamEventPushNotification(
  recipientId: string,
  creatorName: string,
  eventTitle: string,
  eventType: string,
  dateTime: string,
  location: string | null,
  teamEventId: string,
  teamName: string
): Promise<boolean> {
  const prefs = await storage.getNotificationPreferences(recipientId);
  const settings = prefs?.notificationSettings as Record<string, boolean> | undefined;
  if (settings?.upcomingEvents === false) {
    console.log(`[OneSignal] Team event notifications disabled for user ${recipientId}`);
    return false;
  }
  
  const typeEmojis: Record<string, string> = {
    general: '📅',
    practice: '🏃',
    scrimmage: '🏒',
    social: '🎉',
  };
  const emoji = typeEmojis[eventType] || '📅';
  
  let message = `${creatorName} scheduled "${eventTitle}" for ${dateTime}`;
  if (location) {
    message += ` at ${location}`;
  }
  
  return sendPushNotificationToUser({
    userId: recipientId,
    title: `${emoji} New ${teamName} Event`,
    message,
    data: {
      type: 'team_event',
      teamEventId,
    },
  });
}

export async function sendRsvpReminderPushNotification(
  recipientId: string,
  eventName: string,
  eventId: string,
  eventType: 'game' | 'tournament_match' | 'team_event',
  teamLogoUrl?: string
): Promise<boolean> {
  const prefs = await storage.getNotificationPreferences(recipientId);
  const settings = prefs?.notificationSettings as Record<string, boolean> | undefined;
  if (settings?.upcomingEvents === false) {
    console.log(`[OneSignal] RSVP reminder notifications disabled for user ${recipientId}`);
    return false;
  }
  
  return sendPushNotificationToUser({
    userId: recipientId,
    title: `📅 RSVP Reminder`,
    message: `You haven't RSVP'd for ${eventName} yet. Open Roster to RSVP`,
    data: {
      type: 'rsvp_reminder',
      eventType,
      eventId,
    },
    iconUrl: teamLogoUrl,
  });
}

export async function sendTournamentScheduleShiftPushNotification(
  recipientId: string,
  tournamentName: string,
  tournamentId: string,
  matchCount: number,
  dayDelta: number,
  firstNewMatchTime: Date | null = null
): Promise<boolean> {
  const prefs = await storage.getNotificationPreferences(recipientId);
  const settings = prefs?.notificationSettings as Record<string, boolean> | undefined;
  if (settings?.upcomingEvents === false) {
    console.log(`[OneSignal] Upcoming-event notifications disabled for user ${recipientId}`);
    return false;
  }

  const direction = dayDelta > 0 ? 'later' : 'earlier';
  const days = Math.abs(dayDelta);
  const matchWord = matchCount === 1 ? 'match' : 'matches';
  const dayWord = days === 1 ? 'day' : 'days';

  // Format the earliest new match time so the recipient sees the concrete
  // new date/time in the push body, not just a relative shift description.
  let nextWhen: string | null = null;
  if (firstNewMatchTime) {
    const opts: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    };
    nextWhen = firstNewMatchTime.toLocaleString('en-US', opts);
  }

  const message = nextWhen
    ? `${matchCount} of your ${matchWord} moved ${days} ${dayWord} ${direction}. Next up: ${nextWhen}.`
    : `${matchCount} of your ${matchWord} moved ${days} ${dayWord} ${direction}. Tap to see the new times.`;

  return sendPushNotificationToUser({
    userId: recipientId,
    title: `📅 ${tournamentName} schedule updated`,
    message,
    data: {
      type: 'tournament_schedule_changed',
      tournamentId,
      matchCount: String(matchCount),
      dayDelta: String(dayDelta),
      ...(firstNewMatchTime ? { firstNewMatchTime: firstNewMatchTime.toISOString() } : {}),
    },
  });
}

export async function sendPhotoTagPushNotification(
  recipientId: string,
  taggerName: string,
  entityType: 'league' | 'tournament',
  entityId: string
): Promise<boolean> {
  const prefs = await storage.getNotificationPreferences(recipientId);
  const settings = prefs?.notificationSettings as Record<string, boolean> | undefined;
  if (settings?.photoTagNotifications === false) {
    console.log(`[OneSignal] Photo tag notifications disabled for user ${recipientId}`);
    return false;
  }

  return sendPushNotificationToUser({
    userId: recipientId,
    title: `📸 You were tagged in a photo`,
    message: `${taggerName} tagged you in a photo`,
    data: {
      type: 'photo_tag',
      entityType,
      entityId,
    },
  });
}

export async function sendDraftStartingPushNotification(
  captainId: string,
  commishName: string,
  leagueName: string,
  draftId: string
): Promise<boolean> {
  return sendPushNotificationToUser({
    userId: captainId,
    title: `⚡ Draft starting soon`,
    message: `${commishName} is starting the ${leagueName} draft — tap to get ready.`,
    data: {
      type: 'draft_starting',
      draftId,
    },
  });
}
