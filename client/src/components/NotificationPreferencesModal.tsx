import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Bell, Loader2, BellRing, AlertCircle, Send, CheckCircle2, MessageSquare, CreditCard, Users, Calendar, Newspaper, UserPlus } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

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
  oneSignalExternalId: string | null;
}

interface NotificationPreferencesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const defaultSettings: NotificationSettings = {
  inAppMessages: true,
  paymentRequests: true,
  substitutionRequests: true,
  joinRequests: true,
  upcomingEvents: true,
  newsAnnouncements: true,
};

export function NotificationPreferencesModal({ open, onOpenChange }: NotificationPreferencesModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // OneSignal hook removed - will be re-implemented
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [localSettings, setLocalSettings] = useState<NotificationSettings>(defaultSettings);

  const { data: preferences, isLoading, refetch } = useQuery<NotificationPreferences>({
    queryKey: ['/api/notification-preferences'],
    enabled: open,
    refetchInterval: 3000,
  });

  useEffect(() => {
    if (preferences?.notificationSettings) {
      setLocalSettings(preferences.notificationSettings);
    }
  }, [preferences?.notificationSettings]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (settings: NotificationSettings) => {
      const response = await apiRequest('PUT', '/api/notification-preferences', { notificationSettings: settings });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notification-preferences'] });
    },
    onError: (error) => {
      toast({
        title: 'Failed to update preferences',
        description: String(error),
        variant: 'destructive',
      });
    },
  });

  const handleToggle = (key: keyof NotificationSettings) => {
    const newSettings = { ...localSettings, [key]: !localSettings[key] };
    setLocalSettings(newSettings);
    updateSettingsMutation.mutate(newSettings);
  };

  const handleRequestPermission = async () => {
    setIsRequestingPermission(true);
    try {
      // OneSignal removed - will be re-implemented
      toast({ title: 'Push notifications not yet implemented' });
    } catch (error) {
      toast({ title: 'Failed to request permission', variant: 'destructive' });
    } finally {
      setIsRequestingPermission(false);
    }
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

  // Determine notification status
  const hasPlayerId = false; // OneSignal removed
  const hasExternalId = false; // OneSignal removed
  const isPushEnabled = !!preferences?.pushEnabled;
  const isFullySetUp = false; // OneSignal removed
  const canSendTest = false; // OneSignal removed
  const permissionState = 'default'; // OneSignal removed
  const isInitialized = false; // OneSignal removed
  const isWebPush = false; // OneSignal removed
  const displayId = null; // OneSignal removed

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto" data-testid="modal-notification-preferences">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="title-notification-preferences">
            <Bell className="w-5 h-5" />
            Push Notifications
          </DialogTitle>
          <DialogDescription>
            Get notified about messages, payments, games, and more
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Status display */}
            {isFullySetUp ? (
              <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-green-700 dark:text-green-400">All Notifications Enabled</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      You'll receive push notifications for messages, payments, game reminders, join requests, and announcements.
                    </p>
                  </div>
                </div>
              </div>
            ) : hasPlayerId && !hasExternalId ? (
              <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                <div className="flex items-start gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-yellow-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-yellow-700 dark:text-yellow-400">Linking Your Account</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      OneSignal ID saved. Waiting for External ID to link... This may take a few moments.
                    </p>
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
                      Notifications are blocked. Please enable them in your device settings and try again.
                    </p>
                  </div>
                </div>
              </div>
            ) : !isInitialized && !hasPlayerId ? (
              <div className="p-4 rounded-lg bg-muted/50 border">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Waiting for notification SDK...</p>
                </div>
              </div>
            ) : permissionState !== 'granted' && !hasPlayerId ? (
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                <div className="flex items-start gap-3">
                  <BellRing className="w-5 h-5 text-primary mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium">Enable Push Notifications</p>
                    <p className="text-sm text-muted-foreground mt-1 mb-3">
                      Get notified about messages, payments, and game reminders even when you're not in the app.
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
                          Enabling...
                        </>
                      ) : (
                        'Enable Notifications'
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Notification type toggles */}
            {(isFullySetUp || hasPlayerId) && (
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Notification Types</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-muted-foreground" />
                      <Label htmlFor="toggle-messages" className="text-sm cursor-pointer">Messages</Label>
                    </div>
                    <Switch
                      id="toggle-messages"
                      checked={localSettings.inAppMessages}
                      onCheckedChange={() => handleToggle('inAppMessages')}
                      data-testid="toggle-messages"
                    />
                  </div>
                  <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-muted-foreground" />
                      <Label htmlFor="toggle-payments" className="text-sm cursor-pointer">Payment Requests</Label>
                    </div>
                    <Switch
                      id="toggle-payments"
                      checked={localSettings.paymentRequests}
                      onCheckedChange={() => handleToggle('paymentRequests')}
                      data-testid="toggle-payments"
                    />
                  </div>
                  <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <Label htmlFor="toggle-subs" className="text-sm cursor-pointer">Substitution Requests</Label>
                    </div>
                    <Switch
                      id="toggle-subs"
                      checked={localSettings.substitutionRequests}
                      onCheckedChange={() => handleToggle('substitutionRequests')}
                      data-testid="toggle-subs"
                    />
                  </div>
                  <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2">
                      <UserPlus className="w-4 h-4 text-muted-foreground" />
                      <Label htmlFor="toggle-joins" className="text-sm cursor-pointer">Join Requests</Label>
                    </div>
                    <Switch
                      id="toggle-joins"
                      checked={localSettings.joinRequests}
                      onCheckedChange={() => handleToggle('joinRequests')}
                      data-testid="toggle-joins"
                    />
                  </div>
                  <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <Label htmlFor="toggle-events" className="text-sm cursor-pointer">Schedule Reminders</Label>
                    </div>
                    <Switch
                      id="toggle-events"
                      checked={localSettings.upcomingEvents}
                      onCheckedChange={() => handleToggle('upcomingEvents')}
                      data-testid="toggle-events"
                    />
                  </div>
                  <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Newspaper className="w-4 h-4 text-muted-foreground" />
                      <Label htmlFor="toggle-news" className="text-sm cursor-pointer">News & Announcements</Label>
                    </div>
                    <Switch
                      id="toggle-news"
                      checked={localSettings.newsAnnouncements}
                      onCheckedChange={() => handleToggle('newsAnnouncements')}
                      data-testid="toggle-news"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Test notification button - show when we have a Player ID in DB */}
            {canSendTest && (
              <div className="p-4 rounded-lg bg-muted/50 border">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Test Notifications</p>
                    <p className="text-xs text-muted-foreground">Send a test notification to verify everything works</p>
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

            {/* Debug section - shows SDK status */}
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-xs font-mono">
              <p><strong>Debug Info:</strong></p>
              <p>Mode: {isWebPush ? '🌐 Web Push' : '📱 Native App'}</p>
              <p>SDK Initialized: {isInitialized ? '✅ Yes' : '❌ No'}</p>
              <p>Permission: {permissionState}</p>
              <p>OneSignal ID (SDK): {playerId || 'Not set'}</p>
              <p>OneSignal ID (DB): {preferences?.oneSignalPlayerId || 'Not saved'}</p>
              <p>External ID (SDK): {externalIdSet ? '✅ Set' : '❌ Not set'}</p>
              <p>External ID (DB): {preferences?.oneSignalExternalId || 'Not linked'}</p>
              <p>Display ID: {displayId || 'Loading...'}</p>
              <p>Push Enabled: {preferences?.pushEnabled ? 'Yes' : 'No'}</p>
            </div>

            {/* Close button */}
            <div className="pt-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="w-full"
                data-testid="button-close-notifications"
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
