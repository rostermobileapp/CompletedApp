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
import { Input } from '@/components/ui/input';
import { 
  Bell, 
  Loader2, 
  CheckCircle2, 
  MessageSquare, 
  CreditCard, 
  Users, 
  Calendar, 
  Newspaper, 
  UserPlus,
  Copy,
  ExternalLink,
  AlertCircle,
  Send
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
  const [localSettings, setLocalSettings] = useState<NotificationSettings>(defaultSettings);
  const [playerIdInput, setPlayerIdInput] = useState('');
  const [isLinking, setIsLinking] = useState(false);

  // Fetch user data to get displayId
  const { data: userData } = useQuery<{ displayId: string }>({
    queryKey: ['/api/user'],
    enabled: open,
  });

  const { data: preferences, isLoading } = useQuery<NotificationPreferences>({
    queryKey: ['/api/notification-preferences'],
    enabled: open,
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

  const linkPlayerIdMutation = useMutation({
    mutationFn: async (playerId: string) => {
      const response = await apiRequest('POST', '/api/notification-preferences/player-id', { playerId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notification-preferences'] });
      toast({ title: '✅ Device linked successfully!' });
      setPlayerIdInput('');
    },
    onError: (error) => {
      toast({
        title: 'Failed to link device',
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

  const handleLinkPlayerId = () => {
    const trimmedId = playerIdInput.trim();
    if (!trimmedId) {
      toast({ title: 'Please enter a Player ID', variant: 'destructive' });
      return;
    }
    // Basic UUID validation
    if (!/^[a-f0-9-]{36}$/i.test(trimmedId)) {
      toast({ 
        title: 'Invalid Player ID format', 
        description: 'Player ID should be a UUID like: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        variant: 'destructive' 
      });
      return;
    }
    linkPlayerIdMutation.mutate(trimmedId);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied to clipboard` });
  };

  const testNotificationMutation = useMutation({
    mutationFn: async (type: string) => {
      const response = await apiRequest('POST', '/api/notification-preferences/test', { type });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ 
          title: '🔔 Test notification sent!', 
          description: 'Check your device for the notification.' 
        });
      } else {
        toast({ 
          title: 'Could not send notification', 
          description: data.message || 'Please make sure your device is linked.',
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

  const isLinked = !!preferences?.oneSignalPlayerId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" data-testid="modal-notification-preferences">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="title-notification-preferences">
            <Bell className="w-5 h-5" />
            Push Notifications
          </DialogTitle>
          <DialogDescription>
            Manage your push notification preferences
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            
            {/* Status Card */}
            {isLinked ? (
              <Card className="border-green-500/50 bg-green-500/5">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-green-700 dark:text-green-400">Device Linked</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Your device is set up to receive push notifications.
                      </p>
                      <p className="text-xs font-mono text-muted-foreground mt-2 break-all">
                        ID: {preferences?.oneSignalPlayerId?.substring(0, 18)}...
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-orange-500/50 bg-orange-500/5">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-orange-700 dark:text-orange-400">Link Your Device</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        To receive push notifications, you need to link your device using your OneSignal Player ID.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Link Device Section */}
            {!isLinked && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">How to Link Your Device</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-sm text-muted-foreground space-y-2">
                    <p><strong>Step 1:</strong> Open <a href="https://dashboard.onesignal.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">OneSignal Dashboard</a></p>
                    <p><strong>Step 2:</strong> Go to Audience → Subscriptions</p>
                    <p><strong>Step 3:</strong> Find your device and click on it</p>
                    <p><strong>Step 4:</strong> Copy the "Subscription ID" (Player ID)</p>
                    <p><strong>Step 5:</strong> Paste it below</p>
                  </div>
                  
                  <div className="flex gap-2">
                    <Input
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      value={playerIdInput}
                      onChange={(e) => setPlayerIdInput(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <Button 
                      onClick={handleLinkPlayerId}
                      disabled={linkPlayerIdMutation.isPending || !playerIdInput.trim()}
                    >
                      {linkPlayerIdMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Link'
                      )}
                    </Button>
                  </div>

                  {/* Your Display ID for reference */}
                  {userData?.displayId && (
                    <div className="p-2 bg-muted/50 rounded text-xs">
                      <p className="text-muted-foreground mb-1">Your User ID (for reference):</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 break-all">{userData.displayId}</code>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => copyToClipboard(userData.displayId, 'User ID')}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Notification Type Toggles */}
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
                  />
                </div>
              </CardContent>
            </Card>

            {/* Test Notifications - Only show when linked */}
            {isLinked && (
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
                </CardContent>
              </Card>
            )}

            {/* Unlink option */}
            {isLinked && (
              <div className="text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground text-xs"
                  onClick={() => {
                    // Clear the player ID
                    linkPlayerIdMutation.mutate('');
                  }}
                >
                  Unlink this device
                </Button>
              </div>
            )}

            {/* Close button */}
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="w-full"
            >
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
