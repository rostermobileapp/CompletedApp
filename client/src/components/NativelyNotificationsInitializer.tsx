import { useNativelyNotifications } from '@/hooks/useNativelyNotifications';

/**
 * Component that initializes Natively/OneSignal push notifications
 * when the user is authenticated. This component renders nothing
 * but handles the notification SDK initialization in the background.
 * 
 * Place this component inside the authenticated routes to ensure
 * push notifications are set up when the user logs in.
 */
export function NativelyNotificationsInitializer() {
  // This hook handles all the initialization logic:
  // - Fetches user's displayId from the backend
  // - Initializes NativelyNotifications SDK
  // - Gets permission status
  // - Gets OneSignal Player ID and registers it with backend
  // - Sets External ID to link the device to the user
  useNativelyNotifications();
  
  // This component doesn't render anything
  return null;
}
