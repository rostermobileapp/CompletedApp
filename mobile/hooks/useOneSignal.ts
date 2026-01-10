import { useEffect, useState, useCallback } from 'react';
import { OneSignal } from 'react-native-onesignal';
import Constants from 'expo-constants';

interface UseOneSignalResult {
  isInitialized: boolean;
  playerId: string | null;
  externalIdSet: boolean;
  permissionGranted: boolean;
  login: (externalId: string) => Promise<void>;
  logout: () => Promise<void>;
  requestPermission: () => Promise<boolean>;
  getPlayerId: () => Promise<string | null>;
  setFirstNameTag: (firstName: string) => void;
}

export function useOneSignal(): UseOneSignalResult {
  const [isInitialized, setIsInitialized] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [externalIdSet, setExternalIdSet] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);

  useEffect(() => {
    const appId = Constants.expoConfig?.extra?.oneSignalAppId;
    
    if (!appId) {
      console.warn('[OneSignal] No App ID configured in app.json extra.oneSignalAppId');
      return;
    }

    try {
      OneSignal.initialize(appId);
      console.log('[OneSignal] Initialized with App ID:', appId);
      setIsInitialized(true);

      OneSignal.Notifications.addEventListener('permissionChange', (granted) => {
        console.log('[OneSignal] Permission changed:', granted);
        setPermissionGranted(granted);
      });

      OneSignal.User.pushSubscription.addEventListener('change', (subscription) => {
        console.log('[OneSignal] Push subscription changed:', subscription);
        if (subscription.current.id) {
          setPlayerId(subscription.current.id);
        }
      });

      const currentId = OneSignal.User.pushSubscription.getPushSubscriptionId();
      if (currentId) {
        setPlayerId(currentId);
      }

      const hasPermission = OneSignal.Notifications.hasPermission();
      setPermissionGranted(hasPermission);
    } catch (error) {
      console.error('[OneSignal] Initialization error:', error);
    }
  }, []);

  const login = useCallback(async (externalId: string) => {
    if (!isInitialized) {
      console.warn('[OneSignal] Cannot login - SDK not initialized');
      return;
    }

    try {
      console.log('[OneSignal] Logging in with External ID:', externalId);
      await OneSignal.login(externalId);
      setExternalIdSet(true);
      console.log('[OneSignal] External ID set successfully');
    } catch (error) {
      console.error('[OneSignal] Login error:', error);
      throw error;
    }
  }, [isInitialized]);

  const logout = useCallback(async () => {
    if (!isInitialized) {
      console.warn('[OneSignal] Cannot logout - SDK not initialized');
      return;
    }

    try {
      console.log('[OneSignal] Logging out');
      await OneSignal.logout();
      setExternalIdSet(false);
      console.log('[OneSignal] Logged out successfully');
    } catch (error) {
      console.error('[OneSignal] Logout error:', error);
      throw error;
    }
  }, [isInitialized]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isInitialized) {
      console.warn('[OneSignal] Cannot request permission - SDK not initialized');
      return false;
    }

    try {
      console.log('[OneSignal] Requesting notification permission');
      const granted = await OneSignal.Notifications.requestPermission(true);
      setPermissionGranted(granted);
      console.log('[OneSignal] Permission result:', granted);
      return granted;
    } catch (error) {
      console.error('[OneSignal] Permission request error:', error);
      return false;
    }
  }, [isInitialized]);

  const getPlayerId = useCallback(async (): Promise<string | null> => {
    if (!isInitialized) {
      console.warn('[OneSignal] Cannot get player ID - SDK not initialized');
      return null;
    }

    try {
      const currentId = OneSignal.User.pushSubscription.getPushSubscriptionId();
      if (currentId) {
        setPlayerId(currentId);
        return currentId;
      }
      
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          const id = OneSignal.User.pushSubscription.getPushSubscriptionId();
          if (id) {
            clearInterval(checkInterval);
            setPlayerId(id);
            resolve(id);
          }
        }, 100);
        
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve(null);
        }, 5000);
      });
    } catch (error) {
      console.error('[OneSignal] Get player ID error:', error);
      return null;
    }
  }, [isInitialized]);

  const setFirstNameTag = useCallback((firstName: string) => {
    if (!isInitialized) {
      console.warn('[OneSignal] Cannot set tag - SDK not initialized');
      return;
    }

    try {
      console.log('[OneSignal] Setting first_name tag:', firstName);
      OneSignal.User.addTag('first_name', firstName);
      console.log('[OneSignal] first_name tag set successfully');
    } catch (error) {
      console.error('[OneSignal] Error setting first_name tag:', error);
    }
  }, [isInitialized]);

  return {
    isInitialized,
    playerId,
    externalIdSet,
    permissionGranted,
    login,
    logout,
    requestPermission,
    getPlayerId,
    setFirstNameTag,
  };
}
