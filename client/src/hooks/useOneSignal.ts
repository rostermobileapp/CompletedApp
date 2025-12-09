import { useEffect, useCallback, useState, useRef } from 'react';
import { useAuth } from './useAuth';

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
  }
}

export function useOneSignal() {
  const { user, isAuthenticated } = useAuth();
  const [isInitialized, setIsInitialized] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<string>('default');
  const notificationsRef = useRef<NativelyNotificationsInstance | null>(null);

  const registerPlayerId = useCallback(async (playerIdToRegister: string) => {
    if (!isAuthenticated || !playerIdToRegister) return;
    
    try {
      const response = await fetch('/api/notification-preferences/player-id', {
        method: 'POST',
        body: JSON.stringify({ playerId: playerIdToRegister }),
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      console.log('[Natively] Player ID registered with backend:', playerIdToRegister);
    } catch (error) {
      console.error('[Natively] Failed to register player ID:', error);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      return;
    }

    if (!window.NativelyNotifications) {
      console.log('[Natively] NativelyNotifications not available (not running in Natively app)');
      return;
    }

    try {
      const notifications = new window.NativelyNotifications();
      notificationsRef.current = notifications;
      setIsInitialized(true);
      console.log('[Natively] NativelyNotifications initialized');

      notifications.getPermissionStatus((resp) => {
        const status = resp.status ? 'granted' : 'default';
        setPermissionState(status);
        console.log('[Natively] Permission status:', status);
      });

      notifications.getOneSignalId((resp) => {
        if (resp.playerId) {
          console.log('[Natively] Got Player ID:', resp.playerId);
          setPlayerId(resp.playerId);
          registerPlayerId(resp.playerId);
        } else {
          console.log('[Natively] No Player ID available yet');
        }
      });

      notifications.setExternalId({ externalId: user.id }, (resp) => {
        if (resp && resp.externalId) {
          console.log('[Natively] External ID set successfully:', resp.externalId);
        } else {
          const errorMessage = (resp && resp.error) || (resp && resp.message) || 'Failed to set external ID';
          console.warn('[Natively] External ID error:', errorMessage);
        }
      });

    } catch (error) {
      console.error('[Natively] Initialization error:', error);
    }

    return () => {
      notificationsRef.current = null;
    };
  }, [isAuthenticated, user?.id, registerPlayerId]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!notificationsRef.current) {
        console.warn('[Natively] Not initialized yet');
        resolve(false);
        return;
      }

      const fallbackToSettings = true;
      
      notificationsRef.current.requestPermission(fallbackToSettings, (resp) => {
        const isGranted = resp.status === true;
        setPermissionState(isGranted ? 'granted' : 'denied');
        console.log('[Natively] Permission request result:', isGranted);
        
        if (isGranted && notificationsRef.current) {
          notificationsRef.current.getOneSignalId((idResp) => {
            if (idResp.playerId) {
              console.log('[Natively] Got Player ID after permission:', idResp.playerId);
              setPlayerId(idResp.playerId);
              registerPlayerId(idResp.playerId);
            }
          });
        }
        
        resolve(isGranted);
      });
    });
  }, [registerPlayerId]);

  return {
    isInitialized,
    playerId,
    permissionState,
    requestPermission,
  };
}
