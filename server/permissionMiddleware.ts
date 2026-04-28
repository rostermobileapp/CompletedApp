import type { RequestHandler } from "express";
import { storage } from "./storage";
import type { User } from "@shared/schema";
import Stripe from "stripe";

// Types matching the frontend permission system
export type UserRole = 'commissioner' | 'secondary_commissioner' | 'player_pro' | 'free_tier';
export type SpecialPermission = 'admin' | 'stat_manager';

// Initialize Stripe if available
const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-09-30.clover" })
  : null;

// Cache for subscription checks to avoid hitting Stripe API too frequently
// Format: { userId: { lastChecked: timestamp, shouldDowngrade: boolean } }
const subscriptionCheckCache = new Map<string, { lastChecked: number; shouldDowngrade: boolean }>();
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// Map Stripe price IDs to user roles
const PRICE_TO_ROLE: Record<string, 'player_pro' | 'commissioner'> = {
  [process.env.STRIPE_PRICE_PLAYER_PRO_MONTHLY || '']: 'player_pro',
  [process.env.STRIPE_PRICE_COMMISSIONER_MONTHLY || '']: 'commissioner',
  [process.env.STRIPE_PRICE_PLAYER_PRO_YEARLY || '']: 'player_pro',
  [process.env.STRIPE_PRICE_COMMISSIONER_YEARLY || '']: 'commissioner',
};

/**
 * Verify subscription status with Stripe and downgrade user if cancelled
 * This ensures cancellations are enforced even if webhooks are delayed
 */
async function verifyAndEnforceSubscriptionStatus(user: User): Promise<boolean> {
  // Only check premium users with subscriptions
  const isPremiumRole = user.role && ['player_pro', 'commissioner', 'secondary_commissioner'].includes(user.role);
  if (!isPremiumRole || !user.stripeSubscriptionId || !stripe) {
    return false; // No action needed
  }

  const userId = user.id;
  const now = Date.now();
  
  // Check cache first to avoid excessive API calls
  const cached = subscriptionCheckCache.get(userId);
  if (cached && (now - cached.lastChecked) < CACHE_DURATION_MS) {
    if (cached.shouldDowngrade) {
      await storage.updateUserRole(userId, 'free_tier');
      await storage.updateUserStripeInfo(userId, user.stripeCustomerId || '', '');
      console.log('[Subscription Verify] Downgraded cached user to free_tier:', userId);
      return true;
    }
    return false;
  }

  try {
    // Fetch current subscription status from Stripe
    const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
    
    // Check if subscription should be downgraded
    const shouldDowngrade = subscription.cancel_at_period_end 
      || subscription.status === 'canceled' 
      || subscription.status === 'unpaid';

    // Update cache
    subscriptionCheckCache.set(userId, { lastChecked: now, shouldDowngrade });

    if (shouldDowngrade) {
      await storage.updateUserRole(userId, 'free_tier');
      await storage.updateUserStripeInfo(userId, user.stripeCustomerId || '', '');
      console.log('[Subscription Verify] Downgraded user to free_tier:', userId, 'Reason:', 
        subscription.cancel_at_period_end ? 'cancel_at_period_end' : `status=${subscription.status}`);
      return true;
    }

    // Verify role matches subscription
    const priceId = subscription.items.data[0]?.price?.id;
    const expectedRole = priceId ? PRICE_TO_ROLE[priceId] : null;
    if (expectedRole && expectedRole !== user.role) {
      await storage.updateUserRole(userId, expectedRole);
      console.log('[Subscription Verify] Updated user role to match subscription:', userId, 'New role:', expectedRole);
      return true;
    }

    return false;
  } catch (error) {
    console.error('[Subscription Verify] Error checking subscription for user:', userId, error);
    // Don't downgrade on error - could be temporary API issue
    return false;
  }
}

