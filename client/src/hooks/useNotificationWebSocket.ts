import { useWebSocket } from '@/context/WebSocketContext';

/**
 * Backwards-compatible alias for older callers. Notification invalidation,
 * authentication, reconnects, and fallback reconciliation are all handled by
 * the shared provider so the app never opens a second competing socket.
 */
export function useNotificationWebSocket() {
  return useWebSocket();
}
