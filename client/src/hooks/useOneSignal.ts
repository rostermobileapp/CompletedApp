import { useEffect, useCallback, useState, useRef } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/lib/supabase';

interface NativelyNotificationsInstance {
  getOneSignalId: (callback: (resp: { playerId: string | null }) => void) => void;
  getPermissionStatus: (callback: (resp: { status: boolean }) => void) => void;
  requestPermission: (fallbackToSettings: boolean, callback: (resp: { status: boolean }) => void) => void;
  getExternalId: (callback: (resp: Array<{ externalId?: string; error?: string; message?: string }>) => void) => void;
  setExternalId: (params: { externalId: string }, callback: (resp: { externalId?: string; error?: string; message?: string }) => void) => void;
  removeExternalId: (callback: (resp: { error?: string; message?: string } | null) => void) => void;
  login?: (externalId: string) => void;
}

interface OneSignalWebInstance {
  init: (config: { appId: string; allowLocalhostAsSecureOrigin?: boolean }) => Promise<void>;
  login: (externalId: string) => Promise<void>;
  logout: () => Promise<void>;
  setConsentGiven: (consent: boolean) => Promise<void>;
  setConsentRequired: (required: boolean) => Promise<void>;
  Notifications: {
    permission: boolean;
    requestPermission: () => Promise<boolean>;
    addEventListener: (event: string, callback: (permission: boolean) => void) => void;
  };
  User: {
    PushSubscription: {
      id: string | null | undefined;
      addEventListener: (event: string, callback: (change: { current: { id?: string } }) => void) => void;
    };
    addAlias: (label: string, id: string) => void;
  };
}

declare global {
  interface Window {
    NativelyNotifications?: new () => NativelyNotificationsInstance;
    OneSignalDeferred?: ((OneSignal: OneSignalWebInstance) => void)[];
    OneSignal?: OneSignalWebInstance;
  }
}

