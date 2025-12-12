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
        // Web initialization
        console.log('[OneSignal] Initializing for web');
        
        // Wait for OneSignal to load
        if (window.OneSignalDeferred) {
          window.OneSignal = await window.OneSignalDeferred;
        }

        if (!window.OneSignal) {
          throw new Error('OneSignal SDK not loaded');
        }

        await window.OneSignal.init({
          appId: options.appId,
          allowLocalhostAsSecureOrigin: true,
          notificationClickHandlerMatch: 'origin',
          notificationClickHandlerAction: 'focus',
        });

        // Prompt for notification permission
        await window.OneSignal.Slidedown.promptPush();
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
        // Web login
        await window.OneSignal.login(displayId);
      }

      // Get Player ID and Subscription ID
      let playerId: string | null = null;
      let subscriptionId: string | null = null;

      if (isNativeApp && (window as any).NativelyNotifications) {
        const userId = await (window as any).NativelyNotifications.getUserId();
        playerId = userId;
        subscriptionId = userId; // In native, they're often the same
      } else {
        const user = await window.OneSignal.User.getUser();
        playerId = user?.onesignalId || null;
        
        const pushSubscription = await window.OneSignal.User.PushSubscription.getSubscription();
        subscriptionId = pushSubscription?.id || null;
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
        await window.OneSignal.logout();
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
