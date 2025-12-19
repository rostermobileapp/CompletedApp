import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useNativelyNotifications } from '@/hooks/useNativelyNotifications';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { 
  Bell, 
  Loader2, 
  BellRing, 
  AlertCircle, 
  Send, 
  CheckCircle2, 
  MessageSquare, 
  CreditCard, 
  Users, 
  Calendar, 
  Newspaper, 
  UserPlus,
  Smartphone,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
  const { 
    isInitialized, 
    isNativelyApp,
    playerId, 
    displayId,
    externalIdSet, 
    permissionState, 
    requestPermission 
  } = useNativelyNotifications();
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [localSettings, setLocalSettings] = useState<NotificationSettings>(defaultSettings);
  const [showDebug, setShowDebug] = useState(false);

  const { data: preferences, isLoading } = useQuery<NotificationPreferences>({
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
      toast({ title: 'Preferences saved' });
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
      const granted = await requestPermission();
      if (granted) {
        toast({ title: 'Push notifications enabled!' });
        queryClient.invalidateQueries({ queryKey: ['/api/notification-preferences'] });
      } else {
        toast({ 
          title: 'Permission not granted', 
          description: 'Please enable notifications in your device settings.',
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
    mutationFn: async (type: string) => {
      const response = await apiRequest('POST', '/api/notification-preferences/test', { type });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ 
          title: 'Test notification sent!', 
          description: 'Check your device for the notification.' 
        });
      } else {
        toast({ 
          title: 'Could not send notification', 
          description: data.message || 'Please ensure push notifications are enabled.',
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
  const hasPlayerId = !!(playerId || preferences?.oneSignalPlayerId);
  const hasExternalId = !!(externalIdSet || preferences?.oneSignalExternalId);
  const isFullySetUp = hasPlayerId && hasExternalId && permissionState === 'granted';
  const canSendTest = !!preferences?.oneSignalPlayerId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" data-testid="modal-notification-preferences">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="title-notification-preferences">
            <Bell className="w-5 h-5" />
            Push Notifications
          </DialogTitle>
          <DialogDescription>
            Manage your notification preferences
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            
            {/* Status Card */}
            <Card className={isFullySetUp ? 'border-green-500/50 bg-green-500/5' : hasPlayerId ? 'border-yellow-500/50 bg-yellow-500/5' : 'border-primary/30 bg-primary/5'}>
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  {isFullySetUp ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  ) : hasPlayerId ? (
                    <Loader2 className="w-5 h-5 animate-spin text-yellow-600 mt-0.5 flex-shrink-0" />
                  ) : (
                    <BellRing className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    {isFullySetUp ? (
                      <>
                        <p className="font-medium text-green-700 dark:text-green-400">Push Notifications Active</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          You're all set to receive push notifications!
                        </p>
                      </>
                    ) : hasPlayerId ? (
                      <>
                        <p className="font-medium text-yellow-700 dark:text-yellow-400">Setting Up...</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Linking your device. This may take a moment.
                        </p>
                      </>
                    ) : isNativelyApp && isInitialized ? (
                      <>
                        <p className="font-medium">Enable Push Notifications</p>
                        <p className="text-sm text-muted-foreground mt-1 mb-3">
                          Tap the button below to enable notifications on this device.
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
                            <>
                              <Bell className="w-4 h-4 mr-2" />
                              Enable Notifications
                            </>
                          )}
                        </Button>
                      </>
                    ) : (
                      <>
                        <p className="font-medium">Push Notifications</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          <Smartphone className="w-4 h-4 inline mr-1" />
                          Open this app on your mobile device to enable push notifications.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Notification Type Toggles - Always visible */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Notification Types</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="w-4 h-4 text-blue-500" />
                    <Label htmlFor="toggle-messages" className="text-sm cursor-pointer font-normal">Messages</Label>
                  </div>
                  <Switch
                    id="toggle-messages"
                    checked={localSettings.inAppMessages}
                    onCheckedChange={() => handleToggle('inAppMessages')}
                    data-testid="toggle-messages"
                  />
                </div>
                
                <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <CreditCard className="w-4 h-4 text-green-500" />
                    <Label htmlFor="toggle-payments" className="text-sm cursor-pointer font-normal">Payment Requests</Label>
                  </div>
                  <Switch
                    id="toggle-payments"
                    checked={localSettings.paymentRequests}
                    onCheckedChange={() => handleToggle('paymentRequests')}
                    data-testid="toggle-payments"
                  />
                </div>
                
                <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <Users className="w-4 h-4 text-orange-500" />
                    <Label htmlFor="toggle-subs" className="text-sm cursor-pointer font-normal">Substitution Requests</Label>
                  </div>
                  <Switch
                    id="toggle-subs"
                    checked={localSettings.substitutionRequests}
                    onCheckedChange={() => handleToggle('substitutionRequests')}
                    data-testid="toggle-subs"
                  />
                </div>
                
                <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <UserPlus className="w-4 h-4 text-purple-500" />
                    <Label htmlFor="toggle-joins" className="text-sm cursor-pointer font-normal">Join Requests</Label>
                  </div>
                  <Switch
                    id="toggle-joins"
                    checked={localSettings.joinRequests}
                    onCheckedChange={() => handleToggle('joinRequests')}
                    data-testid="toggle-joins"
                  />
                </div>
                
                <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-red-500" />
                    <Label htmlFor="toggle-events" className="text-sm cursor-pointer font-normal">Game Reminders</Label>
                  </div>
                  <Switch
                    id="toggle-events"
                    checked={localSettings.upcomingEvents}
                    onCheckedChange={() => handleToggle('upcomingEvents')}
                    data-testid="toggle-events"
                  />
                </div>
                
                <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <Newspaper className="w-4 h-4 text-cyan-500" />
                    <Label htmlFor="toggle-news" className="text-sm cursor-pointer font-normal">Announcements</Label>
                  </div>
                  <Switch
                    id="toggle-news"
                    checked={localSettings.newsAnnouncements}
                    onCheckedChange={() => handleToggle('newsAnnouncements')}
                    data-testid="toggle-news"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Test Notifications Card - Show when we can send tests */}
            {canSendTest && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Test Notifications</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-3">
                    Send a test notification to verify everything is working.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testNotificationMutation.mutate('message')}
                      disabled={testNotificationMutation.isPending}
                      data-testid="button-test-message"
                    >
                      {testNotificationMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <MessageSquare className="w-4 h-4 mr-1" />
                          Message
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testNotificationMutation.mutate('payment')}
                      disabled={testNotificationMutation.isPending}
                      data-testid="button-test-payment"
                    >
                      <CreditCard className="w-4 h-4 mr-1" />
                      Payment
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testNotificationMutation.mutate('reminder')}
                      disabled={testNotificationMutation.isPending}
                      data-testid="button-test-reminder"
                    >
                      <Calendar className="w-4 h-4 mr-1" />
                      Reminder
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Debug Section - Collapsible */}
            <div className="border rounded-lg">
              <button
                onClick={() => setShowDebug(!showDebug)}
                className="w-full flex items-center justify-between p-3 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
              >
                <span>Debug Information</span>
                {showDebug ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {showDebug && (
                <div className="p-3 pt-0 text-xs font-mono space-y-1 border-t">
                  <p>📱 Natively App: {isNativelyApp ? '✅ Yes' : '❌ No'}</p>
                  <p>🔧 SDK Initialized: {isInitialized ? '✅ Yes' : '❌ No'}</p>
                  <p>🔔 Permission: {permissionState}</p>
                  <p>🆔 Player ID (SDK): {playerId || 'Not set'}</p>
                  <p>💾 Player ID (DB): {preferences?.oneSignalPlayerId || 'Not saved'}</p>
                  <p>🔗 External ID Set: {externalIdSet ? '✅ Yes' : '❌ No'}</p>
                  <p>📝 External ID (DB): {preferences?.oneSignalExternalId || 'Not linked'}</p>
                  <p>👤 Display ID: {displayId || 'Loading...'}</p>
                  <p>✅ Fully Set Up: {isFullySetUp ? 'Yes' : 'No'}</p>
                  <p>📤 Can Send Test: {canSendTest ? 'Yes' : 'No'}</p>
                </div>
              )}
            </div>

            {/* Close button */}
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="w-full"
              data-testid="button-close-notifications"
            >
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
