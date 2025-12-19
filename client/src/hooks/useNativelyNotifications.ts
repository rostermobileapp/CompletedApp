import { useEffect, useCallback, useState, useRef } from 'react';
import { useAuth } from './useAuth';

/**
 * Interface matching BuildNatively's NativelyNotifications JavaScript SDK
 * Reference: https://docs.buildnatively.com/guides/integration/push-notifications-onesignal
 */
interface NativelyNotificationsInstance {
  getOneSignalId: (callback: (resp: { playerId: string | null }) => void) => void;
  getPermissionStatus: (callback: (resp: { status: boolean }) => void) => void;
  requestPermission: (fallbackToSettings: boolean, callback: (resp: { status: boolean }) => void) => void;
  getExternalId: (callback: (resp: Array<{ externalId?: string; error?: string; message?: string }>) => void) => void;
  setExternalId: (params: { externalId: string }, callback: (resp: { externalId?: string; error?: string; message?: string }) => void) => void;
  removeExternalId: (callback: (resp: { error?: string; message?: string } | null) => void) => void;
}

declare global {
  interface Window {
    NativelyNotifications?: new () => NativelyNotificationsInstance;
    nativelyReady?: boolean;
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
  const notificationsRef = useRef<NativelyNotificationsInstance | null>(null);

  // Check if NativelyNotifications is available
  const checkSDK = useCallback(() => {
    const available = typeof window.NativelyNotifications === 'function';
    console.log('[Natively] SDK check - available:', available);
    setIsNativelyApp(available);
    return available;
  }, []);

  // Check for SDK on mount and when nativelyReady event fires
  useEffect(() => {
    checkSDK();
    
    const handleReady = () => {
      console.log('[Natively] nativelyReady event received');
      checkSDK();
    };
    
    window.addEventListener('nativelyReady', handleReady);
    
    // Also poll a few times in case SDK loads late
    const timeouts = [
      setTimeout(checkSDK, 500),
      setTimeout(checkSDK, 1000),
      setTimeout(checkSDK, 2000),
      setTimeout(checkSDK, 5000),
    ];
    
    return () => {
      window.removeEventListener('nativelyReady', handleReady);
      timeouts.forEach(clearTimeout);
    };
  }, [checkSDK]);

  // Fetch user's displayId
  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setDisplayId(null);
      return;
    }

    fetch('/api/user', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        const id = data.displayId || user.id;
        console.log('[Natively] User displayId:', id);
        setDisplayId(id);
      })
      .catch(err => {
        console.error('[Natively] Failed to fetch displayId:', err);
        setDisplayId(user.id);
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
        console.log('[Natively] Player ID registered:', playerIdToRegister);
        
        // Also enable push preferences
        await fetch('/api/notification-preferences', {
          method: 'PUT',
          body: JSON.stringify({ pushEnabled: true }),
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });
      }
    } catch (error) {
      console.error('[Natively] Failed to register player ID:', error);
    }
  }, [isAuthenticated]);

  // Initialize SDK when available and user is authenticated
  useEffect(() => {
    if (!isAuthenticated || !user?.id || !displayId || !isNativelyApp) {
      return;
    }

    if (!window.NativelyNotifications) {
      console.log('[Natively] NativelyNotifications not available');
      return;
    }

    try {
      console.log('[Natively] Initializing SDK...');
      const notifications = new window.NativelyNotifications();
      notificationsRef.current = notifications;
      setIsInitialized(true);

      // Get permission status
      notifications.getPermissionStatus((resp) => {
        const status = resp.status ? 'granted' : 'default';
        console.log('[Natively] Permission status:', status);
        setPermissionState(status);
      });

      // Get OneSignal Player ID
      notifications.getOneSignalId((resp) => {
        console.log('[Natively] getOneSignalId response:', resp);
        if (resp.playerId) {
          setPlayerId(resp.playerId);
          registerPlayerId(resp.playerId);
          
          // Set external ID to link user
          notifications.setExternalId({ externalId: displayId }, (setResp) => {
            console.log('[Natively] setExternalId response:', setResp);
            if (setResp?.externalId) {
              setExternalIdSet(true);
            }
          });
        }
      });

    } catch (error) {
      console.error('[Natively] Initialization error:', error);
    }

    return () => {
      notificationsRef.current = null;
    };
  }, [isAuthenticated, user?.id, displayId, isNativelyApp, registerPlayerId]);

  // Request permission
  const requestPermission = useCallback(async (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!notificationsRef.current) {
        console.warn('[Natively] SDK not initialized');
        resolve(false);
        return;
      }

      notificationsRef.current.requestPermission(true, (resp) => {
        const granted = resp.status === true;
        console.log('[Natively] Permission request result:', granted);
        setPermissionState(granted ? 'granted' : 'denied');
        
        if (granted && displayId) {
          // Get Player ID after permission granted
          notificationsRef.current?.getOneSignalId((idResp) => {
            if (idResp.playerId) {
              setPlayerId(idResp.playerId);
              registerPlayerId(idResp.playerId);
            }
          });
        }
        
        resolve(granted);
      });
    });
  }, [displayId, registerPlayerId]);

  // Remove external ID (for logout)
  const removeExternalId = useCallback(async (): Promise<void> => {
    return new Promise((resolve) => {
      if (!notificationsRef.current) {
        resolve();
        return;
      }

      notificationsRef.current.removeExternalId((resp) => {
        console.log('[Natively] removeExternalId response:', resp);
        setExternalIdSet(false);
        resolve();
      });
    });
  }, []);

  // Manual refresh
  const refreshDetection = useCallback(() => {
    return checkSDK();
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
