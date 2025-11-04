import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Bell, X, ExternalLink } from 'lucide-react';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { UserNotification } from '@shared/schema';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();

  const { data: unreadData } = useQuery({
    queryKey: ['/api/notifications/unread'],
    refetchInterval: 30000,
  });

  const { data: notifications = [] } = useQuery<UserNotification[]>({
    queryKey: ['/api/notifications'],
    enabled: open,
  });

  const unreadCount = (unreadData as { count: number } | undefined)?.count ?? 0;

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('PATCH', `/api/notifications/${id}/read`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread'] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('PATCH', `/api/notifications/${id}/dismiss`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread'] });
    },
  });

  const handleNotificationClick = (notification: UserNotification) => {
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id);
    }
    if (notification.actionUrl) {
      setOpen(false);
      navigate(notification.actionUrl);
    }
  };

  const handleDismiss = (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation();
    dismissMutation.mutate(notificationId);
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'payment_failed':
        return '💳';
      case 'subscription_canceled':
        return '❌';
      case 'subscription_renewed':
        return '✅';
      default:
        return 'ℹ️';
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative w-[48px] h-[48px] rounded-full flex items-center justify-center hover:bg-accent transition-colors"
          data-testid="button-notifications"
        >
          <Bell className="h-6 w-6 text-foreground" />
          {unreadCount > 0 && (
            <span
              className="absolute top-1 right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-semibold"
              data-testid="badge-unread-count"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[380px] p-0"
        align="end"
        sideOffset={8}
        data-testid="popover-notifications"
      >
        <div className="bg-card border-border">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="font-semibold text-lg" data-testid="text-notifications-title">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <p className="text-sm text-muted-foreground" data-testid="text-unread-count">
                {unreadCount} unread
              </p>
            )}
          </div>
          <ScrollArea className="h-[400px]">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-muted-foreground" data-testid="text-no-notifications">
                <Bell className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No notifications</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={cn(
                      'px-4 py-3 hover:bg-accent/50 transition-colors cursor-pointer relative',
                      !notification.isRead && 'bg-primary/5'
                    )}
                    onClick={() => handleNotificationClick(notification)}
                    data-testid={`notification-${notification.id}`}
                  >
                    <button
                      onClick={(e) => handleDismiss(e, notification.id)}
                      className="absolute top-2 right-2 p-1 hover:bg-accent rounded-full transition-colors"
                      data-testid={`button-dismiss-${notification.id}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <div className="flex gap-3 pr-6">
                      <div className="text-2xl flex-shrink-0">
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4
                            className={cn(
                              'font-medium text-sm',
                              !notification.isRead && 'font-semibold'
                            )}
                            data-testid={`text-notification-title-${notification.id}`}
                          >
                            {notification.title}
                          </h4>
                        </div>
                        <p
                          className="text-sm text-muted-foreground mt-1 break-words"
                          data-testid={`text-notification-message-${notification.id}`}
                        >
                          {notification.message}
                        </p>
                        {notification.actionUrl && notification.actionText && (
                          <Button
                            size="sm"
                            variant="link"
                            className="p-0 h-auto mt-2 text-primary"
                            data-testid={`button-action-${notification.id}`}
                          >
                            <span>{notification.actionText}</span>
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </Button>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          {new Date(notification.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}
