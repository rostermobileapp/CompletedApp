import type { RequestHandler } from "express";
import { storage } from "./storage";
import type { User } from "@shared/schema";

// Types matching the frontend permission system
export type UserRole = 'commissioner' | 'secondary_commissioner' | 'player_pro' | 'free_tier';
export type SpecialPermission = 'admin' | 'stat_manager';

// Extended User type with permission fields (temporary workaround for TypeScript cache issue)
interface UserWithPermissions extends User {
  role: UserRole;
  specialPermissions: SpecialPermission[] | null;
  isPrimaryCommissioner: boolean;
}

// Role hierarchy for permission checking (higher number = more access)
const roleHierarchy: Record<UserRole, number> = {
  free_tier: 0,
  player_pro: 1,
  secondary_commissioner: 2,
  commissioner: 3,
};

// Extend Express Request type to include user with role information
declare global {
  namespace Express {
    interface Request {
      userWithPermissions?: UserWithPermissions;
    }
  }
}

/**
 * Base permission middleware that fetches user role and permission data
 * Should be used after isAuthenticated middleware
 */
export const loadUserPermissions: RequestHandler = async (req, res, next) => {
  try {
    const userId = (req.user as any)?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "User ID not found in session" });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // Type cast to work around TypeScript cache issue - fields exist at runtime
    req.userWithPermissions = user as UserWithPermissions;
    next();
  } catch (error) {
    console.error("Error loading user permissions:", error);
    res.status(500).json({ message: "Failed to load user permissions" });
  }
};

/**
 * Check if user has specific role or higher in hierarchy
 */
export function requireRole(requiredRole: UserRole): RequestHandler {
  return async (req, res, next) => {
    const user = req.userWithPermissions;
    if (!user) {
      return res.status(401).json({ message: "User permissions not loaded" });
    }

    const userRole = user.role || 'free_tier';
    if (roleHierarchy[userRole] >= roleHierarchy[requiredRole]) {
      return next();
    }

    res.status(403).json({ 
      message: `Access denied. Required role: ${requiredRole} or higher` 
    });
  };
}

/**
 * Check if user has any of the specified roles
 */
export function requireAnyRole(roles: UserRole[]): RequestHandler {
  return async (req, res, next) => {
    const user = req.userWithPermissions;
    if (!user) {
      return res.status(401).json({ message: "User permissions not loaded" });
    }

    const userRole = user.role || 'free_tier';
    const hasRole = roles.some(role => roleHierarchy[userRole] >= roleHierarchy[role]);
    
    if (hasRole) {
      return next();
    }

    res.status(403).json({ 
      message: `Access denied. Required one of: ${roles.join(', ')}` 
    });
  };
}

/**
 * Check if user has specific special permission
 */
export function requireSpecialPermission(permission: SpecialPermission): RequestHandler {
  return async (req, res, next) => {
    const user = req.userWithPermissions;
    if (!user) {
      return res.status(401).json({ message: "User permissions not loaded" });
    }

    const specialPermissions = user.specialPermissions || [];
    if (specialPermissions.includes(permission)) {
      return next();
    }

    res.status(403).json({ 
      message: `Access denied. Required special permission: ${permission}` 
    });
  };
}

/**
 * Check if user is primary commissioner
 */
export const requirePrimaryCommissioner: RequestHandler = async (req, res, next) => {
  const user = req.userWithPermissions;
  if (!user) {
    return res.status(401).json({ message: "User permissions not loaded" });
  }

  if (user.isPrimaryCommissioner) {
    return next();
  }

  res.status(403).json({ 
    message: "Access denied. Primary commissioner access required" 
  });
};

/**
 * Complex permission checks for specific actions
 */

// User management permissions (primary commissioner or admin)
export const requireUserManagement: RequestHandler = async (req, res, next) => {
  const user = req.userWithPermissions;
  if (!user) {
    return res.status(401).json({ message: "User permissions not loaded" });
  }

  if (user.isPrimaryCommissioner || (user.specialPermissions && user.specialPermissions.includes('admin'))) {
    return next();
  }

  res.status(403).json({ 
    message: "Access denied. User management requires primary commissioner or admin permissions" 
  });
};