// Extended User type with permission fields (temporary workaround for TypeScript cache issue)
interface UserWithPermissions extends User {
  role: UserRole;
  specialPermissions: SpecialPermission[] | null;
  isPrimaryCommissioner: boolean;
}

// Role hierarchy for permission checking (higher number = more access)
export const roleHierarchy: Record<UserRole, number> = {
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
 * Also verifies subscription status to enforce cancellations in real-time
 */
export const loadUserPermissions: RequestHandler = async (req, res, next) => {
  try {
    const userId = (req.user as any)?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "User ID not found in session" });
    }

    let user = await storage.getUser(userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // TEMPORARILY DISABLED: Automatic subscription verification
    // This was causing issues where the subscription sync was working but then
    // this middleware was immediately overwriting it back to free_tier
    // TODO: Debug why Stripe is reporting the subscription as needing downgrade
    // const wasDowngraded = await verifyAndEnforceSubscriptionStatus(user);
    // if (wasDowngraded) {
    //   // Refetch user to get updated role
    //   user = await storage.getUser(userId);
    //   if (!user) {
    //     return res.status(401).json({ message: "User not found after downgrade" });
    //   }
    // }

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
  // Global commissioner role can manage any league
  if (user.role === 'commissioner') return true;
  // Global admin can manage any league
  if (hasSpecialPermission(user, 'admin')) return true;
  // Check league-specific admin permission
  if (await hasLeagueSpecialPermission(user, leagueId, 'admin')) return true;
  // Check league-specific commissioner or secondary_commissioner role
  if (await hasLeagueRole(user, leagueId, 'commissioner')) return true;
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

/**
 * Check if a user has valid tournament participant access
 */
export async function hasValidTournamentAccess(userId: string, tournamentId: string): Promise<boolean> {
  try {
    const { db } = await import("./db");
    const { tournamentParticipants, tournaments } = await import("@shared/schema");
    const { eq, and } = await import("drizzle-orm");

    // Check if user is a participant
    const [participant] = await db
      .select()
      .from(tournamentParticipants)
      .where(and(
        eq(tournamentParticipants.tournamentId, tournamentId),
        eq(tournamentParticipants.userId, userId)
      ));

    if (!participant) {
      return false;
    }

    // Check if participant is approved
    if (participant.status !== 'approved') {
      return false;
    }

    // Check if access has expired
    if (participant.expiresAt && new Date(participant.expiresAt) < new Date()) {
      return false;
    }

    // Get tournament to check access window
    const [tournament] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));

    if (!tournament) {
      return false;
    }

    // Check if we're within the access window
    const now = new Date();
    if (tournament.accessStartDate && new Date(tournament.accessStartDate) > now) {
      return false; // Access hasn't started yet
    }

    if (tournament.accessEndDate && new Date(tournament.accessEndDate) < now) {
      return false; // Access has ended
    }

    return true;
  } catch (error) {
    console.error('Error checking tournament access:', error);
    return false;
  }
}

/**
 * Tournament access state for a user against a specific tournament:
 *  - 'full'    : tournament creator or league commissioner — bypass all access windows
 *  - 'open'    : approved participant currently within the access window
 *  - 'pending' : approved participant whose access window has not yet opened
 *  - 'expired' : approved participant whose access window has ended
 *  - 'none'    : not a participant (or rejected/removed)
 */
export type TournamentAccessState = 'full' | 'open' | 'pending' | 'expired' | 'none';

