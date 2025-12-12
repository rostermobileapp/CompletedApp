import { useEffect, useRef, useState } from 'react';
import { useAuth } from './useAuth';

// Type declarations for OneSignal SDK
declare global {
  interface Window {
    OneSignal: any;
    OneSignalDeferred?: Promise<any>;
  }
}

interface UseOneSignalOptions {
  appId: string;
  enabled?: boolean;
}

interface OneSignalState {
  initialized: boolean;
  playerId: string | null;
  subscriptionId: string | null;
  externalIdLinked: boolean;
  error: string | null;
}

/**
 * Custom React hook for OneSignal push notifications
 * 
 * Features:
 * - Automatic initialization on mount
 * - External ID linking with user's displayId
 * - Proper cleanup on unmount
 * - Browser and native app support
 */
export function useOneSignal(options: UseOneSignalOptions) {
  const { user, isAuthenticated } = useAuth();
  const [state, setState] = useState<OneSignalState>({
    initialized: false,
    playerId: null,
    subscriptionId: null,
    externalIdLinked: false,
    error: null,
  });

  const initAttempted = useRef(false);
  const loginAttempted = useRef(false);

  /**
   * Initialize OneSignal SDK
   */
  const initializeOneSignal = async () => {
    if (initAttempted.current || !options.enabled) return;
    initAttempted.current = true;

    try {
      console.log('[OneSignal] Initializing...');

      // Check if running in native app (BuildNatively)
      const isNativeApp = !!window.navigator.userAgent.match(/BuildNatively/i);

      if (isNativeApp && (window as any).NativelyNotifications) {
        // Native app initialization
        console.log('[OneSignal] Initializing for native app');
        await (window as any).NativelyNotifications.initialize({
          appId: options.appId,
        });
      } else {
        // Web initialization (v16 SDK uses push-based API)
        console.log('[OneSignal] Initializing for web');
        
        // Initialize OneSignal array if not exists
        window.OneSignal = window.OneSignal || [];
        
        // Use push-based initialization (v16 pattern)
        window.OneSignal.push(function() {
          window.OneSignal.init({
            appId: options.appId,
            allowLocalhostAsSecureOrigin: true,
            // Don't auto-prompt - we'll request permission later if needed
            promptOptions: {
              autoPrompt: false,
            },
          });
        });

        // Wait a moment for initialization to complete
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check if permission is already granted
        const permission = await window.OneSignal.Notifications.permission;
        console.log('[OneSignal] Current permission:', permission);
        
        if (permission === 'default') {
          console.log('[OneSignal] Skipping auto-prompt. User can enable notifications later.');
        }
      }

      setState(prev => ({ ...prev, initialized: true }));
      console.log('[OneSignal] Initialized successfully');

    } catch (error) {
      console.error('[OneSignal] Initialization failed:', error);
      setState(prev => ({ 
        ...prev, 
        error: error instanceof Error ? error.message : 'Initialization failed',
        initialized: false
      }));
    }
  };

  /**
   * Link External ID after OneSignal is initialized and user is authenticated
   */
  const linkExternalId = async () => {
    if (!state.initialized || !isAuthenticated || loginAttempted.current) {
      return;
    }

    try {
      // Fetch user profile to get displayId
      const response = await fetch('/api/user', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user profile');
      }

      const userData = await response.json();
      const displayId = userData.displayId;

      if (!displayId) {
        console.warn('[OneSignal] User has no displayId, skipping External ID linking');
        return;
      }

      console.log('[OneSignal] Linking External ID:', displayId);
      loginAttempted.current = true;

      // Check if running in native app
      const isNativeApp = !!window.navigator.userAgent.match(/BuildNatively/i);

      if (isNativeApp && (window as any).NativelyNotifications) {
        // Native app login
        await (window as any).NativelyNotifications.login(displayId);
      } else {
        // Web login (v16 SDK push-based API)
        await new Promise<void>((resolve) => {
          window.OneSignal.push(function() {
            window.OneSignal.login(displayId);
            resolve();
          });
        });
      }

      // Get Player ID and Subscription ID
      let playerId: string | null = null;
      let subscriptionId: string | null = null;

      if (isNativeApp && (window as any).NativelyNotifications) {
        const userId = await (window as any).NativelyNotifications.getUserId();
        playerId = userId;
        subscriptionId = userId; // In native, they're often the same
      } else {
        // OneSignal v16 API - get user ID
        await new Promise<void>((resolve) => {
          window.OneSignal.push(function() {
            const user = window.OneSignal.User;
            playerId = user?.onesignalId || null;
            
            // Get push subscription
            const pushSub = window.OneSignal.User?.PushSubscription;
            subscriptionId = pushSub?.id || pushSub?.token || null;
            
            resolve();
          });
        });
      }

      console.log('[OneSignal] Player ID:', playerId);
      console.log('[OneSignal] Subscription ID:', subscriptionId);

      // Save to backend database
      if (playerId) {
        await fetch('/api/notification-preferences/player-id', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            onesignalPlayerId: playerId,
            onesignalSubscriptionId: subscriptionId,
            externalId: displayId,
          }),
        });
      }

      setState(prev => ({
        ...prev,
        playerId,
        subscriptionId,
        externalIdLinked: true,
        error: null,
      }));

      console.log('[OneSignal] External ID linked successfully');

    } catch (error) {
      console.error('[OneSignal] External ID linking failed:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'External ID linking failed',
        externalIdLinked: false,
      }));
      
      // Reset so we can retry
      loginAttempted.current = false;
    }
  };

  /**
   * Logout from OneSignal (clear External ID)
   */
  const logout = async () => {
    try {
      const isNativeApp = !!window.navigator.userAgent.match(/BuildNatively/i);

      if (isNativeApp && (window as any).NativelyNotifications) {
        await (window as any).NativelyNotifications.logout();
      } else {
        // OneSignal v16 logout (push-based API)
        await new Promise<void>((resolve) => {
          if (window.OneSignal && Array.isArray(window.OneSignal)) {
            window.OneSignal.push(function() {
              if (window.OneSignal.logout) {
                window.OneSignal.logout();
              }
              resolve();
            });
          } else {
            resolve();
          }
        });
      }

      loginAttempted.current = false;
      setState(prev => ({
        ...prev,
        playerId: null,
        subscriptionId: null,
        externalIdLinked: false,
      }));

      console.log('[OneSignal] Logged out successfully');
    } catch (error) {
      console.error('[OneSignal] Logout failed:', error);
    }
  };

  /**
   * Initialize on mount
   */
  useEffect(() => {
    if (options.enabled) {
      initializeOneSignal();
    }
  }, [options.enabled]);

  /**
   * Link External ID when initialized and authenticated
   */
  useEffect(() => {
    if (state.initialized && isAuthenticated && !loginAttempted.current) {
      linkExternalId();
    }
  }, [state.initialized, isAuthenticated]);

  /**
   * Logout when user logs out
   */
  useEffect(() => {
    if (!isAuthenticated && state.externalIdLinked) {
      logout();
    }
  }, [isAuthenticated]);

  return {
    ...state,
    logout,
    refresh: linkExternalId,
  };
}
