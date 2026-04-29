import { createContext, useContext, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useDashboardSelection } from '@/hooks/useDashboardSelection';
import { useQuery } from '@tanstack/react-query';
import type { User } from '@shared/schema';

export type UserRole = 'commissioner' | 'secondary_commissioner' | 'player_pro' | 'free_tier';
export type SpecialPermission = 'admin' | 'stat_manager';

interface PermissionContextType {
  user: User | null;
  role: UserRole;
  specialPermissions: SpecialPermission[];
  isPrimaryCommissioner: boolean;
  leagueMemberships: any[];
  // Global permission checks (backward compatibility)
  hasRole: (requiredRole: UserRole) => boolean;
  hasAnyRole: (roles: UserRole[]) => boolean;
  hasSpecialPermission: (permission: SpecialPermission) => boolean;
  canManageUsers: () => boolean;
  canManageLeague: (leagueId?: string) => boolean;
  canEditStats: () => boolean;
  canAccessPremiumFeatures: () => boolean;
  hasStatManagerAccess: () => boolean;
  isCoCommissionerOfAnyLeague: () => boolean;
  // League-specific permission checks
  hasLeagueRole: (leagueId: string, requiredRole: UserRole) => boolean;
  hasAnyLeagueRole: (leagueId: string, roles: UserRole[]) => boolean;
  hasLeagueSpecialPermission: (leagueId: string, permission: SpecialPermission) => boolean;
  canManageLeagueSpecific: (leagueId: string) => boolean;
  canEditLeagueStats: (leagueId: string) => boolean;
  getUserLeagueMembership: (leagueId: string) => any | null;
  isLoading: boolean;
}

const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

// Role hierarchy for permission checking (higher number = more access)
const roleHierarchy: Record<UserRole, number> = {
  free_tier: 0,
  player_pro: 1,
  secondary_commissioner: 2,
  commissioner: 3,
};