export async function getTournamentAccessState(
  userId: string,
  tournamentId: string
): Promise<{ state: TournamentAccessState; tournament: any | null }> {
  const { db } = await import("./db");
  const { tournamentParticipants, tournaments } = await import("@shared/schema");
  const { eq, and } = await import("drizzle-orm");

  const [tournament] = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId));

  if (!tournament) {
    return { state: 'none', tournament: null };
  }

  // Tournament creator always has full access
  if (tournament.createdBy === userId) {
    return { state: 'full', tournament };
  }

  // For league tournaments, league commissioners/co-commissioners have full access
  if (tournament.leagueId) {
    try {
      const user = await storage.getUser(userId);
      if (user) {
        const hasLeagueAccess = await canManageLeagueSpecific(user as UserWithPermissions, tournament.leagueId);
        if (hasLeagueAccess) {
          return { state: 'full', tournament };
        }
      }
    } catch (err) {
      console.error('Error checking league access in getTournamentAccessState:', err);
    }
  }

  // Check participant record
  const [participant] = await db
    .select()
    .from(tournamentParticipants)
    .where(and(
      eq(tournamentParticipants.tournamentId, tournamentId),
      eq(tournamentParticipants.userId, userId)
    ));

  if (!participant || participant.status !== 'approved') {
    return { state: 'none', tournament };
  }

  const now = new Date();

  // Check if access window has opened
  if (tournament.accessStartDate && new Date(tournament.accessStartDate) > now) {
    return { state: 'pending', tournament };
  }

  // Check if access has expired (either explicit expiresAt on participant or accessEndDate)
  if (participant.expiresAt && new Date(participant.expiresAt) < now) {
    return { state: 'expired', tournament };
  }
  if (tournament.accessEndDate && new Date(tournament.accessEndDate) < now) {
    return { state: 'expired', tournament };
  }

  return { state: 'open', tournament };
}

/**
 * Middleware that allows the request through unless the requesting user is an
 * approved tournament participant whose access window has not yet opened.
 *
 * This is used to gate tournament SUB-RESOURCE endpoints (matches, teams,
 * announcements, standings, etc.) so that the pre-access countdown UI can
 * never load real tournament data. Creators, commissioners, and other
 * existing access paths are unaffected.
 */
export const requireTournamentAccessOpen: RequestHandler = async (req, res, next) => {
  try {
    const userId = (req.user as any)?.claims?.sub;
    if (!userId) {
      return next(); // let downstream auth handle missing user
    }

    const tournamentId = req.params.tournamentId || req.params.id;
    if (!tournamentId) {
      return next();
    }

    const { state } = await getTournamentAccessState(userId, tournamentId);
    if (state === 'pending') {
      return res.status(403).json({
        message: "Tournament access has not opened yet.",
        accessState: 'pending',
      });
    }

    return next();
  } catch (error) {
    console.error('Error in requireTournamentAccessOpen:', error);
    // Fail open to preserve existing behavior on unexpected errors
    return next();
  }
};

/**
 * Middleware to require valid tournament participant access
 */
export const requireTournamentParticipant: RequestHandler = async (req, res, next) => {
  try {
    const userId = (req.user as any)?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "User ID not found in session" });
    }

    const tournamentId = req.params.tournamentId || req.params.id;
    if (!tournamentId) {
      return res.status(400).json({ message: "Tournament ID required" });
    }

    // Check if user is a tournament creator or league commissioner/co-commissioner
    const { db } = await import("./db");
    const { tournaments } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");

    const [tournament] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));

    if (tournament) {
      // Tournament creator always has access
      if (tournament.createdBy === userId) {
        return next();
      }
      
      // For league tournaments, check commissioner/co-commissioner access
      if (tournament.leagueId) {
        const user = await storage.getUser(userId);
        if (user) {
          const hasLeagueAccess = await canManageLeagueSpecific(user as UserWithPermissions, tournament.leagueId);
          if (hasLeagueAccess) {
            return next();
          }
        }
      }
    }

    // Check participant access
    const hasAccess = await hasValidTournamentAccess(userId, tournamentId);
    if (!hasAccess) {
      return res.status(403).json({ 
        message: "Access denied. You don't have valid tournament participant access or your access has expired." 
      });
    }

    next();
  } catch (error) {
    console.error("Error checking tournament participant access:", error);
    res.status(500).json({ message: "Failed to verify tournament access" });
  }
};