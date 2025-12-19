import { useEffect, useCallback, useState, useRef } from 'react';
import { useAuth } from './useAuth';

/**
 * OneSignal Web SDK interface
 * Reference: https://documentation.onesignal.com/docs/web-sdk-reference
 */
interface OneSignalSDK {
  init: (config: { appId: string; allowLocalhostAsSecureOrigin?: boolean }) => Promise<void>;
  login: (externalId: string) => Promise<void>;
  logout: () => Promise<void>;
  User: {
    PushSubscription: {
      id: string | null | undefined;
      optIn: () => Promise<void>;
      optOut: () => Promise<void>;
    };
    addAlias: (label: string, id: string) => void;
  };
  Notifications: {
    permission: boolean;
    requestPermission: () => Promise<boolean>;
    addEventListener: (event: string, callback: (data: any) => void) => void;
  };
}

declare global {
  interface Window {
    OneSignal?: OneSignalSDK;
    OneSignalDeferred?: Array<(OneSignal: OneSignalSDK) => void>;
    OneSignalReady?: boolean;
    ONESIGNAL_APP_ID?: string;
  }
}

export function useNativelyNotifications() {
  const { user, isAuthenticated } = useAuth();
  const [isInitialized, setIsInitialized] = useState(false);
  const [isNativelyApp, setIsNativelyApp] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [displayId, setDisplayId] = useState<string | null>(null);
  const [externalIdSet, setExternalIdSet] = useState(false);
  const [permissionState, setPermissionState] = useState<'default' | 'granted' | 'denied'>('default');
  const hasInitialized = useRef(false);

  // Check if OneSignal SDK is available
  const checkSDK = useCallback(() => {
    const available = !!window.OneSignal || !!window.OneSignalDeferred;
    console.log('[OneSignal] SDK check - available:', available, 'ready:', window.OneSignalReady);
    setIsNativelyApp(available);
    return available;
  }, []);

  // Check for SDK on mount and when ready event fires
  useEffect(() => {
    checkSDK();
    
    const handleReady = () => {
      console.log('[OneSignal] Ready event received');
      checkSDK();
      setIsInitialized(true);
    };
    
    window.addEventListener('onesignalReady', handleReady);
    
    // Check if already ready
    if (window.OneSignalReady) {
      setIsInitialized(true);
    }
    
    return () => {
      window.removeEventListener('onesignalReady', handleReady);
    };
  }, [checkSDK]);

  // Fetch user's displayId (the short ID like "LFB3Kf", NOT the UUID)
  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setDisplayId(null);
      return;
    }

    fetch('/api/user', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        console.log('[OneSignal] User data received:', { 
          id: data.id, 
          displayId: data.displayId,
          hasDisplayId: !!data.displayId 
        });
        
        // IMPORTANT: Only use displayId if it exists - do NOT fall back to UUID
        // The displayId should be a short string like "LFB3Kf"
        if (data.displayId) {
          console.log('[OneSignal] Using displayId:', data.displayId);
          setDisplayId(data.displayId);
        } else {
          console.error('[OneSignal] ERROR: User has no displayId! This needs to be set in the database.');
          // Don't set displayId at all if not available - this will prevent wrong External ID
          setDisplayId(null);
        }
      })
      .catch(err => {
        console.error('[OneSignal] Failed to fetch user:', err);
        setDisplayId(null);
      });
  }, [isAuthenticated, user?.id]);

  // Register Player ID with backend
  const registerPlayerId = useCallback(async (playerIdToRegister: string) => {
    if (!isAuthenticated || !playerIdToRegister) return;
    
    try {
      const response = await fetch('/api/notification-preferences/player-id', {
        method: 'POST',
        body: JSON.stringify({ playerId: playerIdToRegister }),
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      
      if (response.ok) {
        console.log('[OneSignal] Player ID registered:', playerIdToRegister);
        
        // Also enable push preferences
        await fetch('/api/notification-preferences', {
          method: 'PUT',
          body: JSON.stringify({ pushEnabled: true }),
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });
      }
    } catch (error) {
      console.error('[OneSignal] Failed to register player ID:', error);
    }
  }, [isAuthenticated]);

  // Initialize and sync with OneSignal when user is authenticated
  useEffect(() => {
    // Don't proceed without a valid displayId (short ID like "LFB3Kf")
    if (!isAuthenticated || !user?.id || !displayId || hasInitialized.current) {
      if (!displayId && isAuthenticated && user?.id) {
        console.log('[OneSignal] Waiting for displayId before initializing...');
      }
      return;
    }

    // Validate displayId is not a UUID (should be short like "LFB3Kf")
    if (displayId.length > 10 || displayId.includes('-')) {
      console.error('[OneSignal] ERROR: displayId appears to be a UUID, not a short ID:', displayId);
      return;
    }

    const initOneSignal = async () => {
      // Use OneSignalDeferred to ensure SDK is ready
      if (window.OneSignalDeferred) {
        window.OneSignalDeferred.push(async (OneSignal) => {
          try {
            console.log('[OneSignal] Initializing for user with displayId:', displayId);
            hasInitialized.current = true;
            setIsInitialized(true);

            // Check permission status
            const permission = OneSignal.Notifications.permission;
            console.log('[OneSignal] Permission:', permission);
            setPermissionState(permission ? 'granted' : 'default');

            // Get the subscription ID (Player ID)
            const subscriptionId = OneSignal.User.PushSubscription.id;
            console.log('[OneSignal] Subscription ID:', subscriptionId);
            
            if (subscriptionId) {
              setPlayerId(subscriptionId);
              await registerPlayerId(subscriptionId);
            }

            // Login with external ID to link user
            try {
              console.log('[OneSignal] Calling OneSignal.login() with External ID:', displayId);
              await OneSignal.login(displayId);
              console.log('[OneSignal] ✅ Successfully logged in with External ID:', displayId);
              setExternalIdSet(true);
              
              // Save external ID to backend
              await fetch('/api/notification-preferences/link-external-id', {
                method: 'POST',
                body: JSON.stringify({ 
                  oneSignalId: subscriptionId || '', 
                  userId: displayId 
                }),
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
              });
            } catch (loginError) {
              console.error('[OneSignal] Login error:', loginError);
            }

            // Listen for subscription changes
            OneSignal.Notifications.addEventListener('permissionChange', (granted: boolean) => {
              console.log('[OneSignal] Permission changed:', granted);
              setPermissionState(granted ? 'granted' : 'denied');
            });

          } catch (error) {
            console.error('[OneSignal] Initialization error:', error);
          }
        });
      }
    };

    initOneSignal();
  }, [isAuthenticated, user?.id, displayId, registerPlayerId]);

  // Request permission
  const requestPermission = useCallback(async (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!window.OneSignalDeferred) {
        console.warn('[OneSignal] SDK not available');
        resolve(false);
        return;
      }

      window.OneSignalDeferred.push(async (OneSignal) => {
        try {
          console.log('[OneSignal] Requesting permission...');
          const granted = await OneSignal.Notifications.requestPermission();
          console.log('[OneSignal] Permission result:', granted);
          setPermissionState(granted ? 'granted' : 'denied');

          if (granted) {
            // Opt in to push
            await OneSignal.User.PushSubscription.optIn();
            
            // Get subscription ID after opt-in
            setTimeout(async () => {
              const subscriptionId = OneSignal.User.PushSubscription.id;
              console.log('[OneSignal] Subscription ID after opt-in:', subscriptionId);
              if (subscriptionId) {
                setPlayerId(subscriptionId);
                await registerPlayerId(subscriptionId);
              }
            }, 1000);
          }

          resolve(granted);
        } catch (error) {
          console.error('[OneSignal] Permission request error:', error);
          resolve(false);
        }
      });
    });
  }, [registerPlayerId]);

  // Remove external ID (for logout)
  const removeExternalId = useCallback(async (): Promise<void> => {
    return new Promise((resolve) => {
      if (!window.OneSignalDeferred) {
        resolve();
        return;
      }

      window.OneSignalDeferred.push(async (OneSignal) => {
        try {
          await OneSignal.logout();
          console.log('[OneSignal] Logged out');
          setExternalIdSet(false);
        } catch (error) {
          console.error('[OneSignal] Logout error:', error);
        }
        resolve();
      });
    });
  }, []);

  // Manual refresh
  const refreshDetection = useCallback(() => {
    const result = checkSDK();
    
    // Try to get subscription ID if SDK is available
    if (window.OneSignalDeferred) {
      window.OneSignalDeferred.push((OneSignal) => {
        const subscriptionId = OneSignal.User.PushSubscription.id;
        if (subscriptionId) {
          setPlayerId(subscriptionId);
          setIsInitialized(true);
        }
      });
    }
    
    return result;
  }, [checkSDK]);

  return {
    isInitialized,
    isNativelyApp,
    playerId,
    displayId,
    externalIdSet,
    permissionState,
    requestPermission,
    removeExternalId,
    refreshDetection,
  };
}
