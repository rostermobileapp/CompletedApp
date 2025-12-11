import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useOneSignal } from '@/hooks/useOneSignal';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Bell, Loader2, BellRing, AlertCircle, Send, CheckCircle2 } from 'lucide-react';

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

export function NotificationPreferencesModal({ open, onOpenChange }: NotificationPreferencesModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isInitialized, permissionState, requestPermission, playerId, externalIdSet, displayId } = useOneSignal();
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);

  const { data: preferences, isLoading, refetch } = useQuery<NotificationPreferences>({
    queryKey: ['/api/notification-preferences'],
    enabled: open,
    refetchInterval: 3000, // Poll every 3 seconds to catch External ID updates
  });

  const handleRequestPermission = async () => {
    setIsRequestingPermission(true);
    try {
      const granted = await requestPermission();
      if (granted) {
        toast({ title: 'Push notifications enabled!' });
        queryClient.invalidateQueries({ queryKey: ['/api/notification-preferences'] });
      } else {
        toast({ 
          title: 'Permission denied', 
          description: 'You can enable notifications later in your device settings.',
          variant: 'destructive' 
        });
      }
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

  // Determine if notifications are fully set up
  const isFullySetUp = preferences?.oneSignalExternalId && preferences?.oneSignalPlayerId && preferences?.pushEnabled;

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
            ) : !isInitialized ? (
              <div className="p-4 rounded-lg bg-muted/50 border">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Initializing notification system...</p>
                </div>
              </div>
            ) : permissionState !== 'granted' ? (
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
            ) : !preferences?.oneSignalExternalId ? (
              <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                <div className="flex items-start gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-yellow-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-yellow-700 dark:text-yellow-400">Setting Up Notifications</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Please wait while we connect your account to the notification system. This may take a few moments...
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Test notification button - only show when fully set up */}
            {isFullySetUp && (
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
