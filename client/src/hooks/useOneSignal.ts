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

  // Reset login flag when displayId changes (allows re-login on user switch)
  useEffect(() => {
    if (displayId) {
      console.log('[OneSignal] displayId changed to:', displayId, '- resetting login flag');
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

  // Enable push preferences after successful login
  const enablePushPreferences = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      
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
      console.log('[OneSignal] Push preferences enabled');
    } catch (error) {
      console.error('[OneSignal] Failed to enable push preferences:', error);
    }
  }, []);

  // SIMPLIFIED: Just call login() with External ID - let OneSignal handle the rest
  const performLogin = useCallback(async (
    userId: string, 
    notifications: NativelyNotificationsInstance | null
  ) => {
    if (hasCalledLoginRef.current) {
      console.log('[OneSignal] Login already called for this session, skipping');
      return;
    }

    console.log('[OneSignal] === PERFORMING LOGIN ===');
    console.log('[OneSignal] External ID (displayId):', userId);
    console.log('[OneSignal] Has notifications object:', !!notifications);
    console.log('[OneSignal] Has notifications.login:', !!notifications?.login);
    console.log('[OneSignal] Has notifications.setExternalId:', !!notifications?.setExternalId);
    console.log('[OneSignal] Has window.OneSignal.login:', !!window.OneSignal?.login);

    hasCalledLoginRef.current = true;

    // PRIORITY 1: Try Native SDK methods first (if native app)
    if (notifications?.login) {
      try {
        console.log('[OneSignal Native] ✓ Method available: NativelyNotifications.login()');
        console.log('[OneSignal Native] Calling NativelyNotifications.login()...');
        notifications.login(userId);
        console.log('[OneSignal Native] ✓ NativelyNotifications.login() called for:', userId);
        console.log('[OneSignal Native] ✓ Marking External ID as set');
        setExternalIdSet(true);
        await enablePushPreferences();
        console.log('[OneSignal Native] ✓ Push preferences enabled');
        return;
      } catch (err) {
        console.error('[OneSignal Native] ✗ NativelyNotifications.login() failed:', err);
        console.error('[OneSignal Native] Error details:', JSON.stringify(err));
        // Don't return, try fallback methods
      }
    } else {
      console.log('[OneSignal Native] ⚠️ NativelyNotifications.login() not available, trying fallback...');
    }
    
    // PRIORITY 2: Try setExternalId for native SDK (if login not available)
    if (notifications?.setExternalId) {
      console.log('[OneSignal Native] ✓ Method available: setExternalId()');
      console.log('[OneSignal Native] Calling setExternalId() as native fallback...');
      notifications.setExternalId({ externalId: userId }, async (resp) => {
        console.log('[OneSignal Native] setExternalId callback fired');
        console.log('[OneSignal Native] Response:', JSON.stringify(resp));
        
        if (resp && resp.externalId) {
          console.log('[OneSignal Native] ✓ setExternalId() SUCCESS:', resp.externalId);
          setExternalIdSet(true);
          await enablePushPreferences();
        } else if (resp && !resp.error) {
          // No error and no externalId returned = probably success
          console.log('[OneSignal Native] ✓ setExternalId completed (no error returned)');
          setExternalIdSet(true);
          await enablePushPreferences();
        } else {
          console.error('[OneSignal Native] ✗ setExternalId() failed');
          console.error('[OneSignal Native] Response details:', JSON.stringify(resp));
        }
      });
      console.log('[OneSignal Native] ✓ setExternalId() called (waiting for callback)');
      return; // Return after calling callback-based method
    } else {
      console.log('[OneSignal Native] ⚠️ setExternalId() not available either');
    }

    // PRIORITY 3: Use window.OneSignal.login() for Web SDK (and BuildNatively native)
    if (window.OneSignal?.login) {
      try {
        console.log('[OneSignal Web] Calling window.OneSignal.login()...');
        await window.OneSignal.login(userId);
        console.log('[OneSignal Web] ✓ OneSignal.login() SUCCESS for:', userId);
        setExternalIdSet(true);
        await enablePushPreferences();
        return;
      } catch (err: any) {
        // Only reset flag and try fallback if it's a real failure (not "already logged in")
        const errorMsg = String(err?.message || err);
        if (errorMsg.toLowerCase().includes('already') || errorMsg.toLowerCase().includes('logged in')) {
          console.log('[OneSignal Web] Already logged in, marking as success');
          setExternalIdSet(true);
          await enablePushPreferences();
          return;
        }
        
        console.error('[OneSignal Web] ✗ OneSignal.login() failed:', err);
        hasCalledLoginRef.current = false; // Allow retry
      }
    }
    
    console.error('[OneSignal] ❌ No login methods available!');
  }, [enablePushPreferences]);

  // Grant consent - must be called BEFORE login
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

  // Main initialization effect for BOTH Web and Native apps
  // BuildNatively uses window.OneSignal (same as web), not window.NativelyNotifications
  useEffect(() => {
    if (!isAuthenticated || !user?.id || !displayId) {
      console.log('[OneSignal] Skipping init - auth:', isAuthenticated, 'user:', !!user?.id, 'displayId:', displayId);
      return;
    }
    
    console.log('[OneSignal] Starting initialization for both web and native...');
    console.log('[OneSignal] Document ready state:', document.readyState);
    
    // Both web and native use window.OneSignal
    // Just initialize the Web SDK path - it works for both!
    const performInit = async () => {
      console.log('[OneSignal] Initializing via window.OneSignal (works for web and native)');
      initializeWebPush();
    };
    
    // Wait for document to be fully loaded
    if (document.readyState !== 'complete') {
      console.log('[OneSignal] Document not ready yet, waiting...');
      const handleLoad = () => {
        console.log('[OneSignal] Document loaded, initializing...');
        setTimeout(performInit, 1000);
      };
      window.addEventListener('load', handleLoad);
      return () => window.removeEventListener('load', handleLoad);
    }
    
    // Document ready, initialize now
    performInit();

    return () => {
      // Cleanup if needed
    };
  }, [isAuthenticated, user?.id, displayId]);

  // Web Push SDK initialization (works for BOTH web and native with BuildNatively)
  const initializeWebPush = useCallback(async () => {
    if (webInitializedRef.current) {
      console.log('[OneSignal] Already initialized');
      return;
    }

    const appId = import.meta.env.VITE_ONESIGNAL_APP_ID;
    if (!appId) {
      console.error('[OneSignal] No VITE_ONESIGNAL_APP_ID');
      return;
    }

    console.log('[OneSignal] Initializing...');

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
        console.error('[OneSignal] SDK not available');
        return;
      }

      // Step 1: Initialize SDK
      try {
        await OneSignal.init({
          appId: appId,
          allowLocalhostAsSecureOrigin: true,
        });
        console.log('[OneSignal] SDK initialized');
      } catch (initError: unknown) {
        if (initError instanceof Error && initError.message.includes('already initialized')) {
          console.log('[OneSignal] SDK was already initialized');
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
      console.log('[OneSignal] Permission:', hasPermission ? 'granted' : 'default');

      // Listen for permission changes
      OneSignal.Notifications.addEventListener('permissionChange', async (permission: boolean) => {
        setPermissionState(permission ? 'granted' : 'denied');
        console.log('[OneSignal] Permission changed to:', permission ? 'granted' : 'denied');
        
        // When permission is granted, enable push preferences
        if (permission && displayId) {
          const subId = OneSignal.User.PushSubscription.id;
          if (subId) {
            console.log('[OneSignal] Permission granted, subscription ID:', subId);
            setPlayerId(subId); // For display purposes only
            
            // Enable push notifications in our app settings
            await enablePushPreferences();
          }
        }
      });

      // Listen for subscription ID changes (for display purposes only)
      OneSignal.User.PushSubscription.addEventListener('change', (change: { current: { id?: string } }) => {
        const newSubId = change.current.id;
        if (newSubId) {
          console.log('[OneSignal] Subscription ID changed to:', newSubId);
          setPlayerId(newSubId); // For display purposes only - not stored in database
        }
      });

      // IMPORTANT: Call login() immediately after consent, even before permission is granted
      // In OneSignal v5+, login() links the External ID (displayId) to the user
      // When user grants permission later, the subscription will be automatically linked
      // We DON'T store the OneSignal Player ID - OneSignal manages the External ID → Player ID mapping
      if (displayId) {
        console.log('[OneSignal] Calling login with External ID (displayId):', displayId);
        await performLogin(displayId, null);
      }

    } catch (error) {
      console.error('[OneSignal] Init error:', error);
    }
  }, [displayId, grantConsent, performLogin, enablePushPreferences]);

  const requestPermission = useCallback(async () => {
    // Native app path
    const notifications = notificationsRef.current;
    if (notifications) {
      return new Promise<boolean>((resolve) => {
        notifications.requestPermission(true, (resp) => {
          const granted = resp.status;
          setPermissionState(granted ? 'granted' : 'denied');
          console.log('[OneSignal Native] Permission request result:', granted);
          
          if (granted) {
            // Get Player ID for display purposes only
            notifications.getOneSignalId((idResp) => {
              if (idResp.playerId) {
                console.log('[OneSignal Native] Player ID (for display only):', idResp.playerId);
                setPlayerId(idResp.playerId);
              }
            });
            // Enable push preferences in our app
            enablePushPreferences();
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
        console.log('[OneSignal] Permission request result:', granted);
        
        if (granted) {
          // Get Player ID for display purposes only
          const subId = webSdkRef.current.User.PushSubscription.id;
          if (subId) {
            console.log('[OneSignal] Player ID (for display only):', subId);
            setPlayerId(subId);
          }
          // Enable push preferences in our app
          await enablePushPreferences();
        }
        
        return granted;
      } catch (error) {
        console.error('[OneSignal] Permission request failed:', error);
        return false;
      }
    }

    return false;
  }, [enablePushPreferences]);

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

  // Logout function: Properly clear OneSignal data for next user
  const logoutOneSignal = useCallback(async () => {
    console.log('[OneSignal] === LOGOUT - Clearing OneSignal data ===');
    
    try {
      // Step 1: Call OneSignal Web SDK logout (if available)
      if (webSdkRef.current?.logout) {
        console.log('[OneSignal] Calling OneSignal.logout()...');
        try {
          await webSdkRef.current.logout();
          console.log('[OneSignal] ✓ Web SDK logout complete');
        } catch (err) {
          console.warn('[OneSignal] Web SDK logout warning:', err);
        }
      }
      
      // Step 2: Call Native SDK removeExternalId (if available)
      if (notificationsRef.current?.removeExternalId) {
        console.log('[OneSignal] Calling removeExternalId()...');
        await new Promise<void>((resolve) => {
          notificationsRef.current!.removeExternalId((resp) => {
            if (resp?.error) {
              console.warn('[OneSignal] removeExternalId warning:', resp.error);
            } else {
              console.log('[OneSignal] ✓ External ID removed');
            }
            resolve();
          });
        });
      }
      
      // Step 3: Clear OneSignal-specific localStorage keys
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.toLowerCase().includes('onesignal')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => {
        console.log('[OneSignal] Removing localStorage key:', key);
        localStorage.removeItem(key);
      });
      
      // Step 4: Call backend to clear database OneSignal columns
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        try {
          await fetch('/api/notification-preferences/clear-onesignal', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
          });
          console.log('[OneSignal] ✓ Database OneSignal columns cleared');
        } catch (err) {
          console.warn('[OneSignal] Failed to clear database:', err);
        }
      }
    } catch (error) {
      console.error('[OneSignal] Error during logout:', error);
    }
    
    // Step 5: Reset all local state
    hasCalledLoginRef.current = false;
    consentGrantedRef.current = false;
    webInitializedRef.current = false;
    setExternalIdSet(false);
    setPlayerId(null);
    setDisplayId(null);
    setIsInitialized(false);
    notificationsRef.current = null;
    webSdkRef.current = null;
    
    console.log('[OneSignal] === LOGOUT COMPLETE ===');
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