// League management permissions (commissioner level or admin)
export const requireLeagueManagement: RequestHandler = async (req, res, next) => {
  const user = req.userWithPermissions;
  if (!user) {
    return res.status(401).json({ message: "User permissions not loaded" });
  }

  const userRole = user.role || 'free_tier';
  const hasAdmin = user.specialPermissions && user.specialPermissions.includes('admin');
  
  // Check if user has global permissions
  if (user.isPrimaryCommissioner || hasAdmin || roleHierarchy[userRole] >= roleHierarchy['secondary_commissioner']) {
    return next();
  }

  // Check if user is already a commissioner of any existing league
  try {
    const userLeagues = await storage.getLeaguesByCommissioner(user.id);
    if (userLeagues && userLeagues.length > 0) {
      return next();
    }

    // Allow any authenticated user to create their first league
    // This allows new users to become commissioners by creating their first league
    const allUserLeagues = await storage.getUserLeagues(user.id);
    if (!allUserLeagues || allUserLeagues.length === 0) {
      console.log(`🎯 Allowing first league creation for new user ${user.id}`);
      return next();
    }
  } catch (error) {
    console.error('Error checking user league status:', error);
  }

  res.status(403).json({ 
    message: "Access denied. League management requires commissioner level access or admin permissions" 
  });
};

// Stats management permissions (stat_manager special permission, commissioner, or primary commissioner)
export const requireStatsManagement: RequestHandler = async (req, res, next) => {
  const user = req.userWithPermissions;
  if (!user) {
    return res.status(401).json({ message: "User permissions not loaded" });
  }

  const userRole = user.role || 'free_tier';
  const hasStatManager = user.specialPermissions && user.specialPermissions.includes('stat_manager');
  
  if (user.isPrimaryCommissioner || hasStatManager || roleHierarchy[userRole] >= roleHierarchy['commissioner']) {
    return next();
  }

  res.status(403).json({ 
    message: "Access denied. Stats management requires stat manager, commissioner, or primary commissioner permissions" 
  });
};

// Premium features access (player_pro or higher)
export const requirePremiumFeatures: RequestHandler = async (req, res, next) => {
  const user = req.userWithPermissions;
  if (!user) {
    return res.status(401).json({ message: "User permissions not loaded" });
  }

  const userRole = user.role || 'free_tier';
  if (roleHierarchy[userRole] >= roleHierarchy['player_pro']) {
    return next();
  }

  res.status(403).json({ 
    message: "Access denied. Premium features require Player Pro subscription or higher" 
  });
};

/**
 * Utility functions for programmatic permission checks within route handlers
 */

export function hasRole(user: UserWithPermissions, requiredRole: UserRole): boolean {
  const userRole = user.role || 'free_tier';
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}

export function hasAnyRole(user: UserWithPermissions, roles: UserRole[]): boolean {
  const userRole = user.role || 'free_tier';
  return roles.some(role => roleHierarchy[userRole] >= roleHierarchy[role]);
}

export function hasSpecialPermission(user: UserWithPermissions, permission: SpecialPermission): boolean {
  const specialPermissions = user.specialPermissions || [];
  return specialPermissions.includes(permission);
}

export function canManageUsers(user: UserWithPermissions): boolean {
  return user.isPrimaryCommissioner || hasSpecialPermission(user, 'admin');
}

export function canManageLeague(user: UserWithPermissions): boolean {
  return user.isPrimaryCommissioner || 
         hasSpecialPermission(user, 'admin') || 
         hasRole(user, 'secondary_commissioner');
}

export function canEditStats(user: UserWithPermissions): boolean {
  return user.isPrimaryCommissioner || 
         hasSpecialPermission(user, 'stat_manager') || 
         hasRole(user, 'commissioner');
}

export function canAccessPremiumFeatures(user: UserWithPermissions): boolean {
  return hasRole(user, 'player_pro');
}

/**
 * League-specific permission checking functions
 */

