import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/context/SubscriptionContext';
import { queryClient } from '@/lib/queryClient';
import { Shield, Crown, Star, Users, ChevronDown, ChevronUp } from 'lucide-react';
import type { User, LeagueMembership } from '@shared/schema';
import type { UserRole, SpecialPermission } from '@/context/SubscriptionContext';

interface UserWithPermissions extends User {
  role: UserRole;
  specialPermissions: SpecialPermission[] | null;
  isPrimaryCommissioner: boolean;
}

interface LeagueMemberWithUser extends LeagueMembership {
  user: User;
}

const roleDisplayNames = {
  free_tier: 'Free Tier',
  player_pro: 'Player Pro',
  secondary_commissioner: 'Secondary Commissioner',
  commissioner: 'Commissioner'
};

const roleColors = {
  free_tier: 'bg-gray-500',
  player_pro: 'bg-blue-500',
  secondary_commissioner: 'bg-purple-500',
  commissioner: 'bg-gold-500'
};

export function CommissionerDashboard() {
  const { toast } = useToast();
  const { canManageLeague, canManageLeagueSpecific, user, role, specialPermissions, isPrimaryCommissioner } = usePermissions();
  const [expandedLeagues, setExpandedLeagues] = useState<Set<string>>(new Set());

  // Get current user's leagues for league-specific management
  const { data: userLeagues = [] } = useQuery<any[]>({
    queryKey: ['/api/user/leagues'],
  });

  // Update league-specific user permissions mutation
  const updateLeaguePermissionsMutation = useMutation({
    mutationFn: async ({ userId, leagueId, leagueRole, leagueSpecialPermissions }: {
      userId: string;
      leagueId: string;
      leagueRole?: string;
      leagueSpecialPermissions?: string[];
    }) => {
      const response = await fetch(`/api/leagues/${leagueId}/users/${userId}/permissions`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ leagueRole, leagueSpecialPermissions })
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      return response.json();
    },
    onSuccess: (_, { leagueId }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/leagues', leagueId, 'users'] });
      toast({
        title: 'Success',
        description: 'League permissions updated successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update league permissions',
        variant: 'destructive',
      });
    }
  });

  const toggleLeagueExpansion = (leagueId: string) => {
    const newExpanded = new Set(expandedLeagues);
    if (newExpanded.has(leagueId)) {
      newExpanded.delete(leagueId);
    } else {
      newExpanded.add(leagueId);
    }
    setExpandedLeagues(newExpanded);
  };

  const handleRoleUpdate = (userId: string, leagueId: string, newRole: string, currentSpecialPermissions?: string[]) => {
    updateLeaguePermissionsMutation.mutate({ 
      userId, 
      leagueId, 
      leagueRole: newRole, 
      leagueSpecialPermissions: currentSpecialPermissions 
    });
  };

  const handleSpecialPermissionToggle = (userId: string, leagueId: string, permission: string, currentRole: string, currentSpecialPermissions: string[] = []) => {
    const newSpecialPermissions = currentSpecialPermissions.includes(permission)
      ? currentSpecialPermissions.filter(p => p !== permission)
      : [...currentSpecialPermissions, permission];
    
    updateLeaguePermissionsMutation.mutate({ 
      userId, 
      leagueId, 
      leagueRole: currentRole, 
      leagueSpecialPermissions: newSpecialPermissions 
    });
  };

  const getRoleIcon = (membership: LeagueMemberWithUser) => {
    const leagueSpecialPermissions = membership.leagueSpecialPermissions || [];
    if (leagueSpecialPermissions.includes('admin')) return <Shield className="h-4 w-4 text-red-500" />;
    if (leagueSpecialPermissions.includes('stat_manager')) return <Star className="h-4 w-4 text-green-500" />;
    return <Users className="h-4 w-4 text-gray-500" />;
  };

  // Check if user has global permissions or league-specific management permissions
  const hasGlobalAccess = canManageLeague();
  const hasLeagueSpecificAccess = userLeagues.some((league: any) => canManageLeagueSpecific(league.id));
  const hasAccess = hasGlobalAccess || hasLeagueSpecificAccess;

  if (!hasAccess) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex items-center justify-center p-8">
            <div className="text-center">
              <Shield className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h2 className="text-2xl font-semibold mb-2">Access Restricted</h2>
              <p className="text-gray-600">You don't have permission to access the Commissioner Dashboard.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8" />
            Commissioner Dashboard
          </h1>
          <p className="text-gray-600 mt-2">Manage users, roles, and permissions</p>
        </div>
        <Badge variant="outline" className="flex items-center gap-2">
          {isPrimaryCommissioner ? <Crown className="h-4 w-4 text-yellow-500" /> :
           specialPermissions?.includes('admin') ? <Shield className="h-4 w-4 text-red-500" /> :
           specialPermissions?.includes('stat_manager') ? <Star className="h-4 w-4 text-green-500" /> :
           <Users className="h-4 w-4 text-gray-500" />}
          {isPrimaryCommissioner ? 'Primary Commissioner' : 
           specialPermissions?.includes('admin') ? 'Admin' :
           roleDisplayNames[role] || 'Unknown'}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>League-Specific User Management</CardTitle>
        </CardHeader>
        <CardContent className="p-6 pl-[2px] pr-[2px] pt-[2px] pb-[2px]">
          <p className="text-gray-600 mb-4 sm:mb-6 text-sm sm:text-base px-2">
            Manage users within your leagues. Click on a league to expand and manage user roles and permissions.
          </p>
          <div className="space-y-3 sm:space-y-4 px-2">
            {userLeagues.map((league: any) => (
              <LeagueUserManagement 
                key={league.id} 
                league={league}
                isExpanded={expandedLeagues.has(league.id)}
                onToggleExpansion={() => toggleLeagueExpansion(league.id)}
                onRoleUpdate={handleRoleUpdate}
                onSpecialPermissionToggle={handleSpecialPermissionToggle}
                getRoleIcon={getRoleIcon}
                roleDisplayNames={roleDisplayNames}
                roleColors={roleColors}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Component for managing users within a specific league
function LeagueUserManagement({ 
  league, 
  isExpanded, 
  onToggleExpansion, 
  onRoleUpdate, 
  onSpecialPermissionToggle, 
  getRoleIcon, 
  roleDisplayNames, 
  roleColors 
}: {
  league: any;
  isExpanded: boolean;
  onToggleExpansion: () => void;
  onRoleUpdate: (userId: string, leagueId: string, newRole: string, currentSpecialPermissions?: string[]) => void;
  onSpecialPermissionToggle: (userId: string, leagueId: string, permission: string, currentRole: string, currentSpecialPermissions?: string[]) => void;
  getRoleIcon: (membership: LeagueMemberWithUser) => JSX.Element;
  roleDisplayNames: Record<string, string>;
  roleColors: Record<string, string>;
}) {
  // Get league users with permissions
  const { data: leagueUsers = [], isLoading } = useQuery<LeagueMemberWithUser[]>({
    queryKey: ['/api/leagues', league.id, 'users'],
    enabled: isExpanded,
  });

  return (
    <Card className="border-l-4 border-l-blue-500 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h3 className="font-semibold text-lg" data-testid={`league-name-${league.id}`}>
              {league.name}
            </h3>
            <Badge variant="outline" className="text-sm">
              {league.sport}
            </Badge>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onToggleExpansion}
            data-testid={`button-toggle-league-${league.id}`}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {isExpanded ? 'Collapse' : 'Manage Users'}
          </Button>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0 px-2 sm:px-6">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">
              Loading league members...
            </div>
          ) : leagueUsers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No members found in this league.
            </div>
          ) : (
            <div className="space-y-4 w-full overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-medium text-sm text-gray-700">
                  League Members ({leagueUsers.length})
                </h4>
              </div>
              
              <div className="space-y-3 w-full">
                {leagueUsers.map((membership) => (
                  <div key={membership.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-2 sm:p-4 border rounded-lg space-y-3 sm:space-y-0 w-full overflow-hidden">
                    <div className="flex items-center space-x-2 sm:space-x-4 min-w-0 flex-shrink">
                      {getRoleIcon(membership)}
                      <div>
                        <p className="font-medium" data-testid={`user-name-${membership.user.id}`}>
                          {membership.user.firstName} {membership.user.lastName}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2 w-full sm:w-auto flex-shrink-0">
                      <Button 
                        size="sm"
                        className="w-full sm:w-auto text-xs sm:text-sm"
                        onClick={() => onSpecialPermissionToggle(
                          membership.user.id, 
                          league.id, 
                          'admin', 
                          membership.leagueRole || 'free_tier', 
                          membership.leagueSpecialPermissions || []
                        )}
                        variant="outline"
                        data-testid={`button-toggle-league-admin-${membership.user.id}`}
                      >
                        {membership.leagueSpecialPermissions?.includes('admin') ? 'Remove Admin' : 'Make Admin'}
                      </Button>
                      
                      <Button 
                        size="sm"
                        className="w-full sm:w-auto text-xs sm:text-sm"
                        onClick={() => onSpecialPermissionToggle(
                          membership.user.id, 
                          league.id, 
                          'stat_manager', 
                          membership.leagueRole || 'free_tier', 
                          membership.leagueSpecialPermissions || []
                        )}
                        variant="outline"
                        data-testid={`button-toggle-league-stat-manager-${membership.user.id}`}
                      >
                        {membership.leagueSpecialPermissions?.includes('stat_manager') ? 'Remove Stat Manager' : 'Make Stat Manager'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}