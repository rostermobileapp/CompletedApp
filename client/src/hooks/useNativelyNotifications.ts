import { useEffect, useCallback, useState, useRef } from 'react';
import { useAuth } from './useAuth';
import { getAuthHeaders } from '@/lib/queryClient';

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

/**
 * Natively SDK Notifications interface
 * Reference: https://docs.buildnatively.com/guides/integration/push-notifications-onesignal
 */
interface NativelyNotificationsSDK {
  getOneSignalId: (callback: (resp: { playerId?: string }) => void) => void;
  getPermissionStatus: (callback: (resp: { status: boolean }) => void) => void;
  requestPermission: (fallbackToSettings: boolean, callback: (resp: { status: boolean }) => void) => void;
  getExternalId: (callback: (resp: Array<{ externalId?: string; error?: string; message?: string }> | { externalId?: string; error?: string; message?: string }) => void) => void;
  setExternalId: (data: { externalId: string }, callback: (resp: { externalId?: string; error?: string; message?: string }) => void) => void;
  removeExternalId: (callback: (resp: { error?: string; message?: string } | null) => void) => void;
}

declare global {
  interface Window {
    OneSignal?: OneSignalSDK;
    OneSignalDeferred?: Array<(OneSignal: OneSignalSDK) => void>;
    OneSignalReady?: boolean;
    ONESIGNAL_APP_ID?: string;
    NativelyNotifications?: new () => NativelyNotificationsSDK;
  }
}