export async function hasLeagueRole(user: UserWithPermissions, leagueId: string, requiredRole: UserRole): Promise<boolean> {
  // Primary commissioner has all permissions globally
  if (user.isPrimaryCommissioner) return true;
  
  try {
    const membership = await storage.getUserLeagueMembership(user.id, leagueId);
    if (!membership) return false;
    
    const leagueRole = membership.leagueRole || 'free_tier';
    return roleHierarchy[leagueRole] >= roleHierarchy[requiredRole];
  } catch (error) {
    console.error('Error checking league role:', error);
    return false;
  }
}

export async function hasLeagueSpecialPermission(user: UserWithPermissions, leagueId: string, permission: SpecialPermission): Promise<boolean> {
  // Primary commissioner has all permissions globally  
  if (user.isPrimaryCommissioner) return true;
  
  try {
    const membership = await storage.getUserLeagueMembership(user.id, leagueId);
    if (!membership) return false;
    
    const leagueSpecialPermissions = membership.leagueSpecialPermissions || [];
    return leagueSpecialPermissions.includes(permission);
  } catch (error) {
    console.error('Error checking league special permission:', error);
    return false;
  }
}

export async function canManageLeagueSpecific(user: UserWithPermissions, leagueId: string): Promise<boolean> {
  // Primary commissioner can manage any league
  if (user.isPrimaryCommissioner) return true;
  // Global admin can manage any league
  if (hasSpecialPermission(user, 'admin')) return true;
  // Check league-specific admin permission
  if (await hasLeagueSpecialPermission(user, leagueId, 'admin')) return true;
  // Check league-specific commissioner role
  return await hasLeagueRole(user, leagueId, 'secondary_commissioner');
}

export async function canEditLeagueStats(user: UserWithPermissions, leagueId: string): Promise<boolean> {
  // Primary commissioner can edit stats anywhere
  if (user.isPrimaryCommissioner) return true;
  // Global stat manager can edit stats anywhere
  if (hasSpecialPermission(user, 'stat_manager')) return true;
  // Check league-specific stat manager permission
  if (await hasLeagueSpecialPermission(user, leagueId, 'stat_manager')) return true;
  // Check league-specific commissioner role
  return await hasLeagueRole(user, leagueId, 'commissioner');
}

/**
 * League-specific middleware functions
 */

export function requireLeagueRole(requiredRole: UserRole): RequestHandler {
  return async (req, res, next) => {
    const user = req.userWithPermissions;
    if (!user) {
      return res.status(401).json({ message: "User permissions not loaded" });
    }

    const leagueId = req.params.leagueId || req.params.id;
    if (!leagueId) {
      return res.status(400).json({ message: "League ID required for this operation" });
    }

    if (await hasLeagueRole(user, leagueId, requiredRole)) {
      return next();
    }

    res.status(403).json({ 
      message: `Access denied. Required league role: ${requiredRole} or higher` 
    });
  };
}

export function requireLeagueSpecialPermission(permission: SpecialPermission): RequestHandler {
  return async (req, res, next) => {
    const user = req.userWithPermissions;
    if (!user) {
      return res.status(401).json({ message: "User permissions not loaded" });
    }

    const leagueId = req.params.leagueId || req.params.id;
    if (!leagueId) {
      return res.status(400).json({ message: "League ID required for this operation" });
    }

    // Check global permission first
    if (hasSpecialPermission(user, permission)) {
      return next();
    }

    // Check league-specific permission
    if (await hasLeagueSpecialPermission(user, leagueId, permission)) {
      return next();
    }

    res.status(403).json({ 
      message: `Access denied. Required league permission: ${permission}` 
    });
  };
}

export const requireLeagueManagementSpecific: RequestHandler = async (req, res, next) => {
  const user = req.userWithPermissions;
  if (!user) {
    return res.status(401).json({ message: "User permissions not loaded" });
  }

  const leagueId = req.params.leagueId || req.params.id;
  if (!leagueId) {
    return res.status(400).json({ message: "League ID required for this operation" });
  }

  if (await canManageLeagueSpecific(user, leagueId)) {
    return next();
  }

  res.status(403).json({ 
    message: "Access denied. League management requires league-specific commissioner or admin permissions" 
  });
};