/**
 * OneSignal Notification Service
 * 
 * Handles server-side push notification operations via OneSignal REST API
 */

interface OneSignalConfig {
  appId: string;
  restApiKey: string;
}

interface SendNotificationOptions {
  externalIds?: string[];
  playerIds?: string[];
  includeSegments?: string[];
  headings: Record<string, string>;
  contents: Record<string, string>;
  data?: Record<string, any>;
  url?: string;
}

interface OneSignalResponse {
  id?: string;
  recipients?: number;
  errors?: any[];
}

export class NotificationService {
  private config: OneSignalConfig;
  private baseUrl = 'https://onesignal.com/api/v1';

  constructor(config: OneSignalConfig) {
    this.config = config;
  }

  /**
   * Send push notification via OneSignal REST API
   */
  async sendNotification(options: SendNotificationOptions): Promise<OneSignalResponse> {
    try {
      const payload: any = {
        app_id: this.config.appId,
        headings: options.headings,
        contents: options.contents,
      };

      // Target users by External ID (recommended)
      if (options.externalIds && options.externalIds.length > 0) {
        payload.include_external_user_ids = options.externalIds;
      }
      // Fallback: Target by Player ID
      else if (options.playerIds && options.playerIds.length > 0) {
        payload.include_player_ids = options.playerIds;
      }
      // Fallback: Send to segments
      else if (options.includeSegments && options.includeSegments.length > 0) {
        payload.included_segments = options.includeSegments;
      } else {
        throw new Error('Must specify externalIds, playerIds, or includeSegments');
      }

      // Optional: Custom data
      if (options.data) {
        payload.data = options.data;
      }

      // Optional: Launch URL
      if (options.url) {
        payload.url = options.url;
      }

      const response = await fetch(`${this.baseUrl}/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${this.config.restApiKey}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('[OneSignal API] Error:', result);
        throw new Error(result.errors?.[0] || 'Failed to send notification');
      }

      console.log('[OneSignal API] Notification sent:', result);
      return result;

    } catch (error) {
      console.error('[OneSignal API] Send failed:', error);
      throw error;
    }
  }

  /**
   * Link External ID via REST API (alternative to SDK method)
   * 
   * NOTE: Prefer using SDK's login() method on client-side.
   * This is a fallback for server-side linking.
   */
  async linkExternalIdViaApi(playerId: string, externalId: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/players/${playerId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${this.config.restApiKey}`,
        },
        body: JSON.stringify({
          app_id: this.config.appId,
          external_user_id: externalId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('[OneSignal API] External ID link error:', result);
        throw new Error('Failed to link External ID via API');
      }

      console.log('[OneSignal API] External ID linked:', result);
    } catch (error) {
      console.error('[OneSignal API] Link External ID failed:', error);
      throw error;
    }
  }

  /**
   * Get player info by External ID
   */
  async getPlayerByExternalId(externalId: string): Promise<any> {
    try {
      const response = await fetch(
        `${this.baseUrl}/players?app_id=${this.config.appId}&external_user_id=${externalId}`,
        {
          headers: {
            'Authorization': `Basic ${this.config.restApiKey}`,
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        console.error('[OneSignal API] Get player error:', result);
        throw new Error('Failed to get player by External ID');
      }

      return result;
    } catch (error) {
      console.error('[OneSignal API] Get player failed:', error);
      throw error;
    }
  }

  /**
   * Delete player (useful for testing)
   */
  async deletePlayer(playerId: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/players/${playerId}?app_id=${this.config.appId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Basic ${this.config.restApiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete player');
      }

      console.log('[OneSignal API] Player deleted:', playerId);
    } catch (error) {
      console.error('[OneSignal API] Delete player failed:', error);
      throw error;
    }
  }
}

// Create singleton instance
const config: OneSignalConfig = {
  appId: process.env.ONESIGNAL_APP_ID || '',
  restApiKey: process.env.ONESIGNAL_REST_API_KEY || '',
};

if (!config.appId || !config.restApiKey) {
  console.warn('[NotificationService] OneSignal credentials not configured');
}

export const notificationService = new NotificationService(config);
