import { useEffect, useCallback, useState } from 'react';
import { useAuth } from './useAuth';

declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: any) => void>;
    OneSignal?: any;
  }
}

export function useOneSignal() {
  const { user, isAuthenticated } = useAuth();
  const [isInitialized, setIsInitialized] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<string>('default');

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
      console.log('[OneSignal] Player ID registered with backend');
    } catch (error) {
      console.error('[OneSignal] Failed to register player ID:', error);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const appId = import.meta.env.VITE_ONESIGNAL_APP_ID;
    
    if (!appId) {
      console.warn('[OneSignal] VITE_ONESIGNAL_APP_ID not set');
      return;
    }

    if (!isAuthenticated) {
      return;
    }

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    
    if (!document.getElementById('onesignal-sdk')) {
      const script = document.createElement('script');
      script.id = 'onesignal-sdk';
      script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
      script.defer = true;
      document.head.appendChild(script);
    }

    window.OneSignalDeferred.push(async function(OneSignal: any) {
      try {
        await OneSignal.init({
          appId: appId,
          allowLocalhostAsSecureOrigin: true,
          serviceWorkerParam: { scope: '/push/onesignal/' },
          serviceWorkerPath: '/push/onesignal/OneSignalSDKWorker.js',
        });

        setIsInitialized(true);
        console.log('[OneSignal] Initialized successfully');

        const permission = await OneSignal.Notifications.permission;
        const permissionString = permission === true ? 'granted' : (permission === false ? 'denied' : 'default');
        setPermissionState(permissionString);

        if (permissionString === 'granted') {
          const id = await OneSignal.User.PushSubscription.id;
          if (id) {
            setPlayerId(id);
            await registerPlayerId(id);
          }
        }

        OneSignal.User.PushSubscription.addEventListener('change', async (event: any) => {
          console.log('[OneSignal] Subscription changed:', event);
          if (event.current.id) {
            setPlayerId(event.current.id);
            await registerPlayerId(event.current.id);
          }
        });

      } catch (error) {
        console.error('[OneSignal] Initialization error:', error);
      }
    });

    return () => {
    };
  }, [isAuthenticated, registerPlayerId]);

  const requestPermission = useCallback(async () => {
    if (!window.OneSignal || !isInitialized) {
      console.warn('[OneSignal] Not initialized yet');
      return false;
    }

    try {
      await window.OneSignal.Notifications.requestPermission();
      const permission = await window.OneSignal.Notifications.permission;
      const isGranted = permission === true;
      setPermissionState(isGranted ? 'granted' : 'denied');
      
      if (isGranted) {
        const id = await window.OneSignal.User.PushSubscription.id;
        if (id) {
          setPlayerId(id);
          await registerPlayerId(id);
        }
      }
      
      return isGranted;
    } catch (error) {
      console.error('[OneSignal] Permission request failed:', error);
      return false;
    }
  }, [isInitialized, registerPlayerId]);

  return {
    isInitialized,
    playerId,
    permissionState,
    requestPermission,
  };
}
