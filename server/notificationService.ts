/**
 * OneSignal Notification Service
 * 
 * Handles all OneSignal REST API interactions for push notifications.
 * Supports both OneSignal 5.x (new User Model) and legacy Player API.
 * 
 * Key concepts:
 * - Player ID: Legacy identifier for a device subscription
 * - Subscription ID: New OneSignal 5.x identifier for a device
 * - External ID: Your app's user ID (we use displayId) linked in OneSignal
 * - User ID (onesignal_id): OneSignal's internal user identifier
 */

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || '';
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY || '';
const ONESIGNAL_API_BASE = 'https://onesignal.com/api/v1';

// Types for OneSignal API responses
interface OneSignalApiResponse {
  success?: boolean;
  id?: string;
  recipients?: number;
  errors?: string[] | Record<string, string>;
}

interface OneSignalUserResponse {
  identity?: {
    external_id?: string;
    onesignal_id?: string;
  };
  subscriptions?: Array<{
    id: string;
    type: string;
    token?: string;
    enabled: boolean;
  }>;
}

interface OneSignalError {
  errors?: string[];
  message?: string;
}

/**
 * Validates that OneSignal credentials are configured
 */
function validateCredentials(): void {
  if (!ONESIGNAL_APP_ID) {
    throw new Error('ONESIGNAL_APP_ID environment variable is not set');
  }
  if (!ONESIGNAL_REST_API_KEY) {
    throw new Error('ONESIGNAL_REST_API_KEY environment variable is not set');
  }
}

/**
 * Creates the authorization header for OneSignal REST API
 */
function getAuthHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`,
  };
}

/**
 * Links an External ID to a OneSignal subscription/player
 * 
 * OneSignal 5.x User Model API - Uses the User Identity API
 * This sets the external_id which allows sending notifications by user ID
 * 
 * @param subscriptionId - The OneSignal subscription/player ID
 * @param externalId - The user's displayId from your database
 * @returns Promise with success status and any errors
 */
export async function setExternalIdViaApi(
  subscriptionId: string,
  externalId: string
): Promise<{ success: boolean; error?: string; onesignalUserId?: string }> {
  try {
    validateCredentials();

    console.log(`🔗 OneSignal: Linking external_id "${externalId}" to subscription "${subscriptionId}"`);

    // Method 1: Use the Subscription API to add external_id to user
    // POST /apps/{app_id}/subscriptions/{subscription_id}/user/identity
    const identityUrl = `${ONESIGNAL_API_BASE}/apps/${ONESIGNAL_APP_ID}/subscriptions/${subscriptionId}/user/identity`;
    
    const response = await fetch(identityUrl, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        identity: {
          external_id: externalId,
        },
      }),
    });

    const data = await response.json() as OneSignalUserResponse | OneSignalError;
    
    if (!response.ok) {
      const errorData = data as OneSignalError;
      const errorMessage = errorData.errors?.join(', ') || errorData.message || 'Unknown error';
      console.error(`❌ OneSignal: Failed to link external_id. Status: ${response.status}, Error: ${errorMessage}`);
      return { 
        success: false, 
        error: `OneSignal API error: ${errorMessage}` 
      };
    }

    const userData = data as OneSignalUserResponse;
    console.log(`✅ OneSignal: Successfully linked external_id "${externalId}" to subscription "${subscriptionId}"`);
    console.log(`   OneSignal User ID: ${userData.identity?.onesignal_id || 'Unknown'}`);
    
    return { 
      success: true, 
      onesignalUserId: userData.identity?.onesignal_id 
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ OneSignal: Exception linking external_id: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

/**
 * Alternative method: Create or fetch user by external_id and add subscription
 * Use this if the subscription-based identity linking doesn't work
 */
export async function createUserWithExternalId(
  externalId: string,
  subscriptionId: string
): Promise<{ success: boolean; error?: string; onesignalUserId?: string }> {
  try {
    validateCredentials();

    console.log(`🔗 OneSignal: Creating/updating user with external_id "${externalId}"`);

    // Create user with external_id
    const createUserUrl = `${ONESIGNAL_API_BASE}/apps/${ONESIGNAL_APP_ID}/users`;
    
    const response = await fetch(createUserUrl, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        identity: {
          external_id: externalId,
        },
        subscriptions: [
          {
            type: 'push',
            id: subscriptionId,
          },
        ],
      }),
    });

    const data = await response.json() as OneSignalUserResponse | OneSignalError;

    // 409 Conflict means user exists, which is fine
    if (response.status === 409) {
      console.log(`ℹ️ OneSignal: User with external_id "${externalId}" already exists, updating subscription`);
      // Try to add subscription to existing user
      return await addSubscriptionToUser(externalId, subscriptionId);
    }

    if (!response.ok) {
      const errorData = data as OneSignalError;
      const errorMessage = errorData.errors?.join(', ') || errorData.message || 'Unknown error';
      console.error(`❌ OneSignal: Failed to create user. Status: ${response.status}, Error: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }

    const userData = data as OneSignalUserResponse;
    console.log(`✅ OneSignal: Created user with external_id "${externalId}"`);
    
    return { 
      success: true, 
      onesignalUserId: userData.identity?.onesignal_id 
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ OneSignal: Exception creating user: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

/**
 * Add a subscription to an existing user by external_id
 */
async function addSubscriptionToUser(
  externalId: string,
  subscriptionId: string
): Promise<{ success: boolean; error?: string; onesignalUserId?: string }> {
  try {
    // First, get the user by external_id
    const getUserUrl = `${ONESIGNAL_API_BASE}/apps/${ONESIGNAL_APP_ID}/users/by/external_id/${externalId}`;
    
    const getUserResponse = await fetch(getUserUrl, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (!getUserResponse.ok) {
      return { success: false, error: 'User not found' };
    }

    const userData = await getUserResponse.json() as OneSignalUserResponse;
    const onesignalUserId = userData.identity?.onesignal_id;

    if (!onesignalUserId) {
      return { success: false, error: 'Could not get OneSignal user ID' };
    }

    // Transfer the subscription to this user
    const transferUrl = `${ONESIGNAL_API_BASE}/apps/${ONESIGNAL_APP_ID}/subscriptions/${subscriptionId}/owner`;
    
    const transferResponse = await fetch(transferUrl, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        identity: {
          external_id: externalId,
        },
      }),
    });

    if (!transferResponse.ok) {
      const errorData = await transferResponse.json() as OneSignalError;
      return { 
        success: false, 
        error: errorData.errors?.join(', ') || 'Failed to transfer subscription' 
      };
    }

    console.log(`✅ OneSignal: Transferred subscription "${subscriptionId}" to user with external_id "${externalId}"`);
    return { success: true, onesignalUserId };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

/**
 * Removes the external_id link from a subscription (for logout)
 */
export async function removeExternalId(
  subscriptionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    validateCredentials();

    console.log(`🔓 OneSignal: Removing external_id from subscription "${subscriptionId}"`);

    // To "logout" a user, we can delete the identity or transfer to anonymous user
    // Using the identity deletion endpoint
    const url = `${ONESIGNAL_API_BASE}/apps/${ONESIGNAL_APP_ID}/subscriptions/${subscriptionId}/user/identity/external_id`;
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    if (!response.ok && response.status !== 404) {
      const errorData = await response.json() as OneSignalError;
      const errorMessage = errorData.errors?.join(', ') || errorData.message || 'Unknown error';
      console.error(`❌ OneSignal: Failed to remove external_id. Status: ${response.status}, Error: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }

    console.log(`✅ OneSignal: Removed external_id from subscription "${subscriptionId}"`);
    return { success: true };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ OneSignal: Exception removing external_id: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

/**
 * Get user information from OneSignal by external_id
 */
export async function getUserByExternalId(
  externalId: string
): Promise<{ success: boolean; user?: OneSignalUserResponse; error?: string }> {
  try {
    validateCredentials();

    const url = `${ONESIGNAL_API_BASE}/apps/${ONESIGNAL_APP_ID}/users/by/external_id/${externalId}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: 'User not found' };
      }
      const errorData = await response.json() as OneSignalError;
      return { 
        success: false, 
        error: errorData.errors?.join(', ') || 'Failed to get user' 
      };
    }

    const userData = await response.json() as OneSignalUserResponse;
    return { success: true, user: userData };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

/**
 * Get subscription details from OneSignal
 */
export async function getSubscription(
  subscriptionId: string
): Promise<{ success: boolean; subscription?: any; error?: string }> {
  try {
    validateCredentials();

    const url = `${ONESIGNAL_API_BASE}/apps/${ONESIGNAL_APP_ID}/subscriptions/${subscriptionId}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: 'Subscription not found' };
      }
      const errorData = await response.json() as OneSignalError;
      return { 
        success: false, 
        error: errorData.errors?.join(', ') || 'Failed to get subscription' 
      };
    }

    const subscriptionData = await response.json();
    return { success: true, subscription: subscriptionData };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

/**
 * Delete a subscription from OneSignal (for complete cleanup)
 */
export async function deleteSubscription(
  subscriptionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    validateCredentials();

    console.log(`🗑️ OneSignal: Deleting subscription "${subscriptionId}"`);

    const url = `${ONESIGNAL_API_BASE}/apps/${ONESIGNAL_APP_ID}/subscriptions/${subscriptionId}`;
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    if (!response.ok && response.status !== 404) {
      const errorData = await response.json() as OneSignalError;
      return { 
        success: false, 
        error: errorData.errors?.join(', ') || 'Failed to delete subscription' 
      };
    }

    console.log(`✅ OneSignal: Deleted subscription "${subscriptionId}"`);
    return { success: true };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

// ============================================
// NOTIFICATION SENDING
// ============================================

interface SendNotificationOptions {
  title: string;
  message: string;
  data?: Record<string, string>;
  url?: string;
  buttons?: Array<{ id: string; text: string; url?: string }>;
  ttl?: number; // Time to live in seconds
}

/**
 * Send notification to specific users by their external_ids (displayIds)
 */
export async function sendNotificationByExternalIds(
  externalIds: string[],
  options: SendNotificationOptions
): Promise<{ success: boolean; notificationId?: string; recipients?: number; error?: string }> {
  try {
    validateCredentials();

    if (externalIds.length === 0) {
      return { success: false, error: 'No external IDs provided' };
    }

    console.log(`📤 OneSignal: Sending notification to ${externalIds.length} users`);
    console.log(`   Title: "${options.title}"`);
    console.log(`   External IDs: ${externalIds.slice(0, 5).join(', ')}${externalIds.length > 5 ? '...' : ''}`);

    const payload: Record<string, unknown> = {
      app_id: ONESIGNAL_APP_ID,
      include_aliases: {
        external_id: externalIds,
      },
      target_channel: 'push',
      headings: { en: options.title },
      contents: { en: options.message },
    };

    if (options.data) {
      payload.data = options.data;
    }

    if (options.url) {
      payload.url = options.url;
    }

    if (options.buttons) {
      payload.buttons = options.buttons;
    }

    if (options.ttl) {
      payload.ttl = options.ttl;
    }

    const response = await fetch(`${ONESIGNAL_API_BASE}/notifications`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    const data = await response.json() as OneSignalApiResponse;

    if (!response.ok || data.errors) {
      const errorMessage = Array.isArray(data.errors) 
        ? data.errors.join(', ') 
        : JSON.stringify(data.errors);
      console.error(`❌ OneSignal: Failed to send notification. Error: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }

    console.log(`✅ OneSignal: Notification sent. ID: ${data.id}, Recipients: ${data.recipients}`);
    return { 
      success: true, 
      notificationId: data.id, 
      recipients: data.recipients 
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ OneSignal: Exception sending notification: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

/**
 * Send notification to specific player/subscription IDs (legacy method)
 */
export async function sendNotificationByPlayerIds(
  playerIds: string[],
  options: SendNotificationOptions
): Promise<{ success: boolean; notificationId?: string; recipients?: number; error?: string }> {
  try {
    validateCredentials();

    if (playerIds.length === 0) {
      return { success: false, error: 'No player IDs provided' };
    }

    console.log(`📤 OneSignal: Sending notification to ${playerIds.length} players (legacy)`);

    const payload: Record<string, unknown> = {
      app_id: ONESIGNAL_APP_ID,
      include_subscription_ids: playerIds,
      headings: { en: options.title },
      contents: { en: options.message },
    };

    if (options.data) {
      payload.data = options.data;
    }

    if (options.url) {
      payload.url = options.url;
    }

    const response = await fetch(`${ONESIGNAL_API_BASE}/notifications`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    const data = await response.json() as OneSignalApiResponse;

    if (!response.ok || data.errors) {
      const errorMessage = Array.isArray(data.errors) 
        ? data.errors.join(', ') 
        : JSON.stringify(data.errors);
      return { success: false, error: errorMessage };
    }

    return { 
      success: true, 
      notificationId: data.id, 
      recipients: data.recipients 
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

/**
 * Send notification to all subscribed users (use sparingly)
 */
export async function sendNotificationToAll(
  options: SendNotificationOptions
): Promise<{ success: boolean; notificationId?: string; recipients?: number; error?: string }> {
  try {
    validateCredentials();

    console.log(`📤 OneSignal: Sending notification to ALL users`);

    const payload: Record<string, unknown> = {
      app_id: ONESIGNAL_APP_ID,
      included_segments: ['Subscribed Users'],
      headings: { en: options.title },
      contents: { en: options.message },
    };

    if (options.data) {
      payload.data = options.data;
    }

    if (options.url) {
      payload.url = options.url;
    }

    const response = await fetch(`${ONESIGNAL_API_BASE}/notifications`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });

    const data = await response.json() as OneSignalApiResponse;

    if (!response.ok || data.errors) {
      const errorMessage = Array.isArray(data.errors) 
        ? data.errors.join(', ') 
        : JSON.stringify(data.errors);
      return { success: false, error: errorMessage };
    }

    return { 
      success: true, 
      notificationId: data.id, 
      recipients: data.recipients 
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

// ============================================
// DIAGNOSTIC / DEBUG FUNCTIONS
// ============================================

/**
 * Verify OneSignal configuration and connectivity
 */
export async function verifyOneSignalConfig(): Promise<{
  isConfigured: boolean;
  appId: string;
  hasApiKey: boolean;
  connectivity: boolean;
  error?: string;
}> {
  const result = {
    isConfigured: false,
    appId: ONESIGNAL_APP_ID ? `${ONESIGNAL_APP_ID.substring(0, 8)}...` : 'NOT SET',
    hasApiKey: !!ONESIGNAL_REST_API_KEY,
    connectivity: false,
  };

  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    return { ...result, error: 'Missing ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY' };
  }

  result.isConfigured = true;

  try {
    // Test connectivity by getting app info
    const response = await fetch(`${ONESIGNAL_API_BASE}/apps/${ONESIGNAL_APP_ID}`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (response.ok) {
      result.connectivity = true;
    } else {
      return { ...result, error: `API returned status ${response.status}` };
    }
  } catch (error) {
    return { ...result, error: `Connection failed: ${error instanceof Error ? error.message : 'Unknown'}` };
  }

  return result;
}

export const notificationService = {
  setExternalIdViaApi,
  createUserWithExternalId,
  removeExternalId,
  getUserByExternalId,
  getSubscription,
  deleteSubscription,
  sendNotificationByExternalIds,
  sendNotificationByPlayerIds,
  sendNotificationToAll,
  verifyOneSignalConfig,
};
