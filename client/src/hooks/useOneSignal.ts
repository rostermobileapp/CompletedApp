import { useEffect, useCallback, useState, useRef } from 'react';
import { useAuth } from './useAuth';

interface NativelyNotificationsInstance {
  getOneSignalId: (callback: (resp: { playerId: string | null }) => void) => void;
  getPermissionStatus: (callback: (resp: { status: boolean }) => void) => void;
  requestPermission: (fallbackToSettings: boolean, callback: (resp: { status: boolean }) => void) => void;
  getExternalId: (callback: (resp: Array<{ externalId?: string; error?: string; message?: string }>) => void) => void;
  setExternalId: (params: { externalId: string }, callback: (resp: { externalId?: string; error?: string; message?: string }) => void) => void;
  removeExternalId: (callback: (resp: { error?: string; message?: string } | null) => void) => void;
  login?: (externalId: string) => void;
}

declare global {
  interface Window {
    NativelyNotifications?: new () => NativelyNotificationsInstance;
    OneSignal?: {
      login: (externalId: string) => Promise<void>;
      User?: {
        addAlias: (label: string, id: string) => void;
      };
    };
  }
}

export function useOneSignal() {
  const { user, isAuthenticated } = useAuth();
  const [isInitialized, setIsInitialized] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [externalIdSet, setExternalIdSet] = useState(false);
  const [permissionState, setPermissionState] = useState<string>('default');
  const notificationsRef = useRef<NativelyNotificationsInstance | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 3;

  const registerPlayerId = useCallback(async (playerIdToRegister: string) => {
    if (!isAuthenticated || !playerIdToRegister) return;
    
    try {
      const playerIdResponse = await fetch('/api/notification-preferences/player-id', {
        method: 'POST',
        body: JSON.stringify({ playerId: playerIdToRegister }),
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!playerIdResponse.ok) {
        throw new Error(`HTTP ${playerIdResponse.status}`);
      }
      console.log('[Natively] Player ID registered with backend:', playerIdToRegister);
      
      const prefsResponse = await fetch('/api/notification-preferences', {
        method: 'PUT',
        body: JSON.stringify({ 
          pushEnabled: true,
          notificationSettings: {
            inAppMessages: true,
            paymentRequests: true,
            substitutionRequests: true,
            joinRequests: true,
            upcomingEvents: true,
            newsAnnouncements: true,
          }
        }),
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!prefsResponse.ok) {
        console.warn('[Natively] Failed to enable push preferences:', prefsResponse.status);
      } else {
        console.log('[Natively] Push preferences enabled successfully');
      }
    } catch (error) {
      console.error('[Natively] Failed to register player ID:', error);
    }
  }, [isAuthenticated]);

  const setExternalIdWithRetry = useCallback((notifications: NativelyNotificationsInstance, userId: string) => {
    console.log('[Natively] Setting External ID:', userId, 'Attempt:', retryCountRef.current + 1);
    
    // Try multiple approaches to set the External ID
    
    // Method 1: Try NativelyNotifications.login() if available (preferred by OneSignal)
    if (notifications.login) {
      console.log('[Natively] Using NativelyNotifications.login() method');
      try {
        notifications.login(userId);
        console.log('[Natively] NativelyNotifications.login() called for:', userId);
        setExternalIdSet(true);
        // Still call setExternalId as backup
        performSetExternalId(notifications, userId);
        return;
      } catch (err) {
        console.warn('[Natively] NativelyNotifications.login() failed:', err);
      }
    }
    
    // Method 2: Try the standard OneSignal.login() if available
    if (window.OneSignal?.login) {
      console.log('[Natively] Using OneSignal.login() method');
      window.OneSignal.login(userId)
        .then(() => {
          console.log('[Natively] OneSignal.login() successful for:', userId);
          setExternalIdSet(true);
        })
        .catch((err) => {
          console.warn('[Natively] OneSignal.login() failed, falling back to setExternalId:', err);
          // Fall back to BuildNatively's setExternalId
          performSetExternalId(notifications, userId);
        });
      return;
    }
    
    // Method 3: Use BuildNatively's setExternalId method
    performSetExternalId(notifications, userId);
  }, []);

  const linkExternalIdViaBackend = useCallback(async (oneSignalId: string, userId: string) => {
    try {
      console.log('[Natively] Calling backend to link External ID via REST API');
      const response = await fetch('/api/notification-preferences/link-external-id', {
        method: 'POST',
        body: JSON.stringify({ oneSignalId, userId }),
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (response.ok) {
        console.log('[Natively] Backend successfully linked External ID');
      } else {
        console.warn('[Natively] Backend failed to link External ID:', response.status);
      }
    } catch (error) {
      console.error('[Natively] Error calling backend to link External ID:', error);
    }
  }, []);

  const performSetExternalId = useCallback((notifications: NativelyNotificationsInstance, userId: string) => {
    notifications.setExternalId({ externalId: userId }, (resp) => {
      console.log('[Natively] setExternalId response:', JSON.stringify(resp));
      
      if (resp && resp.externalId) {
        console.log('[Natively] External ID set successfully:', resp.externalId);
        setExternalIdSet(true);
        retryCountRef.current = 0;
        
        // Verify by fetching the external ID
        setTimeout(() => {
          notifications.getExternalId((verifyResp) => {
            console.log('[Natively] Verified External ID:', JSON.stringify(verifyResp));
          });
        }, 1000);
      } else {
        const errorMessage = (resp && resp.error) || (resp && resp.message) || 'Unknown error';
        console.warn('[Natively] External ID error:', errorMessage);
        
        // Try backend API as fallback if we have the player ID
        if (playerId) {
          linkExternalIdViaBackend(playerId, userId);
        }
        
        // Retry logic
        if (retryCountRef.current < maxRetries) {
          retryCountRef.current++;
          console.log('[Natively] Retrying setExternalId in 2 seconds...');
          setTimeout(() => {
            setExternalIdWithRetry(notifications, userId);
          }, 2000);
        } else {
          console.error('[Natively] Failed to set External ID after', maxRetries, 'attempts');
        }
      }
    });
  }, [setExternalIdWithRetry, playerId, linkExternalIdViaBackend]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      return;
    }

    if (!window.NativelyNotifications) {
      console.log('[Natively] NativelyNotifications not available (not running in Natively app)');
      return;
    }

    try {
      const notifications = new window.NativelyNotifications();
      notificationsRef.current = notifications;
      setIsInitialized(true);
      console.log('[Natively] NativelyNotifications initialized for user:', user.id);

      notifications.getPermissionStatus((resp) => {
        const status = resp.status ? 'granted' : 'default';
        setPermissionState(status);
        console.log('[Natively] Permission status:', status);
      });

      // Get Player ID first, then set External ID after
      notifications.getOneSignalId((resp) => {
        if (resp.playerId) {
          console.log('[Natively] Got Player ID:', resp.playerId);
          setPlayerId(resp.playerId);
          registerPlayerId(resp.playerId);
          
          // Set External ID AFTER we have the Player ID
          // This ensures the OneSignal profile exists before we try to link
          console.log('[Natively] Now setting External ID for user:', user.id);
          setExternalIdWithRetry(notifications, user.id);
        } else {
          console.log('[Natively] No Player ID available yet, will retry...');
          // Retry getting Player ID after a delay
          setTimeout(() => {
            notifications.getOneSignalId((retryResp) => {
              if (retryResp.playerId) {
                console.log('[Natively] Got Player ID on retry:', retryResp.playerId);
                setPlayerId(retryResp.playerId);
                registerPlayerId(retryResp.playerId);
                setExternalIdWithRetry(notifications, user.id);
              } else {
                console.warn('[Natively] Still no Player ID after retry');
                // Still try to set external ID even without player ID
                setExternalIdWithRetry(notifications, user.id);
              }
            });
          }, 2000);
        }
      });

      // Also check current External ID status
      notifications.getExternalId((resp) => {
        console.log('[Natively] Current External ID status:', JSON.stringify(resp));
        if (Array.isArray(resp) && resp.length > 0 && resp[0].externalId) {
          if (resp[0].externalId === user.id) {
            console.log('[Natively] External ID already correctly set');
            setExternalIdSet(true);
          } else {
            console.log('[Natively] External ID mismatch, need to update');
          }
        }
      });

    } catch (error) {
      console.error('[Natively] Initialization error:', error);
    }

    return () => {
      notificationsRef.current = null;
    };
  }, [isAuthenticated, user?.id, registerPlayerId, setExternalIdWithRetry]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!notificationsRef.current) {
        console.warn('[Natively] Not initialized yet');
        resolve(false);
        return;
      }

      const fallbackToSettings = true;
      
      notificationsRef.current.requestPermission(fallbackToSettings, (resp) => {
        const isGranted = resp.status === true;
        setPermissionState(isGranted ? 'granted' : 'denied');
        console.log('[Natively] Permission request result:', isGranted);
        
        if (isGranted && notificationsRef.current && user?.id) {
          notificationsRef.current.getOneSignalId((idResp) => {
            if (idResp.playerId) {
              console.log('[Natively] Got Player ID after permission:', idResp.playerId);
              setPlayerId(idResp.playerId);
              registerPlayerId(idResp.playerId);
              // Also set external ID after getting permission
              if (notificationsRef.current) {
                setExternalIdWithRetry(notificationsRef.current, user.id);
              }
            }
          });
        }
        
        resolve(isGranted);
      });
    });
  }, [registerPlayerId, user?.id, setExternalIdWithRetry]);

  return {
    isInitialized,
    playerId,
    externalIdSet,
    permissionState,
    requestPermission,
  };
}
