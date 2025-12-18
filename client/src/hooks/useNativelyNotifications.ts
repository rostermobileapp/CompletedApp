import { useEffect, useCallback, useState, useRef } from 'react';
import { useAuth } from './useAuth';

/**
 * Interface matching BuildNatively's NativelyNotifications JavaScript SDK
 * Reference: https://docs.buildnatively.com/guides/integration/push-notifications-onesignal
 */
interface NativelyNotificationsInstance {
  // Get OneSignal Player ID (subscription ID)
  getOneSignalId: (callback: (resp: { playerId: string | null }) => void) => void;
  // Get current permission status
  getPermissionStatus: (callback: (resp: { status: boolean }) => void) => void;
  // Request notification permission
  requestPermission: (fallbackToSettings: boolean, callback: (resp: { status: boolean }) => void) => void;
  // Get the current External ID
  getExternalId: (callback: (resp: Array<{ externalId?: string; error?: string; message?: string }>) => void) => void;
  // Set External ID to link the device to a user
  setExternalId: (params: { externalId: string }, callback: (resp: { externalId?: string; error?: string; message?: string }) => void) => void;
  // Remove External ID (for logout)
  removeExternalId: (callback: (resp: { error?: string; message?: string } | null) => void) => void;
  // Optional: login method (some versions of the SDK have this)
  login?: (externalId: string) => void;
}

declare global {
  interface Window {
    NativelyNotifications?: new () => NativelyNotificationsInstance;
    OneSignal?: {
      login: (externalId: string) => Promise<void>;
      logout: () => Promise<void>;
      User?: {
        addAlias: (label: string, id: string) => void;
      };
    };
    natively?: boolean;
    nativelyReady?: boolean;
  }
}

