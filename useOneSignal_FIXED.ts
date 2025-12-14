import { useEffect, useCallback, useState, useRef } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/lib/supabase';

// BuildNatively NativelyNotifications interface
interface NativelyNotificationsInstance {
  getOneSignalId: (callback: (resp: { playerId: string | null }) => void) => void;
  getPermissionStatus: (callback: (resp: { status: boolean }) => void) => void;
  requestPermission: (fallbackToSettings: boolean, callback: (resp: { status: boolean }) => void) => void;
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
  
  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [displayId, setDisplayId] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'default' | 'granted' | 'denied'>('default');
  
  // Refs
  const notificationsRef = useRef<NativelyNotificationsInstance | null>(null);
  const initAttemptedRef = useRef(false);
  const playerIdSavedRef = useRef(false);

  // Fetch user's displayId from backend
  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setDisplayId(null);
      return;
    }

    const fetchDisplayId = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        
        const response = await fetch('/api/user', {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.displayId) {
            console.log('[OneSignal] Fetched displayId:', data.displayId);
            setDisplayId(data.displayId);
          }
        }
      } catch (err) {
        console.error('[OneSignal] Error fetching displayId:', err);
      }
    };
    
    fetchDisplayId();
  }, [isAuthenticated, user?.id]);

  // Initialize OneSignal (BuildNatively Pattern)
  useEffect(() => {
    if (!isAuthenticated || !user?.id || initAttemptedRef.current) {
      return;
    }

    const initializeOneSignal = async () => {
      console.log('[OneSignal] === INITIALIZATION START ===');
      
      // Check if BuildNatively's NativelyNotifications is available
      if (!window.NativelyNotifications) {
        console.error('[OneSignal] ❌ window.NativelyNotifications not available');
        console.error('[OneSignal] ❌ BuildNatively may not be configured correctly');
        console.error('[OneSignal] ❌ Ensure OneSignal is enabled in BuildNatively settings');
        return;
      }

      try {
        // Step 1: Create NativelyNotifications instance
        console.log('[OneSignal] Creating NativelyNotifications instance...');
        const notifications = new window.NativelyNotifications();
        notificationsRef.current = notifications;
        setIsInitialized(true);
        console.log('[OneSignal] ✅ Instance created');

        // Step 2: Get permission status
        console.log('[OneSignal] Checking permission status...');
        notifications.getPermissionStatus((resp) => {
          const granted = resp.status;
          setPermissionGranted(granted);
          setPermissionStatus(granted ? 'granted' : 'default');
          console.log('[OneSignal] Permission status:', granted ? 'granted' : 'not granted');
        });

        // Step 3: Get OneSignal Player ID
        console.log('[OneSignal] Getting Player ID...');
        notifications.getOneSignalId(async (resp) => {
          if (resp.playerId) {
            console.log('[OneSignal] ✅ Player ID received:', resp.playerId);
            setPlayerId(resp.playerId);
            
            // CRITICAL: Save Player ID to database
            await savePlayerIdToDatabase(resp.playerId);
          } else {
            console.warn('[OneSignal] ⚠️ No Player ID received yet');
          }
        });

        console.log('[OneSignal] === INITIALIZATION COMPLETE ===');
      } catch (error) {
        console.error('[OneSignal] ❌ Initialization failed:', error);
      }
    };

    initAttemptedRef.current = true;
    
    // Wait for document to be ready
    if (document.readyState === 'complete') {
      initializeOneSignal();
    } else {
      window.addEventListener('load', initializeOneSignal, { once: true });
      return () => window.removeEventListener('load', initializeOneSignal);
    }
  }, [isAuthenticated, user?.id]);

  // Set External ID after Player ID is available
  useEffect(() => {
    if (!playerId || !displayId || !notificationsRef.current) {
      return;
    }

    const setExternalId = () => {
      console.log('[OneSignal] Setting External ID:', displayId);
      
      notificationsRef.current!.setExternalId(
        { externalId: displayId },
        (resp) => {
          if (resp && resp.externalId) {
            console.log('[OneSignal] ✅ External ID set:', resp.externalId);
          } else if (resp && resp.error) {
            console.error('[OneSignal] ❌ Failed to set External ID:', resp.error);
          } else {
            console.log('[OneSignal] External ID set (no confirmation)');
          }
        }
      );
    };

    setExternalId();
  }, [playerId, displayId]);

  // Save Player ID to database
  const savePlayerIdToDatabase = async (playerId: string) => {
    if (playerIdSavedRef.current) {
      console.log('[OneSignal] Player ID already saved, skipping');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.warn('[OneSignal] No session, cannot save Player ID');
        return;
      }

      console.log('[OneSignal] Saving Player ID to database...');
      
      const response = await fetch('/api/notification-preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          oneSignalPlayerId: playerId,
          pushEnabled: true,
        }),
      });

      if (response.ok) {
        console.log('[OneSignal] ✅ Player ID saved to database');
        playerIdSavedRef.current = true;
      } else {
        console.error('[OneSignal] ❌ Failed to save Player ID:', response.status);
      }
    } catch (error) {
      console.error('[OneSignal] ❌ Error saving Player ID:', error);
    }
  };

  // Request permission (call this from a button click!)
  const requestPermission = useCallback(async () => {
    if (!notificationsRef.current) {
      console.error('[OneSignal] Cannot request permission - not initialized');
      return false;
    }

    return new Promise<boolean>((resolve) => {
      console.log('[OneSignal] Requesting notification permission...');
      
      const fallbackToSettings = true; // Show alert if permission denied
      
      notificationsRef.current!.requestPermission(fallbackToSettings, (resp) => {
        const granted = resp.status;
        setPermissionGranted(granted);
        setPermissionStatus(granted ? 'granted' : 'denied');
        
        if (granted) {
          console.log('[OneSignal] ✅ Permission granted!');
          
          // Get Player ID again (it might have changed after permission)
          notificationsRef.current!.getOneSignalId(async (idResp) => {
            if (idResp.playerId) {
              console.log('[OneSignal] Player ID after permission:', idResp.playerId);
              setPlayerId(idResp.playerId);
              await savePlayerIdToDatabase(idResp.playerId);
            }
          });
        } else {
          console.log('[OneSignal] ❌ Permission denied');
        }
        
        resolve(granted);
      });
    });
  }, []);

  // Logout - clear OneSignal data
  const logout = useCallback(async () => {
    if (notificationsRef.current && displayId) {
      console.log('[OneSignal] Removing External ID...');
      notificationsRef.current.removeExternalId((resp) => {
        if (resp && resp.error) {
          console.warn('[OneSignal] Error removing External ID:', resp.error);
        } else {
          console.log('[OneSignal] ✅ External ID removed');
        }
      });
    }

    // Reset state
    setPlayerId(null);
    setDisplayId(null);
    setPermissionGranted(false);
    setPermissionStatus('default');
    setIsInitialized(false);
    initAttemptedRef.current = false;
    playerIdSavedRef.current = false;
    notificationsRef.current = null;
  }, [displayId]);

  return {
    isInitialized,
    playerId,
    displayId,
    permissionGranted,
    permissionStatus,
    requestPermission,
    logout,
  };
}
