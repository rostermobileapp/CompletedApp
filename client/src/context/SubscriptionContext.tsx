import { createContext, useContext, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { User } from '@shared/schema';

export type UserRole = 'commissioner' | 'secondary_commissioner' | 'player_pro' | 'free_tier';
export type SpecialPermission = 'admin' | 'stat_manager';

interface PermissionContextType {
  user: User | null;
  role: UserRole;
  specialPermissions: SpecialPermission[];
  isPrimaryCommissioner: boolean;
  hasRole: (requiredRole: UserRole) => boolean;
  hasAnyRole: (roles: UserRole[]) => boolean;
  hasSpecialPermission: (permission: SpecialPermission) => boolean;
  canManageUsers: () => boolean;
  canManageLeague: (leagueId?: string) => boolean;
  canEditStats: () => boolean;
  canAccessPremiumFeatures: () => boolean;
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
  const { user, isLoading } = useAuth();
  
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
    return isPrimaryCommissioner || hasSpecialPermission('admin');
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
    return hasSpecialPermission('stat_manager') || hasRole('commissioner') || isPrimaryCommissioner;
  };

  const canAccessPremiumFeatures = (): boolean => {
    return hasRole('player_pro');
  };

  return (
    <PermissionContext.Provider value={{
      user: user || null,
      role,
      specialPermissions,
      isPrimaryCommissioner,
      hasRole,
      hasAnyRole,
      hasSpecialPermission,
      canManageUsers,
      canManageLeague,
      canEditStats,
      canAccessPremiumFeatures,
      isLoading
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