export function useNativelyNotifications() {
  const { user, isAuthenticated } = useAuth();
  const [isInitialized, setIsInitialized] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [displayId, setDisplayId] = useState<string | null>(null);
  const [externalIdSet, setExternalIdSet] = useState(false);
  const [permissionState, setPermissionState] = useState<'default' | 'granted' | 'denied'>('default');
  const notificationsRef = useRef<NativelyNotificationsInstance | null>(null);
  const hasCalledLoginRef = useRef(false);
  const isSettingExternalIdRef = useRef(false);

  /**
   * Fetch the user's displayId from the backend
   * This is used as the External ID in OneSignal to link the device to the user
   */
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
          // Fall back to user.id if no displayId
          console.warn('[Natively] No displayId in user profile, using user.id as fallback');
          setDisplayId(user.id);
        }
      })
      .catch(err => {
        console.error('[Natively] Failed to fetch user profile, using user.id as fallback:', err);
        setDisplayId(user.id);
      });
  }, [isAuthenticated, user?.id]);

  /**
   * Register the OneSignal Player ID with our backend
   */
  const registerPlayerId = useCallback(async (playerIdToRegister: string) => {
    if (!isAuthenticated || !playerIdToRegister) return;
    
    try {
      // Register the OneSignal Player ID with our backend
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
      
      // Enable push preferences by default
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

  /**
   * Link External ID via backend REST API (fallback method)
   */
  const linkExternalIdViaBackend = useCallback(async (oneSignalId: string, externalUserId: string): Promise<boolean> => {
    try {
      console.log('[Natively] Calling backend to link External ID via REST API');
      const response = await fetch('/api/notification-preferences/link-external-id', {
        method: 'POST',
        body: JSON.stringify({ oneSignalId, userId: externalUserId }),
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

  /**
   * Set External ID using available methods in priority order:
   * 1. OneSignal.login() - recommended method
   * 2. NativelyNotifications.login() - alternative
   * 3. NativelyNotifications.setExternalId() - SDK method
   * 4. Backend API - fallback
   */
  const setExternalIdImmediately = useCallback((userId: string) => {
    if (hasCalledLoginRef.current || isSettingExternalIdRef.current) {
      console.log('[Natively] Login already called or in progress, skipping');
      return;
    }

    const notifications = notificationsRef.current;
    if (!notifications) {
      console.warn('[Natively] Notifications not initialized');
      return;
    }

    console.log('[Natively] Setting External ID to:', userId);
    isSettingExternalIdRef.current = true;

    // Priority 1: Use OneSignal.login() - this is the recommended method
    if (window.OneSignal?.login) {
      console.log('[Natively] Calling OneSignal.login()...');
      window.OneSignal.login(userId)
        .then(() => {
          console.log('[Natively] ✓ OneSignal.login() successful for:', userId);
          setExternalIdSet(true);
          hasCalledLoginRef.current = true;
          isSettingExternalIdRef.current = false;
          
          // Verify after a short delay
          setTimeout(() => {
            notifications.getExternalId((resp) => {
              console.log('[Natively] External ID verification:', JSON.stringify(resp));
            });
          }, 1000);
        })
        .catch((err) => {
          console.error('[Natively] ✗ OneSignal.login() failed:', err);
          // Try backup methods
          tryNativelyMethods(notifications, userId);
        });
      return;
    }

    // If OneSignal.login not available, try Natively methods
    tryNativelyMethods(notifications, userId);
  }, []);

  /**
   * Try Natively-specific methods to set External ID
   */
  const tryNativelyMethods = useCallback((notifications: NativelyNotificationsInstance, userId: string) => {
    // Priority 2: Use NativelyNotifications.login() if available
    if (notifications.login) {
      console.log('[Natively] Calling NativelyNotifications.login()...');
      try {
        notifications.login(userId);
        console.log('[Natively] ✓ NativelyNotifications.login() called for:', userId);
        setExternalIdSet(true);
        hasCalledLoginRef.current = true;
        isSettingExternalIdRef.current = false;
        
        // Verify after a short delay
        setTimeout(() => {
          notifications.getExternalId((resp) => {
            console.log('[Natively] External ID verification:', JSON.stringify(resp));
          });
        }, 1000);
        return;
      } catch (err) {
        console.error('[Natively] ✗ NativelyNotifications.login() failed:', err);
      }
    }

    // Priority 3: Use setExternalId SDK method
    console.log('[Natively] Using setExternalId()...');
    notifications.setExternalId({ externalId: userId }, async (resp) => {
      if (resp && resp.externalId) {
        console.log('[Natively] ✓ setExternalId successful:', resp.externalId);
        setExternalIdSet(true);
        hasCalledLoginRef.current = true;
        isSettingExternalIdRef.current = false;
      } else {
        const errorMessage = (resp && resp.error) || (resp && resp.message) || "Failed to set external ID";
        console.error('[Natively] ✗ setExternalId failed:', errorMessage);
        
        // Priority 4: Try backend API as fallback
        if (playerId) {
          console.log('[Natively] Trying backend API as fallback...');
          const success = await linkExternalIdViaBackend(playerId, userId);
          if (success) {
            setExternalIdSet(true);
            hasCalledLoginRef.current = true;
          }
        }
        isSettingExternalIdRef.current = false;
      }
    });
  }, [playerId, linkExternalIdViaBackend]);

  /**
   * Main initialization effect
   * Runs when user is authenticated and displayId is available
   */
  useEffect(() => {
    // Wait for both authentication and displayId to be available
    if (!isAuthenticated || !user?.id || !displayId) {
      return;
    }

    // Function to setup notifications once SDK is available
    const setupNotifications = () => {
      if (!window.NativelyNotifications) {
        console.log('[Natively] NativelyNotifications not available');
        return;
      }

      try {
        // Create new instance of NativelyNotifications
        const notifications = new window.NativelyNotifications();
        notificationsRef.current = notifications;
        setIsInitialized(true);
        console.log('[Natively] NativelyNotifications initialized for user:', user.id, 'displayId:', displayId);

        // Get current permission status
        notifications.getPermissionStatus((resp) => {
          const status = resp.status ? 'granted' : 'default';
          setPermissionState(status);
          console.log('[Natively] Permission status:', status);
        });

        // Get OneSignal Player ID
        notifications.getOneSignalId((resp) => {
          if (resp.playerId) {
            console.log('[Natively] Got Player ID:', resp.playerId);
            setPlayerId(resp.playerId);
            registerPlayerId(resp.playerId);
            
            // Set External ID immediately after getting Player ID
            // This links the device subscription to our user
            console.log('[Natively] Calling setExternalId immediately after getting Player ID');
            setExternalIdImmediately(displayId);
          } else {
            console.log('[Natively] No Player ID available yet, will retry...');
            // Retry getting Player ID after a delay
            setTimeout(() => {
              notifications.getOneSignalId((retryResp) => {
                if (retryResp.playerId) {
                  console.log('[Natively] Got Player ID on retry:', retryResp.playerId);
                  setPlayerId(retryResp.playerId);
                  registerPlayerId(retryResp.playerId);
                  
                  // Set External ID on retry as well
                  console.log('[Natively] Calling setExternalId after retry');
                  setExternalIdImmediately(displayId);
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
    };

    // Check if SDK is already available
    if (window.NativelyNotifications) {
      setupNotifications();
    } else {
      // SDK not ready yet, wait for it
      console.log('[Natively] Waiting for SDK to load...');
      const handleNativelyReady = () => {
        console.log('[Natively] SDK ready event received');
        setupNotifications();
      };
      
      window.addEventListener('nativelyReady', handleNativelyReady);
      
      // Cleanup event listener
      return () => {
        window.removeEventListener('nativelyReady', handleNativelyReady);
        notificationsRef.current = null;
        hasCalledLoginRef.current = false;
        isSettingExternalIdRef.current = false;
      };
    }

    // Cleanup on unmount
    return () => {
      notificationsRef.current = null;
      hasCalledLoginRef.current = false;
      isSettingExternalIdRef.current = false;
    };
  }, [isAuthenticated, user?.id, displayId, registerPlayerId, setExternalIdImmediately]);

  /**
   * Request notification permission from the user
   * Returns true if permission was granted
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!notificationsRef.current) {
        console.warn('[Natively] Not initialized yet');
        resolve(false);
        return;
      }

      // Show alert if permission is denied, giving user option to go to settings
      const fallbackToSettings = true;
      
      notificationsRef.current.requestPermission(fallbackToSettings, (resp) => {
        const isGranted = resp.status === true;
        setPermissionState(isGranted ? 'granted' : 'denied');
        console.log('[Natively] Permission request result:', isGranted);
        
        if (isGranted && notificationsRef.current && displayId) {
          // Get Player ID and set External ID immediately after permission is granted
          notificationsRef.current.getOneSignalId((idResp) => {
            if (idResp.playerId) {
              console.log('[Natively] Got Player ID after permission:', idResp.playerId);
              setPlayerId(idResp.playerId);
              registerPlayerId(idResp.playerId);
              
              // Set External ID after getting permission
              console.log('[Natively] Calling setExternalId after permission granted');
              setExternalIdImmediately(displayId);
            }
          });
        }
        
        resolve(isGranted);
      });
    });
  }, [registerPlayerId, displayId, setExternalIdImmediately]);

  /**
   * Remove External ID (call on logout)
   */
  const removeExternalId = useCallback(async (): Promise<void> => {
    return new Promise((resolve) => {
      // Reset local state
      hasCalledLoginRef.current = false;
      setExternalIdSet(false);

      // Try OneSignal.logout first
      if (window.OneSignal?.logout) {
        console.log('[Natively] Calling OneSignal.logout()...');
        window.OneSignal.logout()
          .then(() => {
            console.log('[Natively] ✓ OneSignal.logout() successful');
            resolve();
          })
          .catch((err) => {
            console.error('[Natively] ✗ OneSignal.logout() failed:', err);
            // Fall back to removeExternalId
            tryRemoveExternalId(resolve);
          });
        return;
      }

      tryRemoveExternalId(resolve);
    });
  }, []);

  const tryRemoveExternalId = useCallback((resolve: () => void) => {
    if (!notificationsRef.current) {
      console.warn('[Natively] Not initialized, skipping removeExternalId');
      resolve();
      return;
    }

    notificationsRef.current.removeExternalId((resp) => {
      if (resp && (resp.error || resp.message)) {
        const errorMessage = resp.error || resp.message;
        console.error('[Natively] Failed to remove external ID:', errorMessage);
      } else {
        console.log('[Natively] External ID removed successfully');
      }
      resolve();
    });
  }, []);

  /**
   * Check if we're running in a Natively app
   * Either the SDK is loaded or the natively flag is set
   */
  const isNativelyApp = typeof window !== 'undefined' && (!!window.NativelyNotifications || !!window.natively || !!window.nativelyReady);

  return {
    isInitialized,
    isNativelyApp,
    playerId,
    displayId,
    externalIdSet,
    permissionState,
    requestPermission,
    removeExternalId,
  };
}
