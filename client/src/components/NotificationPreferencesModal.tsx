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
  AlertCircle,
  Send,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  BellRing,
  UserCheck
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
  playerRsvpUpdates?: boolean;
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
  playerRsvpUpdates: true,
};

export function NotificationPreferencesModal({ open, onOpenChange }: NotificationPreferencesModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [localSettings, setLocalSettings] = useState<NotificationSettings>(defaultSettings);
  const [playerIdInput, setPlayerIdInput] = useState('');
  const [showManualLink, setShowManualLink] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);

  // Use the Natively hook
  const {
    isInitialized,
    isNativelyApp,
    isNativeSDK,
    playerId: sdkPlayerId,
    displayId,
    externalIdSet,
    permissionState,
    requestPermission,
    refreshDetection,
  } = useNativelyNotifications();

  // Fetch user data
  const { data: userData } = useQuery<{ displayId: string }>({
    queryKey: ['/api/user'],
    enabled: open,
  });

  // Check if user is a team captain
  const { data: captainTeams } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['/api/user/captain-teams'],
    enabled: open,
  });
  const isCaptain = (captainTeams?.length ?? 0) > 0;

  const { data: preferences, isLoading } = useQuery<NotificationPreferences>({
    queryKey: ['/api/notification-preferences'],
    enabled: open,
    refetchInterval: 3000, // Poll for updates
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
      setShowManualLink(false);
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

  const handleRequestPermission = async () => {
    setIsRequestingPermission(true);
    try {
      const granted = await requestPermission();
      if (granted) {
        toast({ title: '✅ Notifications enabled!' });
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

  const handleManualLink = () => {
    const trimmedId = playerIdInput.trim();
    if (!trimmedId) {
      toast({ title: 'Please enter a Player ID', variant: 'destructive' });
      return;
    }
    if (!/^[a-f0-9-]{32,}$/i.test(trimmedId)) {
      toast({ 
        title: 'Invalid format', 
        description: 'Player ID should be a UUID',
        variant: 'destructive' 
      });
      return;
    }
    linkPlayerIdMutation.mutate(trimmedId);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied!` });
  };

  const testNotificationMutation = useMutation({
    mutationFn: async (type: string) => {
      const response = await apiRequest('POST', '/api/notification-preferences/test', { type });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: '🔔 Test sent!', description: 'Check your device.' });
      } else {
        toast({ title: 'Could not send', description: data.message, variant: 'destructive' });
      }
    },
    onError: (error) => {
      toast({ title: 'Failed', description: String(error), variant: 'destructive' });
    },
  });

  // Determine status
  const hasPlayerId = !!(sdkPlayerId || preferences?.oneSignalPlayerId);
  const isFullySetUp = hasPlayerId && (externalIdSet || !!preferences?.oneSignalExternalId);
  const canSendTest = !!preferences?.oneSignalPlayerId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Push Notifications
          </DialogTitle>
          <DialogDescription>
            Get notified about messages, games, and more
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            
            {/* Status Card */}
            {isFullySetUp ? (
              <Card className="border-green-500/50 bg-green-500/5">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-green-700 dark:text-green-400">Notifications Active</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        You're all set to receive push notifications!
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : hasPlayerId && !isFullySetUp ? (
              <Card className="border-yellow-500/50 bg-yellow-500/5">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <Loader2 className="w-5 h-5 animate-spin text-yellow-600 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-yellow-700 dark:text-yellow-400">Setting Up...</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Linking your device. This may take a moment.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : isNativelyApp && isInitialized ? (
              // SDK is available - show enable button
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <BellRing className="w-5 h-5 text-primary flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium">Enable Notifications</p>
                      <p className="text-sm text-muted-foreground mt-1 mb-3">
                        Tap below to enable push notifications on this device.
                      </p>
                      <Button 
                        onClick={handleRequestPermission}
                        disabled={isRequestingPermission}
                        size="sm"
                      >
                        {isRequestingPermission ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enabling...</>
                        ) : (
                          <><Bell className="w-4 h-4 mr-2" />Enable Notifications</>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              // SDK not available - show manual link option
              <Card className="border-orange-500/50 bg-orange-500/5">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-orange-700 dark:text-orange-400">Link Your Device</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {isNativelyApp 
                          ? "SDK detected but not initialized. Try refreshing."
                          : "To receive notifications, link your device manually."}
                      </p>
                      <div className="flex gap-2 mt-3">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            const result = refreshDetection();
                            toast({ 
                              title: result ? 'SDK Found!' : 'SDK Not Found',
                              description: result ? 'Try enabling notifications now.' : 'Use manual linking below.'
                            });
                          }}
                        >
                          <RefreshCw className="w-4 h-4 mr-1" />
                          Refresh
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setShowManualLink(!showManualLink)}
                        >
                          Manual Link
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Manual Link Section */}
            {showManualLink && !hasPlayerId && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Manual Device Linking</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    <p>1. Open <a href="https://dashboard.onesignal.com" target="_blank" className="text-primary underline">OneSignal Dashboard</a></p>
                    <p>2. Go to Audience → Subscriptions</p>
                    <p>3. Find your device, copy the Player ID</p>
                    <p>4. Paste it below</p>
                  </div>
                  
                  <div className="flex gap-2">
                    <Input
                      placeholder="Player ID (UUID)"
                      value={playerIdInput}
                      onChange={(e) => setPlayerIdInput(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <Button 
                      onClick={handleManualLink}
                      disabled={linkPlayerIdMutation.isPending}
                    >
                      {linkPlayerIdMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Link'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Notification Type Toggles */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Notification Types</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {[
                  { key: 'inAppMessages', label: 'Messages', icon: MessageSquare, color: 'text-blue-500' },
                  { key: 'paymentRequests', label: 'Payments', icon: CreditCard, color: 'text-green-500' },
                  { key: 'substitutionRequests', label: 'Substitutions', icon: Users, color: 'text-orange-500' },
                  { key: 'joinRequests', label: 'Join Requests', icon: UserPlus, color: 'text-purple-500' },
                  { key: 'upcomingEvents', label: 'Game Reminders', icon: Calendar, color: 'text-red-500' },
                  { key: 'newsAnnouncements', label: 'Announcements', icon: Newspaper, color: 'text-cyan-500' },
                ].map(({ key, label, icon: Icon, color }) => (
                  <div key={key} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50">
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${color}`} />
                      <Label className="text-sm cursor-pointer font-normal">{label}</Label>
                    </div>
                    <Switch
                      checked={localSettings[key as keyof NotificationSettings]}
                      onCheckedChange={() => handleToggle(key as keyof NotificationSettings)}
                    />
                  </div>
                ))}
                
                {/* Captain-only: Player RSVP Updates */}
                {isCaptain && (
                  <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 border-t mt-2 pt-3">
                    <div className="flex items-center gap-3">
                      <UserCheck className="w-4 h-4 text-emerald-500" />
                      <div>
                        <Label className="text-sm cursor-pointer font-normal">Player RSVPs</Label>
                        <p className="text-xs text-muted-foreground">Captain only</p>
                      </div>
                    </div>
                    <Switch
                      checked={localSettings.playerRsvpUpdates ?? true}
                      onCheckedChange={() => handleToggle('playerRsvpUpdates')}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Test Notification */}
            {canSendTest && (
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Test Notification</p>
                      <p className="text-xs text-muted-foreground">Verify everything works</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testNotificationMutation.mutate('message')}
                      disabled={testNotificationMutation.isPending}
                    >
                      {testNotificationMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <><Send className="w-4 h-4 mr-1" />Send Test</>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Debug Section */}
            <div className="border rounded-lg">
              <button
                onClick={() => setShowDebug(!showDebug)}
                className="w-full flex items-center justify-between p-3 text-sm text-muted-foreground hover:bg-muted/50"
              >
                <span>Debug Info</span>
                {showDebug ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {showDebug && (
                <div className="p-3 pt-0 border-t text-xs font-mono space-y-1">
                  <p>OneSignal SDK: {isNativelyApp ? '✅' : '❌'}</p>
                  <p>SDK Type: {isNativeSDK ? 'Natively Native' : 'Web SDK'}</p>
                  <p>SDK Initialized: {isInitialized ? '✅' : '❌'}</p>
                  <p>Permission: {permissionState}</p>
                  <p>Player ID (SDK): {sdkPlayerId || 'none'}</p>
                  <p>Player ID (DB): {preferences?.oneSignalPlayerId || 'none'}</p>
                  <p>External ID Set: {externalIdSet ? '✅' : '❌'}</p>
                  <p>External ID (DB): {preferences?.oneSignalExternalId || 'none'}</p>
                  <p>Display ID: {displayId || userData?.displayId || 'loading...'}</p>
                  <p>window.OneSignal: {typeof (window as any).OneSignal}</p>
                  <p>window.natively: {typeof (window as any).natively}</p>
                  <p>window.NativelyNotifications: {typeof (window as any).NativelyNotifications}</p>
                  <p>nativelyLoaded: {String((window as any).nativelyLoaded)}</p>
                  <p>OneSignalReady: {(window as any).OneSignalReady ? '✅' : '❌'}</p>
                  <p className="text-xs text-muted-foreground">NPM: natively installed</p>
                  
                  {userData?.displayId && (
                    <div className="mt-2 p-2 bg-muted rounded">
                      <p className="text-muted-foreground mb-1">Your ID (for OneSignal External ID):</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 break-all text-xs">{userData.displayId}</code>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="h-6 px-2"
                          onClick={() => copyToClipboard(userData.displayId, 'ID')}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
