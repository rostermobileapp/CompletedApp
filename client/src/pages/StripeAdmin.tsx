import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/context/SubscriptionContext';
import {
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
  Search,
  User,
  CreditCard,
  Database,
  TrendingUp,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useLocation } from 'wouter';

type DiagnosticData = {
  database: {
    userId: string;
    email: string | null;
    name: string;
    currentRole: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
  };
  stripe: {
    customer: {
      id: string;
      email: string | null;
      name: string | null;
      deleted: boolean;
    } | null;
    subscriptions: Array<{
      id: string;
      status: string;
      cancelAtPeriodEnd: boolean;
      currentPeriodEnd: number;
      priceId: string;
      productName: string | null;
    }>;
    activeSubscription: {
      id: string;
      status: string;
      cancelAtPeriodEnd: boolean;
      priceId: string;
    } | null;
  };
  sync: {
    inSync: boolean;
    issues: string[];
    recommendations: string[];
    expectedRole?: string;
  };
};

export default function StripeAdmin() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const { hasSpecialPermission } = usePermissions();
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState('');
  const [searchTriggered, setSearchTriggered] = useState(false);

  // Check if user has admin permission
  const isAdmin = hasSpecialPermission('admin');

  // Fetch diagnostic data
  const { data: diagnostic, isLoading: isLoadingDiagnostic, error: diagnosticError } = useQuery<DiagnosticData>({
    queryKey: ['/api/admin/stripe/diagnose', userId],
    enabled: searchTriggered && !!userId,
  });

  // Force sync mutation
  const forceSyncMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      const response = await apiRequest('POST', `/api/admin/stripe/force-sync/${targetUserId}`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Sync successful",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stripe/diagnose', userId] });
    },
    onError: (error: any) => {
      toast({
        title: "Sync failed",
        description: error.message || "Failed to sync subscription",
        variant: "destructive",
      });
    },
  });

  const handleSearch = () => {
    if (!userId.trim()) {
      toast({
        title: "User ID required",
        description: "Please enter a user ID to search",
        variant: "destructive",
      });
      return;
    }
    setSearchTriggered(true);
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background p-4">
        <Alert variant="destructive" data-testid="alert-no-permission">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You do not have permission to access this page. Admin privileges required.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24 dark:bg-black" data-testid="page-stripe-admin">
      <div className="max-w-6xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/dashboard')}
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground dark:text-white">Stripe Admin</h1>
              <p className="text-sm text-muted-foreground dark:text-gray-400">
                Diagnose and fix Stripe subscription sync issues
              </p>
            </div>
          </div>
        </div>

        {/* Search Section */}
        <Card data-testid="card-search">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              User Lookup
            </CardTitle>
            <CardDescription>
              Enter a user ID to check their Stripe subscription status
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="userId">User ID</Label>
                <Input
                  id="userId"
                  data-testid="input-user-id"
                  placeholder="Enter user ID (e.g., 47228516)"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSearch();
                    }
                  }}
                />
              </div>
              <div className="self-end">
                <Button
                  onClick={handleSearch}
                  disabled={!userId.trim()}
                  data-testid="button-search"
                >
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </Button>
              </div>
            </div>

            {diagnosticError && (
              <Alert variant="destructive" data-testid="alert-error">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {(diagnosticError as any).message || "Failed to fetch diagnostic data"}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Diagnostic Results */}
        {isLoadingDiagnostic && (
          <div className="flex items-center justify-center py-12" data-testid="loading-diagnostic">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {diagnostic && (
          <div className="space-y-6">
            {/* Sync Status Overview */}
            <Card data-testid="card-sync-status">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {diagnostic.sync.inSync ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  )}
                  Sync Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {diagnostic.sync.inSync ? (
                  <Alert data-testid="alert-in-sync">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <AlertDescription>
                      Database and Stripe are in sync. No issues detected.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <Alert variant="destructive" data-testid="alert-out-of-sync">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Database and Stripe are out of sync
                      </AlertDescription>
                    </Alert>

                    {diagnostic.sync.issues.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm text-foreground dark:text-white">Issues Detected:</h4>
                        <ul className="list-disc list-inside space-y-1">
                          {diagnostic.sync.issues.map((issue, idx) => (
                            <li key={idx} className="text-sm text-muted-foreground dark:text-gray-400" data-testid={`issue-${idx}`}>
                              {issue}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {diagnostic.sync.recommendations.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm text-foreground dark:text-white">Recommendations:</h4>
                        <ul className="list-disc list-inside space-y-1">
                          {diagnostic.sync.recommendations.map((rec, idx) => (
                            <li key={idx} className="text-sm text-muted-foreground dark:text-gray-400" data-testid={`recommendation-${idx}`}>
                              {rec}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <Button
                      onClick={() => forceSyncMutation.mutate(userId)}
                      disabled={forceSyncMutation.isPending}
                      className="w-full"
                      data-testid="button-force-sync"
                    >
                      {forceSyncMutation.isPending ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Syncing...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Force Sync Now
                        </>
                      )}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Database Status */}
            <Card data-testid="card-database">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Database Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground dark:text-gray-400">User ID</Label>
                    <p className="font-mono text-sm" data-testid="text-db-user-id">{diagnostic.database.userId}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground dark:text-gray-400">Email</Label>
                    <p className="text-sm" data-testid="text-db-email">{diagnostic.database.email || 'N/A'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground dark:text-gray-400">Name</Label>
                    <p className="text-sm" data-testid="text-db-name">{diagnostic.database.name || 'N/A'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground dark:text-gray-400">Current Role</Label>
                    <Badge data-testid="badge-db-role">{diagnostic.database.currentRole}</Badge>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground dark:text-gray-400">Stripe Customer ID</Label>
                    <p className="font-mono text-xs" data-testid="text-db-customer-id">{diagnostic.database.stripeCustomerId || 'None'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground dark:text-gray-400">Subscription ID</Label>
                    <p className="font-mono text-xs" data-testid="text-db-subscription-id">{diagnostic.database.stripeSubscriptionId || 'None'}</p>
                  </div>
                </div>

                {diagnostic.sync.expectedRole && diagnostic.sync.expectedRole !== diagnostic.database.currentRole && (
                  <Alert variant="destructive" data-testid="alert-role-mismatch">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Expected role: <strong>{diagnostic.sync.expectedRole}</strong> but database shows: <strong>{diagnostic.database.currentRole}</strong>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Stripe Status */}
            <Card data-testid="card-stripe">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Stripe Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {diagnostic.stripe.customer ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground dark:text-gray-400">Customer ID</Label>
                        <p className="font-mono text-xs" data-testid="text-stripe-customer-id">{diagnostic.stripe.customer.id}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground dark:text-gray-400">Email</Label>
                        <p className="text-sm" data-testid="text-stripe-email">{diagnostic.stripe.customer.email || 'N/A'}</p>
                      </div>
                    </div>

                    {diagnostic.stripe.activeSubscription ? (
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm text-foreground dark:text-white">Active Subscription:</h4>
                        <div className="bg-muted dark:bg-gray-800 p-3 rounded-md space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground dark:text-gray-400">Subscription ID</span>
                            <span className="font-mono text-xs" data-testid="text-active-subscription-id">{diagnostic.stripe.activeSubscription.id}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground dark:text-gray-400">Status</span>
                            <Badge data-testid="badge-subscription-status">{diagnostic.stripe.activeSubscription.status}</Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground dark:text-gray-400">Cancel at Period End</span>
                            <Badge variant={diagnostic.stripe.activeSubscription.cancelAtPeriodEnd ? "destructive" : "secondary"} data-testid="badge-cancel-at-period-end">
                              {diagnostic.stripe.activeSubscription.cancelAtPeriodEnd ? 'Yes' : 'No'}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground dark:text-gray-400">Price ID</span>
                            <span className="font-mono text-xs" data-testid="text-price-id">{diagnostic.stripe.activeSubscription.priceId}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <Alert data-testid="alert-no-active-subscription">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          No active subscription found in Stripe
                        </AlertDescription>
                      </Alert>
                    )}

                    {diagnostic.stripe.subscriptions.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm text-foreground dark:text-white">All Subscriptions ({diagnostic.stripe.subscriptions.length}):</h4>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {diagnostic.stripe.subscriptions.map((sub, idx) => (
                            <div key={sub.id} className="bg-muted dark:bg-gray-800 p-2 rounded-md text-xs" data-testid={`subscription-${idx}`}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-mono">{sub.id}</span>
                                <Badge variant={sub.status === 'active' ? 'default' : 'secondary'}>{sub.status}</Badge>
                              </div>
                              {sub.cancelAtPeriodEnd && (
                                <div className="text-yellow-600 dark:text-yellow-400">⚠️ Cancels at period end</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <Alert data-testid="alert-no-customer">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>
                      No Stripe customer found for this user
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