export function useNativelyNotifications() {
  const { user, isAuthenticated } = useAuth();
  const [isInitialized, setIsInitialized] = useState(false);
  const [isNativelyApp, setIsNativelyApp] = useState(false);
  const [isNativeSDK, setIsNativeSDK] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [displayId, setDisplayId] = useState<string | null>(null);
  const [externalIdSet, setExternalIdSet] = useState(false);
  const [permissionState, setPermissionState] = useState<'default' | 'granted' | 'denied'>('default');
  const hasInitialized = useRef(false);
  const nativelyInstanceRef = useRef<NativelyNotificationsSDK | null>(null);

  // Check which SDK is available - prefer Natively native SDK over web SDK
  const checkSDK = useCallback(() => {
    // Check for Natively native SDK first (runs in Natively wrapped app)
    const hasNativelySDK = typeof window.NativelyNotifications === 'function';
    
    // Check for OneSignal web SDK
    const hasWebSDK = !!window.OneSignal || !!window.OneSignalDeferred;
    
    console.log('[OneSignal] SDK check - Natively native:', hasNativelySDK, 'Web SDK:', hasWebSDK, 'ready:', window.OneSignalReady);
    
    if (hasNativelySDK) {
      setIsNativeSDK(true);
      setIsNativelyApp(true);
      console.log('[OneSignal] Using Natively native SDK');
      return true;
    } else if (hasWebSDK) {
      setIsNativeSDK(false);
      setIsNativelyApp(true);
      console.log('[OneSignal] Using OneSignal web SDK');
      return true;
    }
    
    setIsNativelyApp(false);
    return false;
  }, []);

  // Initialize Natively SDK instance
  const getNativelyInstance = useCallback((): NativelyNotificationsSDK | null => {
    if (nativelyInstanceRef.current) {
      return nativelyInstanceRef.current;
    }
    
    if (typeof window.NativelyNotifications === 'function') {
      try {
        nativelyInstanceRef.current = new window.NativelyNotifications();
        console.log('[OneSignal] Created NativelyNotifications instance');
        return nativelyInstanceRef.current;
      } catch (err) {
        console.error('[OneSignal] Failed to create NativelyNotifications instance:', err);
      }
    }
    return null;
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

    const fetchUserData = async () => {
      try {
        const authHeaders = await getAuthHeaders();
        const res = await fetch('/api/user', { 
          credentials: 'include',
          headers: authHeaders,
        });
        
        if (!res.ok) {
          console.error('[OneSignal] Failed to fetch user, status:', res.status);
          setDisplayId(null);
          return;
        }
        
        const data = await res.json();
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
      } catch (err) {
        console.error('[OneSignal] Failed to fetch user:', err);
        setDisplayId(null);
      }
    };

    fetchUserData();
  }, [isAuthenticated, user?.id]);

  // Register Player ID with backend
  const registerPlayerId = useCallback(async (playerIdToRegister: string) => {
    if (!isAuthenticated || !playerIdToRegister) return;
    
    try {
      const authHeaders = await getAuthHeaders();
      const response = await fetch('/api/notification-preferences/player-id', {
        method: 'POST',
        body: JSON.stringify({ playerId: playerIdToRegister }),
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      
      if (response.ok) {
        console.log('[OneSignal] Player ID registered:', playerIdToRegister);
        
        // Also enable push preferences
        await fetch('/api/notification-preferences', {
          method: 'PUT',
          body: JSON.stringify({ pushEnabled: true }),
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          credentials: 'include',
        });
      }
    } catch (error) {
      console.error('[OneSignal] Failed to register player ID:', error);
    }
  }, [isAuthenticated]);

  // Initialize with Natively native SDK
  const initNativelySDK = useCallback(async (userDisplayId: string) => {
    const notifications = getNativelyInstance();
    if (!notifications) {
      console.error('[OneSignal] NativelyNotifications instance not available');
      return;
    }

    console.log('[OneSignal] Initializing Natively native SDK for displayId:', userDisplayId);

    // Get permission status
    notifications.getPermissionStatus((resp) => {
      console.log('[OneSignal] Natively permission status:', resp);
      setPermissionState(resp.status ? 'granted' : 'default');
    });

    // Get OneSignal Player ID
    notifications.getOneSignalId((resp) => {
      console.log('[OneSignal] Natively Player ID response:', resp);
      if (resp.playerId) {
        setPlayerId(resp.playerId);
        registerPlayerId(resp.playerId);
      }
    });

    // Set External ID with displayId
    console.log('[OneSignal] Calling Natively setExternalId with:', userDisplayId);
    notifications.setExternalId({ externalId: userDisplayId }, async (resp) => {
      console.log('[OneSignal] Natively setExternalId response:', resp);
      
      if (resp && resp.externalId) {
        console.log('[OneSignal] ✅ External ID set successfully via Natively:', resp.externalId);
        setExternalIdSet(true);
        
        // Save external ID to backend
        try {
          const authHeaders = await getAuthHeaders();
          await fetch('/api/notification-preferences/link-external-id', {
            method: 'POST',
            body: JSON.stringify({ 
              oneSignalId: playerId || '', 
              userId: userDisplayId 
            }),
            headers: { ...authHeaders, 'Content-Type': 'application/json' },
            credentials: 'include',
          });
        } catch (err) {
          console.error('[OneSignal] Failed to save external ID to backend:', err);
        }
      } else {
        const errorMessage = (resp && resp.error) || (resp && resp.message) || 'Failed to set external ID';
        console.error('[OneSignal] ❌ Natively setExternalId failed:', errorMessage);
      }
    });

    setIsInitialized(true);
    hasInitialized.current = true;
  }, [getNativelyInstance, registerPlayerId, playerId]);

  // Initialize with OneSignal web SDK
  const initWebSDK = useCallback(async (userDisplayId: string) => {
    if (!window.OneSignalDeferred) {
      console.error('[OneSignal] Web SDK not available');
      return;
    }

    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        console.log('[OneSignal] Initializing web SDK for displayId:', userDisplayId);
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
          console.log('[OneSignal] Calling OneSignal.login() with External ID:', userDisplayId);
          await OneSignal.login(userDisplayId);
          console.log('[OneSignal] ✅ Successfully logged in with External ID:', userDisplayId);
          setExternalIdSet(true);
          
          // Save external ID to backend
          const authHeaders = await getAuthHeaders();
          await fetch('/api/notification-preferences/link-external-id', {
            method: 'POST',
            body: JSON.stringify({ 
              oneSignalId: subscriptionId || '', 
              userId: userDisplayId 
            }),
            headers: { ...authHeaders, 'Content-Type': 'application/json' },
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
  }, [registerPlayerId]);

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

    // Check which SDK is available and initialize accordingly
    checkSDK();
    
    // Use Natively native SDK if available, otherwise use web SDK
    if (typeof window.NativelyNotifications === 'function') {
      console.log('[OneSignal] Detected Natively app, using native SDK');
      initNativelySDK(displayId);
    } else if (window.OneSignalDeferred) {
      console.log('[OneSignal] Using web SDK');
      initWebSDK(displayId);
    } else {
      console.log('[OneSignal] No SDK available');
    }
  }, [isAuthenticated, user?.id, displayId, checkSDK, initNativelySDK, initWebSDK]);

  // Request permission
  const requestPermission = useCallback(async (): Promise<boolean> => {
    // Use Natively native SDK
    if (isNativeSDK) {
      return new Promise((resolve) => {
        const notifications = getNativelyInstance();
        if (!notifications) {
          console.warn('[OneSignal] Natively SDK not available');
          resolve(false);
          return;
        }

        console.log('[OneSignal] Requesting permission via Natively...');
        notifications.requestPermission(true, (resp) => {
          console.log('[OneSignal] Natively permission result:', resp);
          const granted = resp.status;
          setPermissionState(granted ? 'granted' : 'denied');

          if (granted) {
            // Get Player ID after permission granted
            notifications.getOneSignalId((idResp) => {
              console.log('[OneSignal] Got Player ID after permission:', idResp);
              if (idResp.playerId) {
                setPlayerId(idResp.playerId);
                registerPlayerId(idResp.playerId);
              }
            });
          }

          resolve(granted);
        });
      });
    }

    // Use web SDK
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
  }, [isNativeSDK, getNativelyInstance, registerPlayerId]);

  // Remove external ID (for logout)
  const removeExternalId = useCallback(async (): Promise<void> => {
    // Use Natively native SDK
    if (isNativeSDK) {
      return new Promise((resolve) => {
        const notifications = getNativelyInstance();
        if (!notifications) {
          resolve();
          return;
        }

        notifications.removeExternalId((resp) => {
          if (resp && (resp.error || resp.message)) {
            console.error('[OneSignal] Natively removeExternalId failed:', resp.error || resp.message);
          } else {
            console.log('[OneSignal] External ID removed via Natively');
            setExternalIdSet(false);
          }
          resolve();
        });
      });
    }

    // Use web SDK
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
  }, [isNativeSDK, getNativelyInstance]);

  // Manual refresh
  const refreshDetection = useCallback(() => {
    const result = checkSDK();
    
    // Try to get subscription ID if using Natively SDK
    if (isNativeSDK) {
      const notifications = getNativelyInstance();
      if (notifications) {
        notifications.getOneSignalId((resp) => {
          if (resp.playerId) {
            setPlayerId(resp.playerId);
            setIsInitialized(true);
          }
        });
      }
    } else if (window.OneSignalDeferred) {
      // Try to get subscription ID if using web SDK
      window.OneSignalDeferred.push((OneSignal) => {
        const subscriptionId = OneSignal.User.PushSubscription.id;
        if (subscriptionId) {
          setPlayerId(subscriptionId);
          setIsInitialized(true);
        }
      });
    }
    
    return result;
  }, [checkSDK, isNativeSDK, getNativelyInstance]);

  return {
    isInitialized,
    isNativelyApp,
    isNativeSDK,
    playerId,
    displayId,
    externalIdSet,
    permissionState,
    requestPermission,
    removeExternalId,
    refreshDetection,
  };
}
