import { useCallback } from 'react';

/**
 * Hook for managing push notifications with BuildNatively
 * 
 * Note: BuildNatively uses native push notifications without a JavaScript SDK.
 * Users need to manually link their OneSignal Player ID to receive notifications.
 * 
 * This hook provides utility functions for the logout flow.
 */
export function useNativelyNotifications() {
  /**
   * Remove External ID on logout (clears from OneSignal if possible)
   * This is a no-op since we don't have SDK access, but we keep it for API compatibility
   */
  const removeExternalId = useCallback(async (): Promise<void> => {
    // With native-only push notifications, we can't programmatically remove the external ID
    // The user's Player ID will remain in our database until they unlink it manually
    console.log('[Notifications] removeExternalId called (no-op for native push)');
    return Promise.resolve();
  }, []);

  return {
    // These are kept for backwards compatibility but are not functional
    // since BuildNatively doesn't provide a JavaScript SDK
    isInitialized: false,
    isNativelyApp: false,
    playerId: null,
    displayId: null,
    externalIdSet: false,
    permissionState: 'default' as const,
    requestPermission: async () => false,
    removeExternalId,
    refreshDetection: () => false,
  };
}
