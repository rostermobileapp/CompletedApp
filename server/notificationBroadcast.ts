type NotifyFn = (userId: string) => void;

let _fn: NotifyFn | null = null;

export function setNotificationBroadcaster(fn: NotifyFn): void {
  _fn = fn;
}

export function broadcastNotificationUpdate(userId: string): void {
  _fn?.(userId);
}
