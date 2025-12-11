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
  const [displayId, setDisplayId] = useState<string | null>(null);
  const [externalIdSet, setExternalIdSet] = useState(false);
  const [permissionState, setPermissionState] = useState<string>('default');
  const notificationsRef = useRef<NativelyNotificationsInstance | null>(null);
  const hasSetExternalIdRef = useRef(false);

  // Fetch the user's displayId from the backend
  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setDisplayId(null);
      return;
    }

    fetch('/api/user', {
      credentials: 'include',
    })
      .then(res => res.json())
      .then(data => {
        if (data.displayId) {
          console.log('[Natively] Fetched displayId:', data.displayId);
          setDisplayId(data.displayId);
        } else {
          console.warn('[Natively] No displayId in user profile, using user.id as fallback');
          // Fallback to user.id if displayId is not available
          setDisplayId(user.id);
        }
      })
      .catch(err => {
        console.error('[Natively] Failed to fetch user profile, using user.id as fallback:', err);
        // Fallback to user.id on error
        setDisplayId(user.id);
      });
  }, [isAuthenticated, user?.id]);

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

  const linkExternalIdViaBackend = useCallback(async (oneSignalId: string, visibleUserId: string) => {
    try {
      console.log('[Natively] Calling backend to link External ID via REST API');
      const response = await fetch('/api/notification-preferences/link-external-id', {
        method: 'POST',
        body: JSON.stringify({ oneSignalId, userId: visibleUserId }),
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (response.ok) {
        console.log('[Natively] Backend successfully linked External ID');
        return true;
      } else {
        console.warn('[Natively] Backend failed to link External ID:', response.status);
        return false;
      }
    } catch (error) {
      console.error('[Natively] Error calling backend to link External ID:', error);
      return false;
    }
  }, []);

  const trySetExternalId = useCallback((notifications: NativelyNotificationsInstance, visibleUserId: string) => {
    console.log('[Natively] Attempting setExternalId()...');
    
    notifications.setExternalId({ externalId: visibleUserId }, (resp) => {
      console.log('[Natively] setExternalId response:', JSON.stringify(resp));
      
      if (resp && resp.externalId) {
        console.log('[Natively] ✓ External ID set successfully:', resp.externalId);
        setExternalIdSet(true);
        
        // Final verification
        setTimeout(() => {
          notifications.getExternalId((verifyResp) => {
            console.log('[Natively] Final verification:', JSON.stringify(verifyResp));
          });
        }, 1000);
      } else {
        const errorMessage = (resp && resp.error) || (resp && resp.message) || 'Unknown error';
        console.error('[Natively] ✗ setExternalId failed:', errorMessage);
        
        // Last resort: try backend API
        if (playerId) {
          console.log('[Natively] Trying backend API as last resort');
          linkExternalIdViaBackend(playerId, visibleUserId);
        }
      }
    });
  }, [playerId, linkExternalIdViaBackend]);

  const tryBackupMethods = useCallback((notifications: NativelyNotificationsInstance, visibleUserId: string) => {
    if (notifications.login) {
      try {
        notifications.login(visibleUserId);
        console.log('[Natively] Backup: NativelyNotifications.login() called');
      } catch (err) {
        console.warn('[Natively] Backup login failed:', err);
      }
    }
    
    setTimeout(() => {
      trySetExternalId(notifications, visibleUserId);
    }, 1000);
  }, [trySetExternalId]);

  const setExternalIdForUser = useCallback(async (visibleUserId: string) => {
    if (hasSetExternalIdRef.current) {
      console.log('[Natively] External ID already set, skipping');
      return;
    }

    const notifications = notificationsRef.current;
    if (!notifications) {
      console.warn('[Natively] Notifications not initialized');
      return;
    }

    console.log('[Natively] Setting External ID to:', visibleUserId);
    hasSetExternalIdRef.current = true;

    // Strategy: Try methods in order, wait for each to complete before trying next
    
    // Method 1: Try OneSignal.login() first (recommended by OneSignal)
    if (window.OneSignal?.login) {
      try {
        console.log('[Natively] Attempting OneSignal.login()...');
        await window.OneSignal.login(visibleUserId);
        console.log('[Natively] ✓ OneSignal.login() successful');
        
        // Verify it worked
        setTimeout(() => {
          notifications.getExternalId((resp) => {
            if (Array.isArray(resp) && resp.length > 0 && resp[0].externalId === visibleUserId) {
              console.log('[Natively] ✓ External ID verified:', visibleUserId);
              setExternalIdSet(true);
            } else {
              console.warn('[Natively] External ID verification failed, trying backup methods');
              tryBackupMethods(notifications, visibleUserId);
            }
          });
        }, 1500);
        return;
      } catch (err) {
        console.warn('[Natively] OneSignal.login() failed:', err);
      }
    }

    // Method 2: Try NativelyNotifications.login()
    if (notifications.login) {
      try {
        console.log('[Natively] Attempting NativelyNotifications.login()...');
        notifications.login(visibleUserId);
        console.log('[Natively] ✓ NativelyNotifications.login() called');
        
        // Verify it worked
        setTimeout(() => {
          notifications.getExternalId((resp) => {
            if (Array.isArray(resp) && resp.length > 0 && resp[0].externalId === visibleUserId) {
              console.log('[Natively] ✓ External ID verified:', visibleUserId);
              setExternalIdSet(true);
            } else {
              console.warn('[Natively] External ID verification failed, trying setExternalId');
              trySetExternalId(notifications, visibleUserId);
            }
          });
        }, 1500);
        return;
      } catch (err) {
        console.warn('[Natively] NativelyNotifications.login() failed:', err);
      }
    }

    // Method 3: Fall back to setExternalId
    trySetExternalId(notifications, visibleUserId);
  }, [tryBackupMethods, trySetExternalId]);

  useEffect(() => {
    // Wait for both authentication and displayId to be available
    if (!isAuthenticated || !user?.id || !displayId) {
      return;
    }

    if (!window.NativelyNotifications) {
      console.log('[Natively] NativelyNotifications not available (not running in Natively app)');
      return;
    }

    try {
      const notifications = new window.NativelyNotifications();
      notificationsRef.current = notifications;
      console.log('[Natively] NativelyNotifications initialized for user:', user.id, 'displayId:', displayId);

      notifications.getPermissionStatus((resp) => {
        const status = resp.status ? 'granted' : 'default';
        setPermissionState(status);
        console.log('[Natively] Permission status:', status);
      });

      // Get Player ID first
      notifications.getOneSignalId((resp) => {
        if (resp.playerId) {
          console.log('[Natively] Got Player ID:', resp.playerId);
          setPlayerId(resp.playerId);
          registerPlayerId(resp.playerId);
          
          // IMPORTANT: Wait for OneSignal to be fully initialized before setting External ID
          // Give it 2 seconds to ensure the SDK is ready
          setTimeout(() => {
            setIsInitialized(true);
            setExternalIdForUser(displayId);
          }, 2000);
        } else {
          console.log('[Natively] No Player ID available yet, will retry...');
          // Retry getting Player ID after a delay
          setTimeout(() => {
            notifications.getOneSignalId((retryResp) => {
              if (retryResp.playerId) {
                console.log('[Natively] Got Player ID on retry:', retryResp.playerId);
                setPlayerId(retryResp.playerId);
                registerPlayerId(retryResp.playerId);
                
                // Set External ID after getting Player ID
                setTimeout(() => {
                  setIsInitialized(true);
                  setExternalIdForUser(displayId);
                }, 2000);
              } else {
                console.warn('[Natively] Still no Player ID after retry');
              }
            });
          }, 2000);
        }
      });

    } catch (error) {
      console.error('[Natively] Initialization error:', error);
    }

    return () => {
      notificationsRef.current = null;
      hasSetExternalIdRef.current = false;
    };
  }, [isAuthenticated, user?.id, displayId, registerPlayerId, setExternalIdForUser]);

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
        
        if (isGranted && notificationsRef.current && displayId) {
          notificationsRef.current.getOneSignalId((idResp) => {
            if (idResp.playerId) {
              console.log('[Natively] Got Player ID after permission:', idResp.playerId);
              setPlayerId(idResp.playerId);
              registerPlayerId(idResp.playerId);
              
              // Set External ID after permission is granted
              setTimeout(() => {
                if (displayId) {
                  setExternalIdForUser(displayId);
                }
              }, 1500);
            }
          });
        }
        
        resolve(isGranted);
      });
    });
  }, [registerPlayerId, displayId, setExternalIdForUser]);

  return {
    isInitialized,
    playerId,
    externalIdSet,
    permissionState,
    requestPermission,
  };
}
