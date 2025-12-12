/**
 * useOneSignal Hook
 * 
 * Manages OneSignal push notification initialization, Player ID registration,
 * and External ID linking for both web and native (BuildNatively) platforms.
 * 
 * Key Features:
 * - Automatic initialization on mount
 * - External ID (displayId) linking after login
 * - Proper cleanup/logout handling
 * - Support for both web SDK and BuildNatively wrapper
 * - Retry mechanisms for reliability
 * - Stale ID prevention
 * 
 * Usage:
 * ```tsx
 * const { isInitialized, isLinked, playerId, error, linkExternalId, cleanup } = useOneSignal();
 * ```
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './useAuth';

// OneSignal App ID from environment or hardcoded (set in index.html for web SDK)
const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID || '';

// Storage keys for tracking state
const STORAGE_KEYS = {
  PLAYER_ID: 'onesignal_player_id',
  SUBSCRIPTION_ID: 'onesignal_subscription_id',
  LINKED_USER_ID: 'onesignal_linked_user_id',
  LAST_LINKED_AT: 'onesignal_last_linked_at',
};

// API configuration
const API_BASE = '/api';

// Types for OneSignal Web SDK
declare global {
  interface Window {
    OneSignal?: OneSignalWebSDK;
    // BuildNatively wrapper types
    NativelyNotifications?: NativelyNotificationsSDK;
    Natively?: {
      isNativeApp: boolean;
    };
  }
}

interface OneSignalWebSDK {
  init(options: OneSignalInitOptions): Promise<void>;
  login(externalId: string): Promise<void>;
  logout(): Promise<void>;
  User: {
    PushSubscription: {
      id: string | null | undefined;
      token: string | null | undefined;
      optedIn: boolean;
      addEventListener(event: string, callback: (change: any) => void): void;
      removeEventListener(event: string, callback: (change: any) => void): void;
    };
    addAlias(label: string, id: string): void;
    removeAlias(label: string): void;
    addTag(key: string, value: string): void;
  };
  Notifications: {
    permission: boolean;
    requestPermission(): Promise<boolean>;
    addEventListener(event: string, callback: (event: any) => void): void;
    removeEventListener(event: string, callback: (event: any) => void): void;
  };
  Debug: {
    setLogLevel(level: string): void;
  };
}

interface OneSignalInitOptions {
  appId: string;
  allowLocalhostAsSecureOrigin?: boolean;
  serviceWorkerPath?: string;
  serviceWorkerUpdaterPath?: string;
  notifyButton?: {
    enable: boolean;
  };
}

interface NativelyNotificationsSDK {
  login(externalId: string): Promise<{ success: boolean; error?: string }>;
  logout(): Promise<{ success: boolean; error?: string }>;
  getSubscriptionId(): Promise<string | null>;
  setExternalId(externalId: string): Promise<{ success: boolean; error?: string }>;
  requestPermission(): Promise<boolean>;
  isPermissionGranted(): Promise<boolean>;
}

interface OneSignalState {
  isInitialized: boolean;
  isLinked: boolean;
  playerId: string | null;
  subscriptionId: string | null;
  permission: boolean;
  error: string | null;
  isNative: boolean;
  isLoading: boolean;
}

interface UseOneSignalReturn extends OneSignalState {
  linkExternalId: () => Promise<boolean>;
  unlinkExternalId: () => Promise<boolean>;
  cleanup: () => Promise<void>;
  requestPermission: () => Promise<boolean>;
  refreshState: () => Promise<void>;
}

// Helper to get auth token for API calls
async function getAuthToken(): Promise<string | null> {
  // Get the Supabase session token
  const { supabase } = await import('@/lib/supabase');
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

// API helper with authentication
async function apiCall<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: Record<string, unknown>
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const token = await getAuthToken();
    if (!token) {
      return { success: false, error: 'Not authenticated' };
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.message || 'API call failed' };
    }

    return { success: true, data };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

// Detect if running in BuildNatively native wrapper
function isNativeApp(): boolean {
  return window.Natively?.isNativeApp === true || !!window.NativelyNotifications;
}

export function useOneSignal(): UseOneSignalReturn {
  const { user, isAuthenticated } = useAuth();
  
  const [state, setState] = useState<OneSignalState>({
    isInitialized: false,
    isLinked: false,
    playerId: null,
    subscriptionId: null,
    permission: false,
    error: null,
    isNative: false,
    isLoading: true,
  });

  // Refs to prevent race conditions
  const initializingRef = useRef(false);
  const linkingRef = useRef(false);
  const hasCalledLoginRef = useRef(false);
  const mountedRef = useRef(true);

  // Update state safely
  const updateState = useCallback((updates: Partial<OneSignalState>) => {
    if (mountedRef.current) {
      setState(prev => ({ ...prev, ...updates }));
    }
  }, []);

  // Initialize OneSignal Web SDK
  const initializeWebSDK = useCallback(async (): Promise<void> => {
    if (!window.OneSignal) {
      console.warn('OneSignal Web SDK not loaded');
      updateState({ error: 'OneSignal SDK not loaded', isLoading: false });
      return;
    }

    try {
      console.log('🔔 Initializing OneSignal Web SDK...');

      await window.OneSignal.init({
        appId: ONESIGNAL_APP_ID,
        allowLocalhostAsSecureOrigin: true,
        notifyButton: {
          enable: false, // We use our own UI
        },
      });

      // Get current subscription state
      const subscriptionId = window.OneSignal.User.PushSubscription.id || null;
      const permission = window.OneSignal.Notifications.permission;

      console.log(`✅ OneSignal Web SDK initialized`);
      console.log(`   Subscription ID: ${subscriptionId || 'None'}`);
      console.log(`   Permission: ${permission ? 'Granted' : 'Not granted'}`);

      // Store subscription ID locally
      if (subscriptionId) {
        localStorage.setItem(STORAGE_KEYS.SUBSCRIPTION_ID, subscriptionId);
      }

      updateState({
        isInitialized: true,
        playerId: subscriptionId,
        subscriptionId,
        permission,
        isLoading: false,
        isNative: false,
      });

      // Subscribe to subscription changes
      window.OneSignal.User.PushSubscription.addEventListener('change', (change: any) => {
        console.log('🔔 OneSignal subscription changed:', change);
        if (change.current?.id) {
          localStorage.setItem(STORAGE_KEYS.SUBSCRIPTION_ID, change.current.id);
          updateState({ 
            playerId: change.current.id,
            subscriptionId: change.current.id,
          });
        }
      });

    } catch (error) {
      console.error('❌ Failed to initialize OneSignal:', error);
      updateState({ 
        error: error instanceof Error ? error.message : 'Initialization failed',
        isLoading: false,
      });
    }
  }, [updateState]);

  // Initialize Native SDK (BuildNatively)
  const initializeNativeSDK = useCallback(async (): Promise<void> => {
    if (!window.NativelyNotifications) {
      console.warn('NativelyNotifications SDK not available');
      updateState({ error: 'Native SDK not loaded', isLoading: false });
      return;
    }

    try {
      console.log('📱 Initializing OneSignal Native SDK (BuildNatively)...');

      // Get current subscription ID
      const subscriptionId = await window.NativelyNotifications.getSubscriptionId();
      const permission = await window.NativelyNotifications.isPermissionGranted();

      console.log(`✅ OneSignal Native SDK ready`);
      console.log(`   Subscription ID: ${subscriptionId || 'None'}`);
      console.log(`   Permission: ${permission ? 'Granted' : 'Not granted'}`);

      if (subscriptionId) {
        localStorage.setItem(STORAGE_KEYS.SUBSCRIPTION_ID, subscriptionId);
      }

      updateState({
        isInitialized: true,
        playerId: subscriptionId,
        subscriptionId,
        permission,
        isLoading: false,
        isNative: true,
      });

    } catch (error) {
      console.error('❌ Failed to initialize Native SDK:', error);
      updateState({ 
        error: error instanceof Error ? error.message : 'Native initialization failed',
        isLoading: false,
      });
    }
  }, [updateState]);

  // Register Player ID with backend
  const registerPlayerIdWithBackend = useCallback(async (playerId: string): Promise<boolean> => {
    console.log(`📝 Registering Player ID with backend: ${playerId}`);

    const platform = state.isNative 
      ? (navigator.userAgent.includes('iPhone') ? 'ios' : 'android')
      : 'web';

    const result = await apiCall('/notification-preferences/player-id', 'POST', {
      playerId,
      subscriptionId: state.subscriptionId || playerId,
      platform,
      deviceModel: navigator.userAgent.substring(0, 100),
      osVersion: navigator.platform,
      appVersion: '1.0.0',
    });

    if (!result.success) {
      console.error('❌ Failed to register Player ID:', result.error);
      return false;
    }

    console.log('✅ Player ID registered with backend');
    return true;
  }, [state.isNative, state.subscriptionId]);

  // Link External ID (displayId) with OneSignal
  const linkExternalId = useCallback(async (): Promise<boolean> => {
    // Prevent concurrent linking attempts
    if (linkingRef.current) {
      console.log('⏳ External ID linking already in progress...');
      return false;
    }

    linkingRef.current = true;

    try {
      const playerId = state.playerId || state.subscriptionId;
      
      if (!playerId) {
        console.error('❌ Cannot link: No Player ID available');
        updateState({ error: 'No Player ID available' });
        return false;
      }

      if (!isAuthenticated) {
        console.error('❌ Cannot link: User not authenticated');
        updateState({ error: 'User not authenticated' });
        return false;
      }

      console.log(`🔗 Linking External ID for Player ID: ${playerId}`);

      // First, register the Player ID if not already done
      await registerPlayerIdWithBackend(playerId);

      // Call backend API to link external ID via OneSignal REST API
      const result = await apiCall('/notification-preferences/link-external-id', 'POST', {
        playerId,
      });

      if (!result.success) {
        console.error('❌ Backend External ID linking failed:', result.error);
        updateState({ error: result.error || 'Failed to link external ID' });
        
        // Try using the SDK directly as fallback (for web)
        if (!state.isNative && window.OneSignal) {
          try {
            console.log('🔄 Trying SDK login as fallback...');
            // Get user's displayId from API
            const userResult = await apiCall<{ displayId: string }>('/user', 'GET');
            if (userResult.success && userResult.data?.displayId) {
              await window.OneSignal.login(userResult.data.displayId);
              console.log('✅ SDK login succeeded');
              hasCalledLoginRef.current = true;
              updateState({ isLinked: true, error: null });
              localStorage.setItem(STORAGE_KEYS.LINKED_USER_ID, userResult.data.displayId);
              localStorage.setItem(STORAGE_KEYS.LAST_LINKED_AT, new Date().toISOString());
              return true;
            }
          } catch (sdkError) {
            console.error('❌ SDK login fallback failed:', sdkError);
          }
        }
        
        return false;
      }

      console.log('✅ External ID linked successfully via backend');
      hasCalledLoginRef.current = true;
      updateState({ isLinked: true, error: null });

      // Store linked state
      const externalId = (result.data as any)?.externalId;
      if (externalId) {
        localStorage.setItem(STORAGE_KEYS.LINKED_USER_ID, externalId);
      }
      localStorage.setItem(STORAGE_KEYS.LAST_LINKED_AT, new Date().toISOString());

      return true;

    } catch (error) {
      console.error('❌ Error linking External ID:', error);
      updateState({ error: error instanceof Error ? error.message : 'Linking failed' });
      return false;
    } finally {
      linkingRef.current = false;
    }
  }, [state.playerId, state.subscriptionId, state.isNative, isAuthenticated, registerPlayerIdWithBackend, updateState]);

  // Unlink External ID (for logout)
  const unlinkExternalId = useCallback(async (): Promise<boolean> => {
    try {
      const playerId = state.playerId || state.subscriptionId;
      
      if (!playerId) {
        console.log('ℹ️ No Player ID to unlink');
        return true;
      }

      console.log(`🔓 Unlinking External ID for Player ID: ${playerId}`);

      // Try SDK logout first (for web)
      if (!state.isNative && window.OneSignal) {
        try {
          await window.OneSignal.logout();
          console.log('✅ OneSignal SDK logout successful');
        } catch (sdkError) {
          console.warn('⚠️ SDK logout failed (continuing):', sdkError);
        }
      }

      // Try native logout
      if (state.isNative && window.NativelyNotifications) {
        try {
          await window.NativelyNotifications.logout();
          console.log('✅ Native SDK logout successful');
        } catch (nativeError) {
          console.warn('⚠️ Native logout failed (continuing):', nativeError);
        }
      }

      // Call backend API to unlink
      const result = await apiCall('/notification-preferences/unlink-external-id', 'POST', {
        playerId,
      });

      if (!result.success) {
        console.warn('⚠️ Backend unlink failed (may be expected if not linked):', result.error);
      }

      // Clear local storage
      localStorage.removeItem(STORAGE_KEYS.LINKED_USER_ID);
      localStorage.removeItem(STORAGE_KEYS.LAST_LINKED_AT);
      
      hasCalledLoginRef.current = false;
      updateState({ isLinked: false });

      return true;

    } catch (error) {
      console.error('❌ Error unlinking External ID:', error);
      return false;
    }
  }, [state.playerId, state.subscriptionId, state.isNative, updateState]);

  // Complete cleanup (for debugging/reset)
  const cleanup = useCallback(async (): Promise<void> => {
    console.log('🧹 Starting complete OneSignal cleanup...');

    try {
      // Unlink first
      await unlinkExternalId();

      // Call backend cleanup
      await apiCall('/notification-preferences/cleanup', 'DELETE');

      // Clear all local storage
      Object.values(STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
      });

      // Reset state
      updateState({
        isLinked: false,
        playerId: null,
        subscriptionId: null,
        error: null,
      });

      console.log('✅ Complete cleanup finished');

    } catch (error) {
      console.error('❌ Cleanup error:', error);
      updateState({ error: error instanceof Error ? error.message : 'Cleanup failed' });
    }
  }, [unlinkExternalId, updateState]);

  // Request notification permission
  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      let granted = false;

      if (state.isNative && window.NativelyNotifications) {
        granted = await window.NativelyNotifications.requestPermission();
      } else if (window.OneSignal) {
        granted = await window.OneSignal.Notifications.requestPermission();
      }

      updateState({ permission: granted });
      return granted;

    } catch (error) {
      console.error('❌ Error requesting permission:', error);
      return false;
    }
  }, [state.isNative, updateState]);

  // Refresh state from SDK/backend
  const refreshState = useCallback(async (): Promise<void> => {
    try {
      if (state.isNative && window.NativelyNotifications) {
        const subscriptionId = await window.NativelyNotifications.getSubscriptionId();
        const permission = await window.NativelyNotifications.isPermissionGranted();
        updateState({ 
          playerId: subscriptionId, 
          subscriptionId, 
          permission 
        });
      } else if (window.OneSignal) {
        const subscriptionId = window.OneSignal.User.PushSubscription.id || null;
        const permission = window.OneSignal.Notifications.permission;
        updateState({ 
          playerId: subscriptionId, 
          subscriptionId, 
          permission 
        });
      }

      // Verify with backend
      if (isAuthenticated) {
        const result = await apiCall<{ isLinked: boolean }>('/notification-preferences/verify', 'GET');
        if (result.success && result.data) {
          updateState({ isLinked: result.data.isLinked });
        }
      }
    } catch (error) {
      console.error('❌ Error refreshing state:', error);
    }
  }, [state.isNative, isAuthenticated, updateState]);

  // Initialize OneSignal on mount
  useEffect(() => {
    mountedRef.current = true;

    const initialize = async () => {
      if (initializingRef.current) return;
      initializingRef.current = true;

      const native = isNativeApp();
      console.log(`🚀 OneSignal initialization starting (${native ? 'Native' : 'Web'})...`);

      if (native) {
        await initializeNativeSDK();
      } else {
        await initializeWebSDK();
      }

      initializingRef.current = false;
    };

    // Small delay to ensure SDKs are loaded
    const timeout = setTimeout(initialize, 100);

    return () => {
      mountedRef.current = false;
      clearTimeout(timeout);
    };
  }, [initializeWebSDK, initializeNativeSDK]);

  // Auto-link External ID when user is authenticated and SDK is initialized
  useEffect(() => {
    if (!state.isInitialized || !isAuthenticated || !user) return;
    if (state.isLinked || hasCalledLoginRef.current) return;
    if (!state.playerId && !state.subscriptionId) return;

    // Check if already linked for this user
    const linkedUserId = localStorage.getItem(STORAGE_KEYS.LINKED_USER_ID);
    if (linkedUserId && hasCalledLoginRef.current) {
      updateState({ isLinked: true });
      return;
    }

    // Small delay to prevent race conditions
    const timeout = setTimeout(() => {
      console.log('🔄 Auto-linking External ID after authentication...');
      linkExternalId();
    }, 500);

    return () => clearTimeout(timeout);
  }, [state.isInitialized, isAuthenticated, user, state.isLinked, state.playerId, state.subscriptionId, linkExternalId, updateState]);

  // Cleanup on user logout
  useEffect(() => {
    if (!isAuthenticated && hasCalledLoginRef.current) {
      console.log('👋 User logged out, unlinking External ID...');
      unlinkExternalId();
    }
  }, [isAuthenticated, unlinkExternalId]);

  return {
    ...state,
    linkExternalId,
    unlinkExternalId,
    cleanup,
    requestPermission,
    refreshState,
  };
}

export default useOneSignal;
