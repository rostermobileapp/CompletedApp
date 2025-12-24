import { useState, useRef, useEffect, type ReactNode } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Bell, X, Check, Calendar, CheckCircle2, XCircle, AlertCircle, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useLocation } from 'wouter';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { motion, useMotionValue, useTransform, PanInfo, AnimatePresence } from 'framer-motion';

interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string;
  actionText?: string;
  isRead: boolean;
  isDismissed: boolean;
  scrimmageId?: string;
  createdAt: string;
}

const SWIPE_THRESHOLD = 100;

function SwipeableNotificationItem({
  notification,
  onDismiss,
  onClick,
  children,
}: {
  notification: Notification;
  onDismiss: (id: string) => void;
  onClick?: () => void;
  children: ReactNode;
}) {
  const x = useMotionValue(0);
  const [isDragging, setIsDragging] = useState(false);
  
  const background = useTransform(
    x,
    [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD],
    ['rgba(239, 68, 68, 1)', 'rgba(239, 68, 68, 0)', 'rgba(239, 68, 68, 1)']
  );

  const handleDragEnd = (_: any, info: PanInfo) => {
    setIsDragging(false);
    if (Math.abs(info.offset.x) > SWIPE_THRESHOLD) {
      onDismiss(notification.id);
    }
  };

  const handleDragStart = () => {
    setIsDragging(true);
  };

  return (
    <div className="relative overflow-hidden">
      <motion.div
        className="absolute inset-0 flex items-center justify-between px-4"
        style={{ backgroundColor: background }}
      >
        <Trash2 className="w-5 h-5 text-white" />
        <Trash2 className="w-5 h-5 text-white" />
      </motion.div>
      <motion.div
        drag="x"
        dragDirectionLock
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        animate={{ x: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        style={{ x }}
        onClick={() => {
          if (!isDragging && onClick) {
            onClick();
          }
        }}
        className="relative bg-background cursor-grab active:cursor-grabbing"
      >
        {children}
      </motion.div>
    </div>
  );
}

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [, navigate] = useLocation();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ['/api/notifications'],
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const { data: unreadNotifications = [] } = useQuery<Notification[]>({
    queryKey: ['/api/notifications/unread'],
    refetchInterval: 10000,
    staleTime: 5000,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('PATCH', `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread'] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('PATCH', `/api/notifications/${id}/dismiss`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread'] });
    },
  });

  const unreadCount = unreadNotifications.length;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'scrimmage_invite':
        return <Calendar className="w-4 h-4 text-blue-500" />;
      case 'scrimmage_reminder':
        return <AlertCircle className="w-4 h-4 text-amber-500" />;
      case 'scrimmage_approved':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'scrimmage_canceled':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Bell className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id);
    }
    if (notification.actionUrl) {
      navigate(notification.actionUrl);
      setIsOpen(false);
    }
  };

  const handleMarkAllRead = () => {
    unreadNotifications.forEach((notification) => {
      markAsReadMutation.mutate(notification.id);
    });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative w-8 h-8 flex items-center justify-center hover:bg-card/50 rounded-lg transition-colors"
        data-testid="button-notification-center"
      >
        <Bell className="w-6 h-6 text-foreground" />
        {unreadCount > 0 && (
          <span 
            className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center font-bold px-1"
            data-testid="notification-badge"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-10 w-80 bg-background border border-border rounded-lg shadow-lg z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="font-semibold text-foreground">Notifications</h3>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={handleMarkAllRead}
                data-testid="button-mark-all-read"
              >
                <Check className="w-3 h-3 mr-1" />
                Mark all read
              </Button>
            )}
          </div>

          <ScrollArea className="h-[300px]">
            {isLoading ? (
              <div className="flex items-center justify-center h-20">
                <div className="text-sm text-muted-foreground">Loading...</div>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-20 text-muted-foreground">
                <Bell className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">No notifications</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                <AnimatePresence mode="popLayout">
                  {notifications.map((notification) => {
                    const isClickable = !!notification.actionUrl;
                    return (
                      <motion.div
                        key={notification.id}
                        initial={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <SwipeableNotificationItem
                          notification={notification}
                          onDismiss={(id) => dismissMutation.mutate(id)}
                          onClick={isClickable ? () => handleNotificationClick(notification) : undefined}
                        >
                          <div
                            className={cn(
                              "px-4 py-3 transition-colors relative group",
                              isClickable && "hover:bg-muted/50 cursor-pointer",
                              !notification.isRead && "bg-primary/5"
                            )}
                            data-testid={`notification-item-${notification.id}`}
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 mt-0.5">
                                {getNotificationIcon(notification.type)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className={cn(
                                    "text-sm truncate",
                                    !notification.isRead ? "font-semibold text-foreground" : "text-foreground"
                                  )}>
                                    {notification.title}
                                  </p>
                                  {!notification.isRead && (
                                    <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0" />
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                  {notification.message}
                                </p>
                                <p className="text-xs text-muted-foreground/70 mt-1">
                                  {format(new Date(notification.createdAt), 'MMM d, h:mm a')}
                                </p>
                              </div>
                              <div className="flex-shrink-0 text-xs text-muted-foreground opacity-60">
                                Swipe to clear
                              </div>
                            </div>
                          </div>
                        </SwipeableNotificationItem>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
