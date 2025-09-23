import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/context/SubscriptionContext';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Users, Shield, Crown, Star } from 'lucide-react';
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

const roleColors = {
  free_tier: 'bg-gray-500',
  player_pro: 'bg-blue-500',
  secondary_commissioner: 'bg-purple-500',
  commissioner: 'bg-gold-500'
};

export function CommissionerDashboard() {
  const { toast } = useToast();
  const { canManageUsers, canManageLeague, user, role, specialPermissions, isPrimaryCommissioner } = usePermissions();
  const [selectedUserData, setSelectedUserData] = useState<{[userId: string]: {role: UserRole}}>({});
  const [activeTab, setActiveTab] = useState('all-users');

  // Get all users - only for admins/primary commissioners
  const { data: allUsers = [], isLoading: usersLoading } = useQuery<UserWithPermissions[]>({
    queryKey: ['/api/admin/users'],
    enabled: canManageUsers(),
  });

  // Get current user's leagues for league-specific management
  const { data: userLeagues = [] } = useQuery<any[]>({
    queryKey: ['/api/user/leagues'],
  });

  // Update user permissions mutation
  const updatePermissionsMutation = useMutation({
    mutationFn: async ({ userId, role, specialPermissions, isPrimaryCommissioner }: {
      userId: string;
      role: string;
      specialPermissions?: string[];
      isPrimaryCommissioner?: boolean;
    }) => {
      const response = await fetch(`/api/admin/users/${userId}/permissions`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role, specialPermissions, isPrimaryCommissioner })
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({
        title: 'Success',
        description: 'User permissions updated successfully',
      });
      setSelectedUserData({});
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update user permissions',
        variant: 'destructive',
      });
    }
  });

  const handleRoleUpdate = (userId: string, role: string, specialPermissions?: string[], isPrimaryCommissioner?: boolean) => {
    updatePermissionsMutation.mutate({ userId, role, specialPermissions, isPrimaryCommissioner });
  };

  const handleMakeAdmin = (user: UserWithPermissions) => {
    const currentSpecialPermissions = user.specialPermissions || [];
    const newSpecialPermissions = currentSpecialPermissions.includes('admin') 
      ? currentSpecialPermissions.filter(p => p !== 'admin')
      : [...currentSpecialPermissions, 'admin'];
    
    handleRoleUpdate(user.id, user.role, newSpecialPermissions as string[], user.isPrimaryCommissioner);
  };

  const handleMakePrimary = (user: UserWithPermissions) => {
    handleRoleUpdate(user.id, user.role, user.specialPermissions as string[], !user.isPrimaryCommissioner);
  };

  const handleRoleChange = (userId: string, newRole: UserRole) => {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    
    handleRoleUpdate(userId, newRole, user.specialPermissions as string[], user.isPrimaryCommissioner);
    
    // Clear selection after update
    setSelectedUserData(prev => {
      const { [userId]: removed, ...rest } = prev;
      return rest;
    });
  };

  const getRoleIcon = (user: UserWithPermissions) => {
    if (user.isPrimaryCommissioner) return <Crown className="h-4 w-4 text-yellow-500" />;
    if (user.specialPermissions?.includes('admin')) return <Shield className="h-4 w-4 text-red-500" />;
    if (user.specialPermissions?.includes('stat_manager')) return <Star className="h-4 w-4 text-green-500" />;
    return <Users className="h-4 w-4 text-gray-500" />;
  };

  if (!canManageUsers() && !canManageLeague()) {
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {canManageUsers() && (
            <TabsTrigger value="all-users" data-testid="tab-all-users">All Users</TabsTrigger>
          )}
          {canManageLeague() && (
            <TabsTrigger value="league-users" data-testid="tab-league-users">League Management</TabsTrigger>
          )}
        </TabsList>

        {canManageUsers() && (
          <TabsContent value="all-users" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  System Users ({allUsers.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <div className="text-center py-8">Loading users...</div>
                ) : (
                  <div className="space-y-4">
                    {allUsers.map((user) => (
                      <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center space-x-4">
                          {getRoleIcon(user)}
                          <div>
                            <p className="font-medium" data-testid={`user-name-${user.id}`}>
                              {user.firstName} {user.lastName}
                            </p>
                            <p className="text-sm text-gray-600" data-testid={`user-email-${user.id}`}>
                              {user.email}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-4">
                          <div className="flex flex-wrap gap-2">
                            <Badge className={roleColors[user.role]} data-testid={`user-role-${user.id}`}>
                              {roleDisplayNames[user.role]}
                            </Badge>
                            {user.isPrimaryCommissioner && (
                              <Badge variant="outline" className="border-yellow-500 text-yellow-700">
                                Primary
                              </Badge>
                            )}
                            {user.specialPermissions?.map(permission => (
                              <Badge key={permission} variant="outline" className="border-green-500 text-green-700">
                                {permission}
                              </Badge>
                            ))}
                          </div>
                          
                          <div className="flex items-center space-x-2">
                            <Select
                              value={selectedUserData[user.id]?.role || ''}
                              onValueChange={(value) => {
                                setSelectedUserData(prev => ({
                                  ...prev,
                                  [user.id]: { role: value as UserRole }
                                }));
                              }}
                              data-testid={`select-user-${user.id}`}
                            >
                              <SelectTrigger className="w-40">
                                <SelectValue placeholder="Change Role" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="free_tier">Free Tier</SelectItem>
                                <SelectItem value="player_pro">Player Pro</SelectItem>
                                <SelectItem value="secondary_commissioner">Secondary Commissioner</SelectItem>
                                <SelectItem value="commissioner">Commissioner</SelectItem>
                              </SelectContent>
                            </Select>
                            
                            {selectedUserData[user.id] && (
                              <Button 
                                size="sm"
                                onClick={() => handleRoleChange(user.id, selectedUserData[user.id].role)}
                                data-testid={`button-update-role-${user.id}`}
                              >
                                Update Role
                              </Button>
                            )}
                            
                            <div className="flex space-x-2">
                              <Button 
                                size="sm"
                                onClick={() => handleMakeAdmin(user)}
                                variant="outline"
                                data-testid={`button-toggle-admin-${user.id}`}
                              >
                                {user.specialPermissions?.includes('admin') ? 'Remove Admin' : 'Make Admin'}
                              </Button>
                              <Button 
                                size="sm"
                                onClick={() => handleMakePrimary(user)}
                                variant="outline"
                                data-testid={`button-toggle-primary-${user.id}`}
                              >
                                {user.isPrimaryCommissioner ? 'Remove Primary' : 'Make Primary'}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {canManageLeague() && (
          <TabsContent value="league-users" className="space-y-4">
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
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}