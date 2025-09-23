import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePermissions } from '@/context/SubscriptionContext';
import { Shield, Crown, Star, Users } from 'lucide-react';
import type { User } from '@shared/schema';
import type { UserRole, SpecialPermission } from '@/context/SubscriptionContext';

interface UserWithPermissions extends User {
  role: UserRole;
  specialPermissions: SpecialPermission[] | null;
  isPrimaryCommissioner: boolean;
}

const roleDisplayNames = {
  free_tier: 'Free Tier',
  player_pro: 'Player Pro',
  secondary_commissioner: 'Secondary Commissioner',
  commissioner: 'Commissioner'
};

export function CommissionerDashboard() {
  const { canManageLeague, user, role, specialPermissions, isPrimaryCommissioner } = usePermissions();

  // Get current user's leagues for league-specific management
  const { data: userLeagues = [] } = useQuery<any[]>({
    queryKey: ['/api/user/leagues'],
  });


  const getRoleIcon = (user: UserWithPermissions) => {
    if (user.isPrimaryCommissioner) return <Crown className="h-4 w-4 text-yellow-500" />;
    if (user.specialPermissions?.includes('admin')) return <Shield className="h-4 w-4 text-red-500" />;
    if (user.specialPermissions?.includes('stat_manager')) return <Star className="h-4 w-4 text-green-500" />;
    return <Users className="h-4 w-4 text-gray-500" />;
  };

  if (!canManageLeague()) {
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
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8" />
            Commissioner Dashboard
          </h1>
          <p className="text-gray-600 mt-2">Manage users, roles, and permissions</p>
        </div>
        <Badge variant="outline" className="flex items-center gap-2">
          {getRoleIcon({ role, specialPermissions, isPrimaryCommissioner } as UserWithPermissions)}
          {isPrimaryCommissioner ? 'Primary Commissioner' : 
           specialPermissions?.includes('admin') ? 'Admin' :
           roleDisplayNames[role] || 'Unknown'}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>League-Specific User Management</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600">
            Manage users within your leagues. This section will show league memberships and allow you to manage roles within specific leagues.
          </p>
          <div className="mt-4 grid gap-4">
            {userLeagues.map((league: any) => (
              <Card key={league.id} className="p-4">
                <h3 className="font-semibold" data-testid={`league-name-${league.id}`}>{league.name}</h3>
                <p className="text-sm text-gray-600">League members management coming soon...</p>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}