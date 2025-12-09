import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useOneSignal } from '@/hooks/useOneSignal';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MessageSquare, DollarSign, Users, UserPlus, Calendar, Bell, Loader2, BellRing, AlertCircle, Newspaper, Send } from 'lucide-react';

interface NotificationSettings {
  inAppMessages: boolean;
  paymentRequests: boolean;
  substitutionRequests: boolean;
  joinRequests: boolean;
  upcomingEvents: boolean;
  newsAnnouncements: boolean;
}

interface NotificationPreferences {
  userId: string;
  notificationSettings: NotificationSettings;
  pushEnabled: boolean;
  oneSignalPlayerId: string | null;
}

const NOTIFICATION_TYPES = [
  {
    key: 'inAppMessages' as const,
    label: 'Messages',
    description: 'New messages from teammates and other players',
    icon: MessageSquare,
  },
  {
    key: 'paymentRequests' as const,
    label: 'Payment Requests',
    description: 'When someone requests payment from you',
    icon: DollarSign,
  },
  {
    key: 'substitutionRequests' as const,
    label: 'Substitution Requests',
    description: 'When players need a substitute for games',
    icon: Users,
  },
  {
    key: 'joinRequests' as const,
    label: 'Join Requests',
    description: 'When someone wants to join your team or league',
    icon: UserPlus,
  },
  {
    key: 'upcomingEvents' as const,
    label: 'Schedule Reminders',
    description: 'Reminders for games, scrimmages, and claimed duties',
    icon: Calendar,
  },
  {
    key: 'newsAnnouncements' as const,
    label: 'News & Announcements',
    description: 'New posts in the News feed from your leagues and teams',
    icon: Newspaper,
  },
];

interface NotificationPreferencesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationPreferencesModal({ open, onOpenChange }: NotificationPreferencesModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isInitialized, permissionState, requestPermission, playerId } = useOneSignal();
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  
  const [settings, setSettings] = useState<NotificationSettings>({
    inAppMessages: true,
    paymentRequests: true,
    substitutionRequests: true,
    joinRequests: true,
    upcomingEvents: true,
    newsAnnouncements: true,
  });
  const [pushEnabled, setPushEnabled] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: preferences, isLoading } = useQuery<NotificationPreferences>({
    queryKey: ['/api/notification-preferences'],
    enabled: open,
  });

  useEffect(() => {
    if (preferences) {
      // Merge with defaults to ensure new notification types are included
      setSettings(prev => ({
        ...prev,
        ...preferences.notificationSettings,
      }));
      setPushEnabled(preferences.pushEnabled);
      setHasChanges(false);
    }
  }, [preferences]);

  const updateMutation = useMutation({
    mutationFn: async (data: { notificationSettings: NotificationSettings; pushEnabled: boolean }) => {
      const response = await apiRequest('PUT', '/api/notification-preferences', data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Notification preferences saved' });
      queryClient.invalidateQueries({ queryKey: ['/api/notification-preferences'] });
      setHasChanges(false);
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: 'Failed to save preferences',
        variant: 'destructive',
      });
    },
  });

  const handleSettingChange = (key: keyof NotificationSettings, value: boolean) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handlePushEnabledChange = (value: boolean) => {
    setPushEnabled(value);
    setHasChanges(true);
  };

  const handleRequestPermission = async () => {
    setIsRequestingPermission(true);
    try {
      const granted = await requestPermission();
      if (granted) {
        setPushEnabled(true);
        setHasChanges(true);
        toast({ title: 'Push notifications enabled!' });
        queryClient.invalidateQueries({ queryKey: ['/api/notification-preferences'] });
      } else {
        toast({ 
          title: 'Permission denied', 
          description: 'You can enable notifications later in your browser settings.',
          variant: 'destructive' 
        });
      }
    } catch (error) {
      toast({ title: 'Failed to request permission', variant: 'destructive' });
    } finally {
      setIsRequestingPermission(false);
    }
  };

  const handleSave = () => {
    updateMutation.mutate({ notificationSettings: settings, pushEnabled });
  };

  const testNotificationMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/notification-preferences/test', { type: 'message' });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ 
          title: 'Test notification sent!', 
          description: 'Check your device for the test notification.' 
        });
      } else {
        toast({ 
          title: 'Notification skipped', 
          description: data.message,
          variant: 'destructive'
        });
      }
    },
    onError: (error) => {
      toast({
        title: 'Failed to send test notification',
        description: String(error),
        variant: 'destructive',
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto" data-testid="modal-notification-preferences">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="title-notification-preferences">
            <Bell className="w-5 h-5" />
            Notification Preferences
          </DialogTitle>
          <DialogDescription>
            Choose which notifications you want to receive on your device
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-4">
              {permissionState !== 'granted' && isInitialized ? (
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="flex items-start gap-3">
                    <BellRing className="w-5 h-5 text-primary mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium">Enable Push Notifications</p>
                      <p className="text-sm text-muted-foreground mt-1 mb-3">
                        Get notified about messages, payments, and game reminders even when you're not in the app
                      </p>
                      <Button 
                        onClick={handleRequestPermission}
                        disabled={isRequestingPermission}
                        size="sm"
                        data-testid="button-enable-push"
                      >
                        {isRequestingPermission ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Requesting...
                          </>
                        ) : (
                          'Enable Notifications'
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : permissionState === 'denied' ? (
                <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-destructive mt-0.5" />
                    <div>
                      <p className="font-medium">Notifications Blocked</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        You've blocked notifications. To enable them, go to your browser settings.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                  <div className="flex-1">
                    <p className="font-medium">Push Notifications</p>
                    <p className="text-sm text-muted-foreground">
                      {playerId ? 'Push notifications are enabled on this device' : 'Enable push notifications on this device'}
                    </p>
                  </div>
                  <Switch
                    checked={pushEnabled}
                    onCheckedChange={handlePushEnabledChange}
                    data-testid="switch-push-enabled"
                  />
                </div>
              )}

              {pushEnabled && playerId && (
                <div className="p-4 rounded-lg bg-muted/50 border">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Test Push Notifications</p>
                      <p className="text-xs text-muted-foreground">Send a test notification to this device</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testNotificationMutation.mutate()}
                      disabled={testNotificationMutation.isPending}
                      data-testid="button-test-notification"
                    >
                      {testNotificationMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-1" />
                          Send Test
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              <div className="border-t pt-4">
                <p className="text-sm font-medium text-muted-foreground mb-3">
                  Notification Types
                </p>
                <div className="space-y-3">
                  {NOTIFICATION_TYPES.map((type) => {
                    const Icon = type.icon;
                    return (
                      <div
                        key={type.key}
                        className="flex items-center justify-between p-3 rounded-lg border bg-card"
                        data-testid={`notification-type-${type.key}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <Icon className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{type.label}</p>
                            <p className="text-xs text-muted-foreground">{type.description}</p>
                          </div>
                        </div>
                        <Switch
                          checked={settings[type.key]}
                          onCheckedChange={(value) => handleSettingChange(type.key, value)}
                          disabled={!pushEnabled}
                          data-testid={`switch-${type.key}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
                data-testid="button-cancel-notifications"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={!hasChanges || updateMutation.isPending}
                className="flex-1"
                data-testid="button-save-notifications"
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Preferences'
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