export function PermissionProvider({ children }: { children: ReactNode }) {
  const { user: authUser, isLoading: authLoading } = useAuth();
  const { selectedType, selectedId } = useDashboardSelection();
  
  // Fetch full user from database (includes role from PostgreSQL)
  const { data: user, isLoading: userLoading } = useQuery<User>({
    queryKey: ['/api/user'],
    enabled: !!authUser,
  });
  
  // Fetch user's league memberships with permissions
  const { data: leagueMemberships = [], isLoading: isMembershipsLoading } = useQuery<any[]>({
    queryKey: ['/api/user/league-memberships'],
    enabled: !!authUser,
  });

  // Fetch the user's approved tournament participations. A tournament
  // participant gets Player Pro privileges while their tournament is the
  // active context, regardless of their personal subscription tier.
  const { data: tournamentParticipations = [] } = useQuery<any[]>({
    queryKey: ['/api/user/tournament-participations'],
    enabled: !!authUser,
  });
  
  const role: UserRole = user?.role || 'free_tier';
  const specialPermissions: SpecialPermission[] = user?.specialPermissions || [];
  const isPrimaryCommissioner: boolean = user?.isPrimaryCommissioner || false;
  
  // Check if user has specific role or higher
  const hasRole = (requiredRole: UserRole): boolean => {
    if (!user) return false;
    return roleHierarchy[role] >= roleHierarchy[requiredRole];
  };

  // Check if user has any of the specified roles
  const hasAnyRole = (roles: UserRole[]): boolean => {
    if (!user) return false;
    return roles.some(r => hasRole(r));
  };

  // Check if user has specific special permission
  const hasSpecialPermission = (permission: SpecialPermission): boolean => {
    if (!user) return false;
    return specialPermissions.includes(permission);
  };

  // Complex permission checks for specific actions
  const canManageUsers = (): boolean => {
    return isPrimaryCommissioner || hasSpecialPermission('admin') || hasRole('commissioner');
  };

  const canManageLeague = (leagueId?: string): boolean => {
    // Primary commissioner can manage any league
    if (isPrimaryCommissioner) return true;
    // Admin can manage any league
    if (hasSpecialPermission('admin')) return true;
    // Regular commissioners and secondary commissioners can manage leagues
    return hasRole('secondary_commissioner');
    // TODO: Add specific league ownership checks when leagueId is provided
  };

  const canEditStats = (): boolean => {
    return hasSpecialPermission('stat_manager') || hasSpecialPermission('admin') || hasRole('commissioner') || isPrimaryCommissioner;
  };

  // True if the user has at least one approved tournament participation —
  // tournament players are granted Player Pro privileges so they can use
  // the same player-side features (stats, sub requests, etc.) for their
  // tournament team regardless of their personal subscription tier.
  const isActiveTournamentParticipant = (): boolean => {
    return tournamentParticipations.length > 0;
  };

  const canAccessPremiumFeatures = (): boolean => {
    if (hasRole('player_pro')) return true;
    return isActiveTournamentParticipant();
  };

  const hasStatManagerAccess = (): boolean => {
    if (!user) return false;
    if (isPrimaryCommissioner) return true;
    if (hasSpecialPermission('stat_manager')) return true;
    if (hasSpecialPermission('admin')) return true;
    if (hasRole('secondary_commissioner')) return true;
    const hasLeagueStatManager = leagueMemberships.some((membership: any) => 
      membership.leagueSpecialPermissions?.includes('stat_manager')
    );
    return hasLeagueStatManager;
  };

  const isCoCommissionerOfAnyLeague = (): boolean => {
    if (!user) return false;
    if (isPrimaryCommissioner) return true;
    if (hasRole('commissioner')) return true;
    if (hasRole('secondary_commissioner')) return true;
    return leagueMemberships.some((membership: any) => 
      membership.leagueRole === 'secondary_commissioner'
    );
  };

  // League-specific permission functions
  const getUserLeagueMembership = (leagueId: string) => {
    return leagueMemberships.find((membership: any) => membership.leagueId === leagueId) || null;
  };

  const hasLeagueRole = (leagueId: string, requiredRole: UserRole): boolean => {
    if (!user) return false;
    
    // Primary commissioner has all permissions globally
    if (isPrimaryCommissioner) return true;
    
    const membership = getUserLeagueMembership(leagueId);
    if (!membership) return false;
    
    const leagueRole: UserRole = membership.leagueRole || 'free_tier';
    return roleHierarchy[leagueRole] >= roleHierarchy[requiredRole];
  };

  const hasAnyLeagueRole = (leagueId: string, roles: UserRole[]): boolean => {
    if (!user) return false;
    return roles.some(r => hasLeagueRole(leagueId, r));
  };

  const hasLeagueSpecialPermission = (leagueId: string, permission: SpecialPermission): boolean => {
    if (!user) return false;
    
    // Primary commissioner has all permissions globally
    if (isPrimaryCommissioner) return true;
    
    const membership = getUserLeagueMembership(leagueId);
    if (!membership) return false;
    
    const leagueSpecialPermissions = membership.leagueSpecialPermissions || [];
    return leagueSpecialPermissions.includes(permission);
  };

  const canManageLeagueSpecific = (leagueId: string): boolean => {
    // Primary commissioner can manage any league
    if (isPrimaryCommissioner) return true;
    // Global admin can manage any league
    if (hasSpecialPermission('admin')) return true;
    // Check league-specific admin permission
    if (hasLeagueSpecialPermission(leagueId, 'admin')) return true;
    // Check league-specific commissioner role
    return hasLeagueRole(leagueId, 'secondary_commissioner');
  };

  const canEditLeagueStats = (leagueId: string): boolean => {
    // Primary commissioner can edit stats anywhere
    if (isPrimaryCommissioner) return true;
    // Global stat manager can edit stats anywhere
    if (hasSpecialPermission('stat_manager')) return true;
    // Check league-specific stat manager permission
    if (hasLeagueSpecialPermission(leagueId, 'stat_manager')) return true;
    // Check league-specific commissioner role
    return hasLeagueRole(leagueId, 'commissioner');
  };

  return (
    <PermissionContext.Provider value={{
      user: user || null,
      role,
      specialPermissions,
      isPrimaryCommissioner,
      leagueMemberships,
      hasRole,
      hasAnyRole,
      hasSpecialPermission,
      canManageUsers,
      canManageLeague,
      canEditStats,
      canAccessPremiumFeatures,
      hasStatManagerAccess,
      isCoCommissionerOfAnyLeague,
      hasLeagueRole,
      hasAnyLeagueRole,
      hasLeagueSpecialPermission,
      canManageLeagueSpecific,
      canEditLeagueStats,
      getUserLeagueMembership,
      isLoading: authLoading || userLoading || isMembershipsLoading
    }}>
      {children}
    </PermissionContext.Provider>
  );
}

// Hook for accessing permission context
export function usePermissions() {
  const context = useContext(PermissionContext);
  if (context === undefined) {
    throw new Error('usePermissions must be used within a PermissionProvider');
  }
  return context;
}

// Backward compatibility alias for components still using useSubscription
export const useSubscription = usePermissions;
