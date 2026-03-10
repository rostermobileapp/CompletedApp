import { useEffect, useCallback, useState, useRef } from 'react';
import { useAuth } from './useAuth';
import { getAuthHeaders } from '@/lib/queryClient';
// Import Natively SDK from NPM package
import { NativelyNotifications, NativelyInfo, useNatively } from 'natively';

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
    addTag: (key: string, value: string) => void;
    addTags: (tags: Record<string, string>) => void;
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
  sendTag: (data: { key: string; value: string }, callback: (resp: { success?: boolean; error?: string }) => void) => void;
  sendTags: (data: { tags: Record<string, string> }, callback: (resp: { success?: boolean; error?: string }) => void) => void;
}

declare global {
  interface Window {
    OneSignal?: OneSignalSDK;
    OneSignalDeferred?: Array<(OneSignal: OneSignalSDK) => void>;
    OneSignalReady?: boolean;
    ONESIGNAL_APP_ID?: string;
    NativelyNotifications?: new () => NativelyNotificationsSDK;
    natively?: any;
    nativelyLoaded?: boolean;
    isNativelyApp?: boolean;
    NativelyInfo?: new () => { browserInfo: () => { isNativeApp: boolean } };
  }
}

export function useNativelyNotifications() {
  const { user, isAuthenticated } = useAuth();
  const [isInitialized, setIsInitialized] = useState(false);
  const [isNativelyApp, setIsNativelyApp] = useState(false);
  const [isNativeSDK, setIsNativeSDK] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [displayId, setDisplayId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [externalIdSet, setExternalIdSet] = useState(false);
  const [permissionState, setPermissionState] = useState<'default' | 'granted' | 'denied'>('default');
  const hasInitialized = useRef(false);
  const nativelyInstanceRef = useRef<NativelyNotificationsSDK | null>(null);
  const playerIdRef = useRef<string | null>(null);

  // Check which SDK is available - prefer Natively native SDK over web SDK
  const checkSDK = useCallback(() => {
    // Check for Natively native SDK using the NPM package
    let isInNativeApp = false;
    try {
      const nativelyInfo = new NativelyInfo();
      const browserInfo = nativelyInfo.browserInfo();
      isInNativeApp = browserInfo?.isNativeApp === true;
      console.log('[OneSignal] NativelyInfo.browserInfo():', browserInfo);
    } catch (err) {
      console.log('[OneSignal] NativelyInfo check error:', err);
    }
    
    // Also check window globals as fallback
    const hasNativelyGlobal = typeof window.natively !== 'undefined';
    const hasNativelySDK = typeof NativelyNotifications === 'function' || typeof window.NativelyNotifications === 'function';
    
    // Check for OneSignal web SDK
    const hasWebSDK = !!window.OneSignal || !!window.OneSignalDeferred;
    
    console.log('[OneSignal] SDK check - NativelyNotifications:', hasNativelySDK, 
      'window.natively:', hasNativelyGlobal,
      'isNativeApp:', isInNativeApp,
      'Web SDK:', hasWebSDK, 
      'ready:', window.OneSignalReady);
    
    // If we're in a native app with NativelyNotifications available
    if (isInNativeApp && hasNativelySDK) {
      setIsNativeSDK(true);
      setIsNativelyApp(true);
      console.log('[OneSignal] Using Natively native SDK (NPM package)');
      return true;
    } else if (hasNativelySDK && hasNativelyGlobal) {
      // NativelyNotifications exists with window.natively
      setIsNativeSDK(true);
      setIsNativelyApp(true);
      console.log('[OneSignal] NativelyNotifications available with window.natively');
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

  // Initialize Natively SDK instance using NPM package
  const getNativelyInstance = useCallback((): NativelyNotificationsSDK | null => {
    if (nativelyInstanceRef.current) {
      return nativelyInstanceRef.current;
    }
    
    // Try NPM package first
    try {
      nativelyInstanceRef.current = new NativelyNotifications() as unknown as NativelyNotificationsSDK;
      console.log('[OneSignal] Created NativelyNotifications instance from NPM package');
      return nativelyInstanceRef.current;
    } catch (err) {
      console.log('[OneSignal] NPM NativelyNotifications error:', err);
    }
    
    // Fallback to window global
    if (typeof window.NativelyNotifications === 'function') {
      try {
        nativelyInstanceRef.current = new window.NativelyNotifications();
        console.log('[OneSignal] Created NativelyNotifications instance from window global');
        return nativelyInstanceRef.current;
      } catch (err) {
        console.error('[OneSignal] Failed to create NativelyNotifications instance:', err);
      }
    }
    return null;
  }, []);

  // Set or remove the In-App trigger based on permission status
  // This triggers OneSignal In-App messages when permission is NOT enabled
  const updateInAppTrigger = useCallback((hasPermission: boolean) => {
    if (isNativeSDK) {
      const notifications = getNativelyInstance();
      if (notifications && 'addTrigger' in notifications) {
        if (!hasPermission) {
          (notifications as any).addTrigger?.("permission_not_enabled", "true");
          console.log('[OneSignal] Set in-app trigger: permission_not_enabled = true');
        } else {
          (notifications as any).removeTrigger?.("permission_not_enabled");
          console.log('[OneSignal] Removed in-app trigger: permission_not_enabled');
        }
      }
    } else if (window.OneSignalDeferred) {
      window.OneSignalDeferred.push((OneSignal) => {
        if (!hasPermission) {
          (OneSignal as any).InAppMessages?.addTrigger("permission_not_enabled", "true");
          console.log('[OneSignal] Set in-app trigger: permission_not_enabled = true');
        } else {
          (OneSignal as any).InAppMessages?.removeTrigger("permission_not_enabled");
          console.log('[OneSignal] Removed in-app trigger: permission_not_enabled');
        }
      });
    }
  }, [isNativeSDK, getNativelyInstance]);

  // Check for SDK on mount and when ready event fires
  useEffect(() => {
    // Initial check
    checkSDK();
    
    // Retry SDK detection multiple times (Natively SDK may load async)
    let retryCount = 0;
    const maxRetries = 30; // 6 seconds total
    const retryInterval = setInterval(() => {
      retryCount++;
      const hasNativelySDK = typeof window.NativelyNotifications === 'function';
      const hasNativelyGlobal = typeof window.natively !== 'undefined';
      
      if (retryCount <= 5 || retryCount % 5 === 0) {
        console.log(`[OneSignal] SDK retry check ${retryCount}/${maxRetries} - NativelyNotifications:`, hasNativelySDK, 'window.natively:', hasNativelyGlobal);
      }
      
      if (hasNativelySDK) {
        console.log('[OneSignal] Natively SDK detected on retry', retryCount);
        setIsNativeSDK(true);
        setIsNativelyApp(true);
        clearInterval(retryInterval);
      } else if (retryCount >= maxRetries) {
        console.log('[OneSignal] Max retries reached, using web SDK fallback');
        clearInterval(retryInterval);
      }
    }, 200);
    
    // Listen for Natively SDK ready event
    const handleNativelyReady = (event: CustomEvent) => {
      console.log('[OneSignal] Natively ready event received:', event.detail);
      checkSDK();
    };
    
    const handleOneSignalReady = () => {
      console.log('[OneSignal] OneSignal ready event received');
      checkSDK();
      setIsInitialized(true);
    };
    
    window.addEventListener('nativelyReady', handleNativelyReady as EventListener);
    window.addEventListener('onesignalReady', handleOneSignalReady);
    
    // Check if already ready
    if (window.OneSignalReady) {
      setIsInitialized(true);
    }
    
    return () => {
      clearInterval(retryInterval);
      window.removeEventListener('nativelyReady', handleNativelyReady as EventListener);
      window.removeEventListener('onesignalReady', handleOneSignalReady);
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
          firstName: data.firstName,
          hasDisplayId: !!data.displayId 
        });
        
        // Store firstName for OneSignal tag personalization
        if (data.firstName) {
          setFirstName(data.firstName);
          console.log('[OneSignal] Using firstName:', data.firstName);
        }
        
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
  const initNativelySDK = useCallback(async (userDisplayId: string, userFirstName: string | null) => {
    const notifications = getNativelyInstance();
    if (!notifications) {
      console.error('[OneSignal] NativelyNotifications instance not available');
      return;
    }

    console.log('[OneSignal] Initializing Natively native SDK for displayId:', userDisplayId, 'firstName:', userFirstName);

    // Get permission status
    notifications.getPermissionStatus((resp) => {
      console.log('[OneSignal] Natively permission status:', resp);
      setPermissionState(resp.status ? 'granted' : 'default');
      updateInAppTrigger(resp.status);
    });

    // Get OneSignal Player ID
    notifications.getOneSignalId((resp) => {
      console.log('[OneSignal] Natively Player ID response:', resp);
      if (resp.playerId) {
        playerIdRef.current = resp.playerId;
        setPlayerId(resp.playerId);
        registerPlayerId(resp.playerId);
      }
    });

    // Set first_name tag for personalization (used in Liquid syntax: {{ first_name | default: "there" }})
    if (userFirstName && notifications.sendTag) {
      console.log('[OneSignal] Setting first_name tag via Natively:', userFirstName);
      notifications.sendTag({ key: 'first_name', value: userFirstName }, (resp) => {
        if (resp && resp.success) {
          console.log('[OneSignal] ✅ first_name tag set successfully:', userFirstName);
        } else {
          console.log('[OneSignal] first_name tag response:', resp);
        }
      });
    }

    // Set External ID with displayId
    console.log('[OneSignal] Calling Natively setExternalId with:', userDisplayId);
    notifications.setExternalId({ externalId: userDisplayId }, async (resp) => {
      console.log('[OneSignal] Natively setExternalId response:', resp);
      
      if (resp && resp.externalId) {
        console.log('[OneSignal] ✅ External ID set successfully via Natively:', resp.externalId);
        setExternalIdSet(true);
        
        // Save external ID to backend
        // Use playerIdRef.current (sync) instead of playerId state (async) to avoid race condition
        // where setExternalId callback fires before getOneSignalId updates React state
        const currentPlayerId = playerIdRef.current;
        if (currentPlayerId) {
          try {
            const authHeaders = await getAuthHeaders();
            const linkResp = await fetch('/api/notification-preferences/link-external-id', {
              method: 'POST',
              body: JSON.stringify({ 
                oneSignalId: currentPlayerId, 
                userId: userDisplayId 
              }),
              headers: { ...authHeaders, 'Content-Type': 'application/json' },
              credentials: 'include',
            });
            if (linkResp.ok) {
              console.log('[OneSignal] ✅ External ID linked to player ID in backend:', currentPlayerId);
            } else {
              console.warn('[OneSignal] link-external-id failed:', linkResp.status);
            }
          } catch (err) {
            console.error('[OneSignal] Failed to save external ID to backend:', err);
          }
        } else {
          // Player ID not yet available — getOneSignalId callback will register the player ID separately
          console.log('[OneSignal] Player ID not yet available at setExternalId time — registerPlayerId will handle it');
        }
      } else {
        const errorMessage = (resp && resp.error) || (resp && resp.message) || 'Failed to set external ID';
        console.error('[OneSignal] ❌ Natively setExternalId failed:', errorMessage);
      }
    });

    setIsInitialized(true);
    hasInitialized.current = true;
  }, [getNativelyInstance, registerPlayerId, updateInAppTrigger]);

  // Initialize with OneSignal web SDK
  const initWebSDK = useCallback(async (userDisplayId: string, userFirstName: string | null) => {
    if (!window.OneSignalDeferred) {
      console.error('[OneSignal] Web SDK not available');
      return;
    }

    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        console.log('[OneSignal] Initializing web SDK for displayId:', userDisplayId, 'firstName:', userFirstName);
        hasInitialized.current = true;
        setIsInitialized(true);

        // Check permission status
        const permission = OneSignal.Notifications.permission;
        console.log('[OneSignal] Permission:', permission);
        setPermissionState(permission ? 'granted' : 'default');
        updateInAppTrigger(permission);

        // Get the subscription ID (Player ID)
        const subscriptionId = OneSignal.User.PushSubscription.id;
        console.log('[OneSignal] Subscription ID:', subscriptionId);
        
        if (subscriptionId) {
          setPlayerId(subscriptionId);
          await registerPlayerId(subscriptionId);
        }

        // Set first_name tag for personalization (used in Liquid syntax: {{ first_name | default: "there" }})
        if (userFirstName) {
          console.log('[OneSignal] Setting first_name tag via web SDK:', userFirstName);
          OneSignal.User.addTag('first_name', userFirstName);
          console.log('[OneSignal] ✅ first_name tag set successfully:', userFirstName);
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
          updateInAppTrigger(granted);
        });

      } catch (error) {
        console.error('[OneSignal] Initialization error:', error);
      }
    });
  }, [registerPlayerId, updateInAppTrigger]);

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
    const hasNativelySDK = typeof window.NativelyNotifications === 'function';
    console.log('[OneSignal] Init check - isNativeSDK state:', isNativeSDK, 'hasNativelySDK now:', hasNativelySDK);
    
    // Use Natively native SDK if available (check both state and current window object)
    if (hasNativelySDK || isNativeSDK) {
      console.log('[OneSignal] Detected Natively app, using native SDK');
      initNativelySDK(displayId, firstName);
    } else if (window.OneSignalDeferred) {
      console.log('[OneSignal] Using web SDK');
      initWebSDK(displayId, firstName);
    } else {
      console.log('[OneSignal] No SDK available');
    }
  }, [isAuthenticated, user?.id, displayId, firstName, isNativeSDK, initNativelySDK, initWebSDK]);

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
                playerIdRef.current = idResp.playerId;
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

        // Add timeout for native SDK
        const timeout = setTimeout(() => {
          console.log('[OneSignal] removeExternalId timed out, continuing with logout');
          resolve();
        }, 3000);

        notifications.removeExternalId((resp) => {
          clearTimeout(timeout);
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

      // Add timeout to ensure logout proceeds even if OneSignal doesn't respond
      // This can happen when OneSignal init fails (e.g., on non-production domains)
      const timeout = setTimeout(() => {
        console.log('[OneSignal] removeExternalId timed out, continuing with logout');
        resolve();
      }, 3000);

      window.OneSignalDeferred.push(async (OneSignal) => {
        try {
          await OneSignal.logout();
          console.log('[OneSignal] Logged out');
          setExternalIdSet(false);
        } catch (error) {
          console.error('[OneSignal] Logout error:', error);
        }
        clearTimeout(timeout);
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