export function useOneSignal() {
  const { user, isAuthenticated } = useAuth();
  const [isInitialized, setIsInitialized] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [displayId, setDisplayId] = useState<string | null>(null);
  const [externalIdSet, setExternalIdSet] = useState(false);
  const [permissionState, setPermissionState] = useState<string>('default');
  const [isWebPush, setIsWebPush] = useState(false);
  const notificationsRef = useRef<NativelyNotificationsInstance | null>(null);
  const webSdkRef = useRef<OneSignalWebInstance | null>(null);
  const hasCalledLoginRef = useRef(false);
  const webInitializedRef = useRef(false);
  const consentGrantedRef = useRef(false);

  // Reset login flag when displayId changes (Fix #4 from analysis)
  useEffect(() => {
    if (displayId) {
      console.log('[OneSignal] displayId changed, resetting login flag');
      hasCalledLoginRef.current = false;
      setExternalIdSet(false);
    }
  }, [displayId]);

  // Fetch the user's displayId from the backend using Bearer token auth
  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setDisplayId(null);
      return;
    }

    const fetchDisplayId = async (retryCount = 0) => {
      const MAX_RETRIES = 10;
      const RETRY_DELAY_MS = 2000;
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session?.access_token) {
          if (retryCount < MAX_RETRIES) {
            console.log(`[OneSignal] No session yet, retrying in ${RETRY_DELAY_MS}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
            setTimeout(() => fetchDisplayId(retryCount + 1), RETRY_DELAY_MS);
            return;
          }
          console.error('[OneSignal] Failed to get session after max retries');
          return;
        }
        
        const response = await fetch('/api/user', {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        });
        
        if (response.status === 401) {
          if (retryCount < MAX_RETRIES) {
            await supabase.auth.refreshSession();
            setTimeout(() => fetchDisplayId(retryCount + 1), RETRY_DELAY_MS);
            return;
          }
          return;
        }
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        if (data.displayId) {
          console.log('[OneSignal] ✅ Fetched displayId:', data.displayId);
          setDisplayId(data.displayId);
        } else {
          console.error('[OneSignal] ❌ No displayId in user profile');
        }
      } catch (err) {
        console.error('[OneSignal] Error fetching displayId:', err);
        if (retryCount < MAX_RETRIES) {
          setTimeout(() => fetchDisplayId(retryCount + 1), RETRY_DELAY_MS);
        }
      }
    };
    
    fetchDisplayId();
  }, [isAuthenticated, user?.id]);

  // Backend helper to link External ID via REST API
  const linkExternalIdViaBackend = useCallback(async (oneSignalId: string, externalUserId: string) => {
    try {
      console.log('[OneSignal] Calling backend to link External ID');
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      
      const response = await fetch('/api/notification-preferences/link-external-id', {
        method: 'POST',
        body: JSON.stringify({ oneSignalId, userId: externalUserId }),
        headers,
        credentials: 'include',
      });
      if (response.ok) {
        console.log('[OneSignal] Backend linked External ID successfully');
        return true;
      }
      console.warn('[OneSignal] Backend link failed:', response.status);
      return false;
    } catch (error) {
      console.error('[OneSignal] Backend link error:', error);
      return false;
    }
  }, []);

  // Register player ID with backend
  const registerPlayerId = useCallback(async (playerIdToRegister: string, retryCount = 0) => {
    if (!playerIdToRegister) return;
    
    const MAX_RETRIES = 10;
    const RETRY_DELAY_MS = 2000;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        if (retryCount < MAX_RETRIES) {
          setTimeout(() => registerPlayerId(playerIdToRegister, retryCount + 1), RETRY_DELAY_MS);
          return;
        }
        return;
      }
      
      const playerIdResponse = await fetch('/api/notification-preferences/player-id', {
        method: 'POST',
        body: JSON.stringify({ playerId: playerIdToRegister }),
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      
      if (playerIdResponse.status === 401 && retryCount < MAX_RETRIES) {
        await supabase.auth.refreshSession();
        setTimeout(() => registerPlayerId(playerIdToRegister, retryCount + 1), RETRY_DELAY_MS);
        return;
      }
      
      if (playerIdResponse.ok) {
        console.log('[OneSignal] Player ID registered with backend');
        
        // Also enable push preferences
        await fetch('/api/notification-preferences', {
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
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        });
      }
    } catch (error) {
      console.error('[OneSignal] Failed to register player ID:', error);
      if (retryCount < MAX_RETRIES) {
        setTimeout(() => registerPlayerId(playerIdToRegister, retryCount + 1), RETRY_DELAY_MS);
      }
    }
  }, []);

  // SINGLE unified login function (Fix #5 from analysis)
  const performLogin = useCallback(async (
    userId: string, 
    currentPlayerId: string | null,
    notifications: NativelyNotificationsInstance | null
  ) => {
    if (hasCalledLoginRef.current) {
      console.log('[OneSignal] Login already called for this session, skipping');
      return;
    }

    console.log('[OneSignal] === PERFORMING LOGIN ===');
    console.log('[OneSignal] External ID:', userId);
    console.log('[OneSignal] Player ID:', currentPlayerId);

    hasCalledLoginRef.current = true;

    // Method 1: Use window.OneSignal.login() - PRIMARY method
    if (window.OneSignal?.login) {
      try {
        console.log('[OneSignal] Calling window.OneSignal.login()...');
        await window.OneSignal.login(userId);
        console.log('[OneSignal] ✓ OneSignal.login() SUCCESS for:', userId);
        setExternalIdSet(true);
        
        // Also register with backend for redundancy
        if (currentPlayerId) {
          await linkExternalIdViaBackend(currentPlayerId, userId);
        }
        return;
      } catch (err) {
        console.error('[OneSignal] ✗ OneSignal.login() failed:', err);
        // Reset flag to allow retry with fallback
        hasCalledLoginRef.current = false;
      }
    } else {
      console.log('[OneSignal] window.OneSignal.login not available');
    }

    // Method 2: Use NativelyNotifications.login() if available
    if (notifications?.login) {
      try {
        console.log('[OneSignal] Calling NativelyNotifications.login()...');
        notifications.login(userId);
        console.log('[OneSignal] ✓ NativelyNotifications.login() called for:', userId);
        hasCalledLoginRef.current = true;
        setExternalIdSet(true);
        
        if (currentPlayerId) {
          await linkExternalIdViaBackend(currentPlayerId, userId);
        }
        return;
      } catch (err) {
        console.error('[OneSignal] ✗ NativelyNotifications.login() failed:', err);
      }
    }

    // Method 3: Use setExternalId as fallback
    if (notifications) {
      console.log('[OneSignal] Calling setExternalId() as fallback...');
      notifications.setExternalId({ externalId: userId }, async (resp) => {
        if (resp && resp.externalId) {
          console.log('[OneSignal] ✓ setExternalId() SUCCESS:', resp.externalId);
          hasCalledLoginRef.current = true;
          setExternalIdSet(true);
          if (currentPlayerId) {
            await linkExternalIdViaBackend(currentPlayerId, userId);
          }
        } else {
          console.error('[OneSignal] ✗ setExternalId() failed:', resp);
          // Last resort: backend API only
          if (currentPlayerId) {
            const success = await linkExternalIdViaBackend(currentPlayerId, userId);
            if (success) {
              hasCalledLoginRef.current = true;
              setExternalIdSet(true);
            }
          }
        }
      });
    } else if (currentPlayerId) {
      // No SDK methods available, try backend only
      console.log('[OneSignal] No SDK methods, using backend API only');
      const success = await linkExternalIdViaBackend(currentPlayerId, userId);
      if (success) {
        hasCalledLoginRef.current = true;
        setExternalIdSet(true);
      }
    }
  }, [linkExternalIdViaBackend]);

  // Grant consent - must be called BEFORE login (Fix #3 from analysis)
  const grantConsent = useCallback(async () => {
    if (consentGrantedRef.current) {
      console.log('[OneSignal] Consent already granted');
      return true;
    }

    if (window.OneSignal?.setConsentGiven) {
      try {
        console.log('[OneSignal] Granting consent...');
        await window.OneSignal.setConsentGiven(true);
        consentGrantedRef.current = true;
        console.log('[OneSignal] ✓ Consent granted');
        return true;
      } catch (err) {
        console.log('[OneSignal] Consent may already be set:', err);
        consentGrantedRef.current = true;
        return true;
      }
    } else {
      console.log('[OneSignal] setConsentGiven not available (may be native SDK)');
      consentGrantedRef.current = true;
      return true;
    }
  }, []);

  // Main initialization effect for NATIVE apps (BuildNatively)
  useEffect(() => {
    if (!isAuthenticated || !user?.id || !displayId) {
      return;
    }

    const initializeNative = async () => {
      // Check if NativelyNotifications is available
      if (!window.NativelyNotifications) {
        return false;
      }

      try {
        const notifications = new window.NativelyNotifications();
        notificationsRef.current = notifications;
        setIsInitialized(true);
        console.log('[OneSignal Native] SDK initialized for displayId:', displayId);

        // Step 1: Grant consent FIRST (before any user operations)
        await grantConsent();

        // Step 2: Get permission status
        notifications.getPermissionStatus((resp) => {
          const status = resp.status ? 'granted' : 'default';
          setPermissionState(status);
          console.log('[OneSignal Native] Permission status:', status);
        });

        // Step 3: Get OneSignal ID, then login
        const getPlayerIdAndLogin = () => {
          notifications.getOneSignalId(async (resp) => {
            if (resp.playerId) {
              console.log('[OneSignal Native] Got Player ID:', resp.playerId);
              setPlayerId(resp.playerId);
              registerPlayerId(resp.playerId);
              
              // Step 4: Perform login with External ID
              await performLogin(displayId, resp.playerId, notifications);
            } else {
              console.log('[OneSignal Native] No Player ID yet, retrying in 2s...');
              setTimeout(() => {
                notifications.getOneSignalId(async (retryResp) => {
                  if (retryResp.playerId) {
                    console.log('[OneSignal Native] Got Player ID on retry:', retryResp.playerId);
                    setPlayerId(retryResp.playerId);
                    registerPlayerId(retryResp.playerId);
                    await performLogin(displayId, retryResp.playerId, notifications);
                  } else {
                    console.warn('[OneSignal Native] Still no Player ID, attempting login anyway');
                    await performLogin(displayId, null, notifications);
                  }
                });
              }, 2000);
            }
          });
        };

        getPlayerIdAndLogin();
        return true;
      } catch (error) {
        console.error('[OneSignal Native] Failed to initialize:', error);
        return false;
      }
    };

    // Try immediate initialization
    const tryInit = async () => {
      const initialized = await initializeNative();
      
      if (!initialized) {
        // Poll for NativelyNotifications availability
        console.log('[OneSignal] NativelyNotifications not available, polling...');
        let pollCount = 0;
        const maxPolls = 20;
        
        const pollInterval = setInterval(async () => {
          pollCount++;
          
          if (window.NativelyNotifications) {
            clearInterval(pollInterval);
            console.log('[OneSignal] NativelyNotifications became available!');
            await initializeNative();
          } else if (pollCount >= maxPolls) {
            clearInterval(pollInterval);
            console.log('[OneSignal] Falling back to Web Push SDK');
            initializeWebPush();
          }
        }, 500);
      }
    };

    // Web Push SDK initialization (for browsers)
    const initializeWebPush = async () => {
      if (webInitializedRef.current) {
        console.log('[OneSignal Web] Already initialized');
        return;
      }

      const appId = import.meta.env.VITE_ONESIGNAL_APP_ID;
      if (!appId) {
        console.error('[OneSignal Web] No VITE_ONESIGNAL_APP_ID');
        return;
      }

      console.log('[OneSignal Web] Initializing...');

      // Wait for OneSignal to be available
      const waitForOneSignal = async (): Promise<OneSignalWebInstance | null> => {
        if (window.OneSignal && typeof window.OneSignal.init === 'function') {
          return window.OneSignal;
        }
        
        return new Promise((resolve) => {
          let attempts = 0;
          const interval = setInterval(() => {
            attempts++;
            if (window.OneSignal && typeof window.OneSignal.init === 'function') {
              clearInterval(interval);
              resolve(window.OneSignal);
            } else if (attempts >= 20) {
              clearInterval(interval);
              resolve(null);
            }
          }, 200);
        });
      };

      try {
        const OneSignal = await waitForOneSignal();
        if (!OneSignal) {
          console.error('[OneSignal Web] SDK not available');
          return;
        }

        // Step 1: Initialize SDK
        try {
          await OneSignal.init({
            appId: appId,
            allowLocalhostAsSecureOrigin: true,
          });
          console.log('[OneSignal Web] SDK initialized');
        } catch (initError: unknown) {
          if (initError instanceof Error && initError.message.includes('already initialized')) {
            console.log('[OneSignal Web] SDK was already initialized');
          } else {
            throw initError;
          }
        }

        // Step 2: Grant consent IMMEDIATELY after init
        await grantConsent();

        webSdkRef.current = OneSignal;
        webInitializedRef.current = true;
        setIsWebPush(true);
        setIsInitialized(true);

        // Check permission
        const hasPermission = OneSignal.Notifications.permission;
        setPermissionState(hasPermission ? 'granted' : 'default');
        console.log('[OneSignal Web] Permission:', hasPermission ? 'granted' : 'default');

        // Listen for permission changes
        OneSignal.Notifications.addEventListener('permissionChange', async (permission: boolean) => {
          setPermissionState(permission ? 'granted' : 'denied');
          if (permission && displayId) {
            const subId = OneSignal.User.PushSubscription.id;
            if (subId) {
              setPlayerId(subId);
              registerPlayerId(subId);
              // Step 3: Login after permission granted
              await performLogin(displayId, subId, null);
            }
          }
        });

        // If already has permission, login now
        if (hasPermission && displayId) {
          const subId = OneSignal.User.PushSubscription.id;
          if (subId) {
            console.log('[OneSignal Web] Already has permission, logging in...');
            setPlayerId(subId);
            registerPlayerId(subId);
            // Step 3: Login
            await performLogin(displayId, subId, null);
          }
        }

      } catch (error) {
        console.error('[OneSignal Web] Init error:', error);
      }
    };

    tryInit();

    return () => {
      notificationsRef.current = null;
    };
  }, [isAuthenticated, user?.id, displayId, grantConsent, performLogin, registerPlayerId]);

  const requestPermission = useCallback(async () => {
    // Native app path
    const notifications = notificationsRef.current;
    if (notifications) {
      return new Promise<boolean>((resolve) => {
        notifications.requestPermission(true, (resp) => {
          const granted = resp.status;
          setPermissionState(granted ? 'granted' : 'denied');
          console.log('[OneSignal] Permission request result:', granted);
          
          if (granted) {
            notifications.getOneSignalId(async (idResp) => {
              if (idResp.playerId) {
                setPlayerId(idResp.playerId);
                registerPlayerId(idResp.playerId);
                if (displayId) {
                  await performLogin(displayId, idResp.playerId, notifications);
                }
              }
            });
          }
          resolve(granted);
        });
      });
    }

    // Web SDK path
    if (webSdkRef.current) {
      try {
        const granted = await webSdkRef.current.Notifications.requestPermission();
        setPermissionState(granted ? 'granted' : 'denied');
        return granted;
      } catch (error) {
        console.error('[OneSignal Web] Permission request failed:', error);
        return false;
      }
    }

    return false;
  }, [displayId, performLogin, registerPlayerId]);

  const getNotificationPreferences = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      
      const response = await fetch('/api/notification-preferences', {
        headers,
        credentials: 'include',
      });
      if (response.ok) {
        return await response.json();
      }
      return null;
    } catch (error) {
      console.error('[OneSignal] Failed to get preferences:', error);
      return null;
    }
  }, []);

  const updateNotificationPreferences = useCallback(async (preferences: {
    pushEnabled?: boolean;
    emailEnabled?: boolean;
    notificationSettings?: {
      inAppMessages?: boolean;
      paymentRequests?: boolean;
      substitutionRequests?: boolean;
      joinRequests?: boolean;
      upcomingEvents?: boolean;
      newsAnnouncements?: boolean;
    };
  }) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      
      const response = await fetch('/api/notification-preferences', {
        method: 'PUT',
        body: JSON.stringify(preferences),
        headers,
        credentials: 'include',
      });
      return response.ok;
    } catch (error) {
      console.error('[OneSignal] Failed to update preferences:', error);
      return false;
    }
  }, []);

  // CRITICAL: Logout function to clear OneSignal's cached External ID
  // Must be called when user logs out to prevent ID leakage between users
  const logoutOneSignal = useCallback(async () => {
    console.log('[OneSignal] === LOGOUT - Clearing cached IDs ===');
    
    // Reset all local state
    hasCalledLoginRef.current = false;
    consentGrantedRef.current = false;
    setExternalIdSet(false);
    setPlayerId(null);
    setDisplayId(null);
    
    // Method 1: Use window.OneSignal.logout() - PRIMARY method
    if (window.OneSignal?.logout) {
      try {
        console.log('[OneSignal] Calling window.OneSignal.logout()...');
        await window.OneSignal.logout();
        console.log('[OneSignal] ✓ OneSignal.logout() SUCCESS - External ID cleared');
      } catch (err) {
        console.error('[OneSignal] ✗ OneSignal.logout() error:', err);
      }
    }
    
    // Method 2: Use NativelyNotifications.removeExternalId() as backup
    const notifications = notificationsRef.current;
    if (notifications?.removeExternalId) {
      try {
        console.log('[OneSignal] Calling NativelyNotifications.removeExternalId()...');
        notifications.removeExternalId((resp) => {
          if (resp?.error) {
            console.error('[OneSignal] removeExternalId error:', resp.error);
          } else {
            console.log('[OneSignal] ✓ removeExternalId() SUCCESS');
          }
        });
      } catch (err) {
        console.error('[OneSignal] ✗ removeExternalId() error:', err);
      }
    }
    
    console.log('[OneSignal] Logout complete - ready for new user');
  }, []);

  return {
    isInitialized,
    playerId,
    displayId,
    externalIdSet,
    permissionState,
    isWebPush,
    requestPermission,
    getNotificationPreferences,
    updateNotificationPreferences,
    logoutOneSignal,
  };
}
