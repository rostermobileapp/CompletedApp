import { useEffect, useCallback, useState, useRef } from 'react';
import { useAuth } from './useAuth';
import { apiRequest } from '@/lib/queryClient';

/**
 * Hook for integrating BuildNatively's push notification system via OneSignal
 * 
 * This hook implements the BuildNatively NativelyNotifications SDK following the pattern
 * documented at: https://docs.buildnatively.com/guides/integration/push-notifications-onesignal
 * 
 * Flow:
 * 1. Initialize the NativelyNotifications SDK when running in the Natively app
 * 2. Check and request notification permissions
 * 3. Get the OneSignal Player ID (unique device identifier)
 * 4. Register the Player ID with our backend
 * 5. Set the External ID (user's displayId) to link the device to the user account
 * 6. Register the External ID with our backend
 * 
 * The hook automatically handles the initialization and linking when the user is authenticated.
 */

// TypeScript interface for BuildNatively's NativelyNotifications SDK
interface NativelyNotificationsInstance {
  getOneSignalId: (callback: (resp: { playerId: string | null }) => void) => void;
  getPermissionStatus: (callback: (resp: { status: boolean }) => void) => void;
  requestPermission: (fallbackToSettings: boolean, callback: (resp: { status: boolean }) => void) => void;
  getExternalId: (callback: (resp: Array<{ externalId?: string; error?: string; message?: string }>) => void) => void;
  setExternalId: (params: { externalId: string }, callback: (resp: { externalId?: string; error?: string; message?: string }) => void) => void;
  removeExternalId: (callback: (resp: { error?: string; message?: string } | null) => void) => void;
  login?: (params: { externalId: string }, callback: (resp: any) => void) => void;
}

declare global {
  interface Window {
    NativelyNotifications?: new () => NativelyNotificationsInstance;
  }
}

interface UseNativelyNotificationsReturn {
  isInitialized: boolean;
  playerId: string | null;
  externalIdSet: boolean;
  permissionStatus: boolean;
  requestPermission: () => Promise<boolean>;
  getPlayerId: () => Promise<string | null>;
  checkExternalId: () => Promise<boolean>;
}

