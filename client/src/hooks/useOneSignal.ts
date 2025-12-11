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

declare global {
  interface Window {
    NativelyNotifications?: new () => NativelyNotificationsInstance;
    OneSignal?: {
      login: (externalId: string) => Promise<void>;
      logout: () => Promise<void>;
      User?: {
        addAlias: (label: string, id: string) => void;
      };
    };
  }
}

export function useOneSignal() {
  const { user, isAuthenticated } = useAuth();
  const [isInitialized, setIsInitialized] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [displayId, setDisplayId] = useState<string | null>(null);
  const [externalIdSet, setExternalIdSet] = useState(false);
  const [permissionState, setPermissionState] = useState<string>('default');
  const notificationsRef = useRef<NativelyNotificationsInstance | null>(null);
  const hasCalledLoginRef = useRef(false);

  // Fetch the user's displayId from the backend
  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setDisplayId(null);
      return;
    }

    fetch('/api/user', {
      credentials: 'include',
    })
      .then(res => res.json())
      .then(data => {
        if (data.displayId) {
          console.log('[Natively] Fetched displayId:', data.displayId);
          setDisplayId(data.displayId);
        } else {
          console.warn('[Natively] No displayId in user profile, using user.id as fallback');
          setDisplayId(user.id);
        }
      })
      .catch(err => {
        console.error('[Natively] Failed to fetch user profile, using user.id as fallback:', err);
        setDisplayId(user.id);
      });
  }, [isAuthenticated, user?.id]);

  const registerPlayerId = useCallback(async (playerIdToRegister: string, retryCount = 0) => {
    if (!playerIdToRegister) return;
    
    const MAX_RETRIES = 10; // More retries since we're waiting for session
    const RETRY_DELAY_MS = 2000; // 2 seconds
    
    console.log(`[Natively] Attempting to register Player ID (attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`, playerIdToRegister.substring(0, 8) + '...');
    
    try {
      // Get the current Supabase session for Bearer token auth
      // This is more reliable than cookies in BuildNatively
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        if (retryCount < MAX_RETRIES) {
          console.log(`[Natively] No session/token yet, waiting for auth... retrying in ${RETRY_DELAY_MS}ms`);
          setTimeout(() => registerPlayerId(playerIdToRegister, retryCount + 1), RETRY_DELAY_MS);
          return;
        }
        console.error('[Natively] No auth session after max retries');
        return;
      }
      
      console.log('[Natively] Got Supabase session, using Bearer token auth');
      
      const playerIdResponse = await fetch('/api/notification-preferences/player-id', {
        method: 'POST',
        body: JSON.stringify({ playerId: playerIdToRegister }),
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      
      // If 401, session might have expired - retry
      if (playerIdResponse.status === 401) {
        if (retryCount < MAX_RETRIES) {
          console.log(`[Natively] Auth rejected (401), refreshing session and retrying in ${RETRY_DELAY_MS}ms...`);
          await supabase.auth.refreshSession();
          setTimeout(() => registerPlayerId(playerIdToRegister, retryCount + 1), RETRY_DELAY_MS);
          return;
        }
        console.error('[Natively] Auth failed after max retries');
        return;
      }
      
      if (!playerIdResponse.ok) {
        throw new Error(`HTTP ${playerIdResponse.status}`);
      }
      
      const result = await playerIdResponse.json();
      console.log('[Natively] Player ID registered with backend:', playerIdToRegister.substring(0, 8) + '...');
      console.log('[Natively] External ID linked:', result.externalIdLinked, 'displayId:', result.displayId);
      
      const prefsResponse = await fetch('/api/notification-preferences', {
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
      if (!prefsResponse.ok) {
        console.warn('[Natively] Failed to enable push preferences:', prefsResponse.status);
      } else {
        console.log('[Natively] Push preferences enabled successfully');
      }
    } catch (error) {
      console.error('[Natively] Failed to register player ID:', error);
      // Retry on network errors
      if (retryCount < MAX_RETRIES) {
        console.log(`[Natively] Network error, retrying in ${RETRY_DELAY_MS}ms...`);
        setTimeout(() => registerPlayerId(playerIdToRegister, retryCount + 1), RETRY_DELAY_MS);
      }
    }
  }, []);

  // Define linkExternalIdViaBackend BEFORE setExternalIdImmediately (dependency order)
  const linkExternalIdViaBackend = useCallback(async (oneSignalId: string, externalUserId: string) => {
    try {
      console.log('[Natively] Calling backend to link External ID via REST API');
      
      // Get Supabase session for Bearer token auth
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      
      const response = await fetch('/api/notification-preferences/link-external-id', {
        method: 'POST',
        body: JSON.stringify({ oneSignalId, userId: externalUserId }),
        headers,
        credentials: 'include', // Keep as fallback
      });
      if (response.ok) {
        console.log('[Natively] Backend successfully linked External ID');
        return true;
      } else {
        console.warn('[Natively] Backend failed to link External ID:', response.status);
        return false;
      }
    } catch (error) {
      console.error('[Natively] Error calling backend to link External ID:', error);
      return false;
    }
  }, []);

  const tryNativelyLogin = useCallback((notifications: NativelyNotificationsInstance, userId: string, currentPlayerId: string | null) => {
    if (notifications.login) {
      try {
        console.log('[Natively] Trying NativelyNotifications.login() as backup...');
        notifications.login(userId);
        console.log('[Natively] ✓ Backup login called');
        setExternalIdSet(true);
      } catch (err) {
        console.error('[Natively] ✗ Backup login failed:', err);
        // Last resort: setExternalId, and if that fails try backend API
        notifications.setExternalId({ externalId: userId }, async (resp) => {
          if (resp && resp.externalId) {
            console.log('[Natively] ✓ setExternalId successful:', resp.externalId);
            setExternalIdSet(true);
          } else {
            console.error('[Natively] ✗ setExternalId failed:', resp);
            // Try backend API as absolute last resort
            if (currentPlayerId) {
              console.log('[Natively] Trying backend API as last resort');
              await linkExternalIdViaBackend(currentPlayerId, userId);
            }
          }
        });
      }
    }
  }, [linkExternalIdViaBackend]);

  const setExternalIdImmediately = useCallback((userId: string, currentPlayerId: string | null) => {
    if (hasCalledLoginRef.current) {
      console.log('[Natively] Login already called, skipping');
      return;
    }

    const notifications = notificationsRef.current;
    if (!notifications) {
      console.warn('[Natively] Notifications not initialized');
      return;
    }

    console.log('[Natively] Setting External ID immediately to:', userId);
    hasCalledLoginRef.current = true;

    // Priority 1: Use OneSignal.login() - this is the recommended method
    if (window.OneSignal?.login) {
      console.log('[Natively] Calling OneSignal.login() immediately...');
      window.OneSignal.login(userId)
        .then(() => {
          console.log('[Natively] ✓ OneSignal.login() successful for:', userId);
          setExternalIdSet(true);
          
          // Verify after a short delay
          setTimeout(() => {
            notifications.getExternalId((resp) => {
              console.log('[Natively] External ID verification:', JSON.stringify(resp));
            });
          }, 1000);
        })
        .catch((err) => {
          console.error('[Natively] ✗ OneSignal.login() failed:', err);
          // Try backup method
          tryNativelyLogin(notifications, userId, currentPlayerId);
        });
      return;
    }

    // Priority 2: Use NativelyNotifications.login() if available
    if (notifications.login) {
      console.log('[Natively] Calling NativelyNotifications.login() immediately...');
      try {
        notifications.login(userId);
        console.log('[Natively] ✓ NativelyNotifications.login() called for:', userId);
        setExternalIdSet(true);
        
        // Verify after a short delay
        setTimeout(() => {
          notifications.getExternalId((resp) => {
            console.log('[Natively] External ID verification:', JSON.stringify(resp));
          });
        }, 1000);
        return;
      } catch (err) {
        console.error('[Natively] ✗ NativelyNotifications.login() failed:', err);
      }
    }

    // Priority 3: Fall back to setExternalId
    console.log('[Natively] Using setExternalId as fallback...');
    notifications.setExternalId({ externalId: userId }, async (resp) => {
      if (resp && resp.externalId) {
        console.log('[Natively] ✓ setExternalId successful:', resp.externalId);
        setExternalIdSet(true);
      } else {
        console.error('[Natively] ✗ setExternalId failed:', resp);
        // Absolute last resort: try backend API if we have playerId
        if (currentPlayerId) {
          console.log('[Natively] Trying backend API as absolute last resort');
          const success = await linkExternalIdViaBackend(currentPlayerId, userId);
          if (success) {
            setExternalIdSet(true);
          }
        }
      }
    });
  }, [linkExternalIdViaBackend, tryNativelyLogin]);

  useEffect(() => {
    // Wait for both authentication and displayId to be available
    if (!isAuthenticated || !user?.id || !displayId) {
      return;
    }

    // Function to initialize notifications
    const initializeNotifications = () => {
      if (!window.NativelyNotifications) {
        return false;
      }

      try {
        const notifications = new window.NativelyNotifications();
        notificationsRef.current = notifications;
        setIsInitialized(true);
        console.log('[Natively] NativelyNotifications initialized for user:', user.id, 'displayId:', displayId);
        return true;
      } catch (error) {
        console.error('[Natively] Failed to initialize NativelyNotifications:', error);
        return false;
      }
    };

    // Try immediate initialization
    if (initializeNotifications()) {
      // Continue with rest of initialization below
    } else {
      // Poll for NativelyNotifications availability (BuildNatively might load it async)
      console.log('[Natively] NativelyNotifications not available yet, starting poll...');
      let pollCount = 0;
      const maxPolls = 20; // Try for 10 seconds (20 * 500ms)
      
      const pollInterval = setInterval(() => {
        pollCount++;
        console.log(`[Natively] Polling for NativelyNotifications (${pollCount}/${maxPolls})...`);
        
        if (window.NativelyNotifications) {
          clearInterval(pollInterval);
          console.log('[Natively] NativelyNotifications became available!');
          if (initializeNotifications()) {
            // Trigger the rest of initialization manually
            const notifications = notificationsRef.current;
            if (notifications) {
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
                  console.log('[Natively] Calling login immediately after getting Player ID');
                  setExternalIdImmediately(displayId, resp.playerId);
                } else {
                  console.log('[Natively] No Player ID available yet, will retry...');
                  setTimeout(() => {
                    notifications.getOneSignalId((retryResp) => {
                      if (retryResp.playerId) {
                        console.log('[Natively] Got Player ID on retry:', retryResp.playerId);
                        setPlayerId(retryResp.playerId);
                        registerPlayerId(retryResp.playerId);
                        console.log('[Natively] Calling login immediately after retry');
                        setExternalIdImmediately(displayId, retryResp.playerId);
                      } else {
                        console.warn('[Natively] Still no Player ID after retry');
                      }
                    });
                  }, 2000);
                }
              });
            }
          }
        } else if (pollCount >= maxPolls) {
          clearInterval(pollInterval);
          console.log('[Natively] NativelyNotifications not available after polling (not running in Natively app)');
        }
      }, 500);
      
      return () => clearInterval(pollInterval);
    }

    // If immediate init succeeded, continue with setup
    const notifications = notificationsRef.current;
    if (!notifications) return;

    console.log('[Natively] Continuing with notification setup...');

    notifications.getPermissionStatus((resp) => {
      const status = resp.status ? 'granted' : 'default';
      setPermissionState(status);
      console.log('[Natively] Permission status:', status);
    });

    // Get Player ID and immediately set External ID
    notifications.getOneSignalId((resp) => {
      if (resp.playerId) {
        console.log('[Natively] Got Player ID:', resp.playerId);
        setPlayerId(resp.playerId);
        registerPlayerId(resp.playerId);
        
        // CRITICAL: Call login IMMEDIATELY after getting Player ID
        console.log('[Natively] Calling login immediately after getting Player ID');
        setExternalIdImmediately(displayId, resp.playerId);
      } else {
        console.log('[Natively] No Player ID available yet, will retry...');
        setTimeout(() => {
          notifications.getOneSignalId((retryResp) => {
            if (retryResp.playerId) {
              console.log('[Natively] Got Player ID on retry:', retryResp.playerId);
              setPlayerId(retryResp.playerId);
              registerPlayerId(retryResp.playerId);
              console.log('[Natively] Calling login immediately after retry');
              setExternalIdImmediately(displayId, retryResp.playerId);
            } else {
              console.warn('[Natively] Still no Player ID after retry');
            }
          });
        }, 2000);
      }
    });

    return () => {
      notificationsRef.current = null;
      hasCalledLoginRef.current = false;
    };
  }, [isAuthenticated, user?.id, displayId, registerPlayerId, setExternalIdImmediately]);

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
        
        if (isGranted && notificationsRef.current && displayId) {
          // Get Player ID and set External ID immediately after permission is granted
          notificationsRef.current.getOneSignalId((idResp) => {
            if (idResp.playerId) {
              console.log('[Natively] Got Player ID after permission:', idResp.playerId);
              setPlayerId(idResp.playerId);
              registerPlayerId(idResp.playerId);
              
              // Call login immediately after getting permission
              console.log('[Natively] Calling login immediately after permission granted');
              setExternalIdImmediately(displayId, idResp.playerId);
            }
          });
        }
        
        resolve(isGranted);
      });
    });
  }, [registerPlayerId, displayId, setExternalIdImmediately]);

  return {
    isInitialized,
    playerId,
    externalIdSet,
    permissionState,
    requestPermission,
  };
}