export function useNativelyNotifications(): UseNativelyNotificationsReturn {
  const { user, isAuthenticated } = useAuth();
  const [isInitialized, setIsInitialized] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [externalIdSet, setExternalIdSet] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState(false);
  const notificationsRef = useRef<NativelyNotificationsInstance | null>(null);
  const initializationAttemptedRef = useRef(false);

  // Get user's display ID (external ID)
  const displayId = user?.displayId || user?.id;

  /**
   * Register the player ID with our backend
   */
  const registerPlayerIdWithBackend = useCallback(async (playerIdToRegister: string) => {
    try {
      console.log('[Natively] Registering Player ID with backend:', playerIdToRegister);
      const response = await apiRequest('POST', '/api/notification-preferences/register-player-id', {
        playerId: playerIdToRegister,
      });
      const data = await response.json();
      console.log('[Natively] ✓ Player ID registered with backend:', data);
      return true;
    } catch (error) {
      console.error('[Natively] ✗ Failed to register Player ID with backend:', error);
      return false;
    }
  }, []);

  /**
   * Link external ID with backend
   */
  const linkExternalIdWithBackend = useCallback(async (externalId: string) => {
    try {
      console.log('[Natively] Linking External ID with backend:', externalId);
      const response = await apiRequest('POST', '/api/notification-preferences/link-external-id', {
        externalId,
      });
      const data = await response.json();
      console.log('[Natively] ✓ External ID linked with backend:', data);
      return true;
    } catch (error) {
      console.error('[Natively] ✗ Failed to link External ID with backend:', error);
      return false;
    }
  }, []);

  /**
   * Set external ID using BuildNatively's SDK
   */
  const setExternalIdWithSDK = useCallback(async (externalId: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!notificationsRef.current) {
        console.error('[Natively] SDK not initialized');
        resolve(false);
        return;
      }

      console.log('[Natively] Calling setExternalId with:', externalId);
      
      notificationsRef.current.setExternalId({ externalId }, async (resp) => {
        console.log('[Natively] setExternalId response:', JSON.stringify(resp));
        
        if (resp && resp.externalId) {
          console.log('[Natively] ✓ External ID set successfully:', resp.externalId);
          setExternalIdSet(true);
          
          // Link with backend
          await linkExternalIdWithBackend(externalId);
          
          // Verify the external ID was actually set
          notificationsRef.current?.getExternalId((verifyResp) => {
            const res = (Array.isArray(verifyResp) && verifyResp.length > 0) ? verifyResp[0] : null;
            if (res && res.externalId) {
              console.log('[Natively] ✓ External ID verified:', res.externalId);
            } else {
              console.warn('[Natively] ⚠ External ID set but verification failed');
            }
          });
          
          resolve(true);
        } else {
          const errorMessage = (resp && resp.error) || (resp && resp.message) || "Failed to set external ID";
          console.error('[Natively] ✗ setExternalId failed:', errorMessage);
          resolve(false);
        }
      });
    });
  }, [linkExternalIdWithBackend]);

  /**
   * Check if external ID is already set
   */
  const checkExternalId = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!notificationsRef.current) {
        resolve(false);
        return;
      }

      notificationsRef.current.getExternalId((resp) => {
        const res = (Array.isArray(resp) && resp.length > 0) ? resp[0] : null;
        
        if (res && res.externalId) {
          console.log('[Natively] External ID already set:', res.externalId);
          setExternalIdSet(true);
          resolve(true);
        } else {
          console.log('[Natively] No external ID set');
          setExternalIdSet(false);
          resolve(false);
        }
      });
    });
  }, []);

  /**
   * Get the OneSignal Player ID
   */
  const getPlayerId = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!notificationsRef.current) {
        resolve(null);
        return;
      }

      notificationsRef.current.getOneSignalId((resp) => {
        console.log('[Natively] getOneSignalId response:', JSON.stringify(resp));
        
        if (resp.playerId) {
          console.log('[Natively] ✓ Player ID retrieved:', resp.playerId);
          setPlayerId(resp.playerId);
          resolve(resp.playerId);
        } else {
          console.log('[Natively] No Player ID available yet');
          resolve(null);
        }
      });
    });
  }, []);

  /**
   * Request push notification permission
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!notificationsRef.current) {
        console.error('[Natively] SDK not initialized');
        resolve(false);
        return;
      }

      const fallbackToSettings = false; // Don't show alert if permission denied
      
      console.log('[Natively] Requesting push notification permission...');
      notificationsRef.current.requestPermission(fallbackToSettings, async (resp) => {
        console.log('[Natively] Permission response:', JSON.stringify(resp));
        
        if (resp.status) {
          console.log('[Natively] ✓ Push notification permission granted');
          setPermissionStatus(true);
          
          // After permission is granted, get the player ID and register it
          const playerIdResult = await getPlayerId();
          if (playerIdResult) {
            await registerPlayerIdWithBackend(playerIdResult);
            
            // Set external ID if we have a display ID
            if (displayId) {
              await setExternalIdWithSDK(displayId);
            }
          }
          
          resolve(true);
        } else {
          console.log('[Natively] ✗ Push notification permission denied');
          setPermissionStatus(false);
          resolve(false);
        }
      });
    });
  }, [getPlayerId, registerPlayerIdWithBackend, setExternalIdWithSDK, displayId]);

  /**
   * Check current permission status
   */
  const checkPermissionStatus = useCallback(() => {
    if (!notificationsRef.current) return;

    notificationsRef.current.getPermissionStatus((resp) => {
      console.log('[Natively] Permission status:', resp.status);
      setPermissionStatus(resp.status);
    });
  }, []);

  /**
   * Initialize the NativelyNotifications SDK
   */
  useEffect(() => {
    // Only initialize once
    if (initializationAttemptedRef.current) return;
    
    // Check if we're running in the Natively app
    if (!window.NativelyNotifications) {
      console.log('[Natively] Not running in Natively app (window.NativelyNotifications not available)');
      return;
    }

    initializationAttemptedRef.current = true;

    try {
      console.log('[Natively] Initializing NativelyNotifications SDK...');
      const notifications = new window.NativelyNotifications();
      notificationsRef.current = notifications;
      setIsInitialized(true);
      console.log('[Natively] ✓ SDK initialized successfully');

      // Check permission status
      checkPermissionStatus();

      // Get current player ID if available
      getPlayerId();

      // Check if external ID is already set
      checkExternalId();
      
    } catch (error) {
      console.error('[Natively] Failed to initialize SDK:', error);
    }
  }, [checkPermissionStatus, getPlayerId, checkExternalId]);

  /**
   * Auto-link external ID when user is authenticated and SDK is ready
   */
  useEffect(() => {
    if (!isAuthenticated || !isInitialized || !displayId || !playerId || externalIdSet) {
      return;
    }

    console.log('[Natively] Auto-linking external ID for user:', displayId);
    
    // Check if external ID is already set first
    checkExternalId().then((alreadySet) => {
      if (!alreadySet) {
        // Try to set the external ID
        setExternalIdWithSDK(displayId).then((success) => {
          if (success) {
            console.log('[Natively] ✓ Auto-link successful');
          } else {
            console.warn('[Natively] ⚠ Auto-link failed, will retry');
          }
        });
      }
    });
  }, [isAuthenticated, isInitialized, displayId, playerId, externalIdSet, checkExternalId, setExternalIdWithSDK]);

  return {
    isInitialized,
    playerId,
    externalIdSet,
    permissionStatus,
    requestPermission,
    getPlayerId,
    checkExternalId,
  };
}
