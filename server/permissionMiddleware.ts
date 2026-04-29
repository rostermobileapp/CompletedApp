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
 * Programmatic check: can this user manage this specific tournament?
 *
 * Returns true when the user is the tournament creator (the standalone-tournament
 * owner case), a league commissioner / co-commissioner of the league that owns
 * the tournament, a global commissioner / admin / primary commissioner.
 *
 * This intentionally bypasses the broader `requireLeagueManagement` check, which
 * 403s standalone-tournament creators that are mere league members in some
 * other league. We want creators to always be able to manage their own
 * tournaments regardless of unrelated memberships.
 */
/**
 * Check if a user has scorekeeper access to a specific tournament.
 * More permissive than canManageTournamentSpecific — includes invited scorekeepers.
 */
export async function canScorekeeperTournamentSpecific(
  user: UserWithPermissions,
  tournamentId: string,
): Promise<boolean> {
  // Full management rights implies scorekeeper rights
  if (await canManageTournamentSpecific(user, tournamentId)) return true;

  // Check if explicitly invited as a tournament scorekeeper
  try {
    const { storage } = await import("./storage");
    return await storage.isTournamentScorekeeper(tournamentId, user.id);
  } catch (err) {
    console.error('Error in canScorekeeperTournamentSpecific:', err);
  }
  return false;
}

/**
 * Middleware variant of canScorekeeperTournamentSpecific for match-keyed routes.
 * Allows tournament creators, league commissioners, global admins, and
 * explicitly-invited tournament scorekeepers to update match scores.
 */
export const requireTournamentScorekeeperOrManagementByMatch: RequestHandler = async (req, res, next) => {
  const user = req.userWithPermissions;
  if (!user) {
    return res.status(401).json({ message: "User permissions not loaded" });
  }

  const matchId = req.params.id;
  if (!matchId) {
    return res.status(400).json({ message: "Match ID required" });
  }

  try {
    const { db } = await import("./db");
    const { tournamentMatches } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");

    const [match] = await db
      .select({ tournamentId: tournamentMatches.tournamentId })
      .from(tournamentMatches)
      .where(eq(tournamentMatches.id, matchId));

    if (!match) {
      return res.status(404).json({ message: "Match not found" });
    }

    (req as any)._tournamentIdForGate = match.tournamentId;

    if (await canScorekeeperTournamentSpecific(user, match.tournamentId)) {
      return next();
    }

    return res.status(403).json({
      message: "Access denied. Only the tournament creator, a league commissioner, or an assigned scorekeeper can perform this action.",
    });
  } catch (err) {
    console.error('Error in requireTournamentScorekeeperOrManagementByMatch:', err);
    return res.status(500).json({ message: "Failed to verify tournament scorekeeper access" });
  }
};

export async function canManageTournamentSpecific(
  user: UserWithPermissions,
  tournamentId: string,
): Promise<boolean> {
  if (!user || !tournamentId) return false;

  // Global passes
  if (user.isPrimaryCommissioner) return true;
  if (user.role === 'commissioner') return true;
  if (hasSpecialPermission(user, 'admin')) return true;

  try {
    const { db } = await import("./db");
    const { tournaments } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");

    const [tournament] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));

    if (!tournament) return false;

    // Tournament creator always has full management rights on their own tournament
    if (tournament.createdBy === user.id) return true;

    // League-tournament commissioners have full rights
    if (tournament.leagueId) {
      return await canManageLeagueSpecific(user, tournament.leagueId);
    }
  } catch (err) {
    console.error('Error in canManageTournamentSpecific:', err);
  }

  return false;
}

/**
 * Middleware: require management rights on the tournament identified by
 * `req.params.tournamentId` or `req.params.id`. Allows tournament creators
 * (standalone) AND league commissioners (playoffs) — unlike the league-only
 * `requireLeagueManagement` which incorrectly blocks standalone creators that
 * happen to be plain members of some other league.
 */
export const requireTournamentManagement: RequestHandler = async (req, res, next) => {
  const user = req.userWithPermissions;
  if (!user) {
    return res.status(401).json({ message: "User permissions not loaded" });
  }

  const tournamentId = req.params.tournamentId || req.params.id;
  if (!tournamentId) {
    return res.status(400).json({ message: "Tournament ID required" });
  }

  if (await canManageTournamentSpecific(user, tournamentId)) {
    return next();
  }

  return res.status(403).json({
    message: "Access denied. Only the tournament creator or a league commissioner can perform this action.",
  });
};

/**
 * Variant of `requireTournamentManagement` for endpoints keyed by a participant
 * id (e.g. PATCH /api/tournament-participants/:id/approve). Loads the
 * participant to find its tournament, then checks management rights.
 */
export const requireTournamentManagementByParticipant: RequestHandler = async (req, res, next) => {
  const user = req.userWithPermissions;
  if (!user) {
    return res.status(401).json({ message: "User permissions not loaded" });
  }

  const participantId = req.params.id;
  if (!participantId) {
    return res.status(400).json({ message: "Participant ID required" });
  }

  try {
    const { db } = await import("./db");
    const { tournamentParticipants } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");

    const [participant] = await db
      .select({ tournamentId: tournamentParticipants.tournamentId })
      .from(tournamentParticipants)
      .where(eq(tournamentParticipants.id, participantId));

    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    if (await canManageTournamentSpecific(user, participant.tournamentId)) {
      return next();
    }

    return res.status(403).json({
      message: "Access denied. Only the tournament creator or a league commissioner can perform this action.",
    });
  } catch (err) {
    console.error('Error in requireTournamentManagementByParticipant:', err);
    return res.status(500).json({ message: "Failed to verify tournament management access" });
  }
};

/**
 * Variant of `requireTournamentManagement` for endpoints keyed by a tournament
 * match id at the top level (e.g. PATCH /api/tournament-matches/:id). Loads
 * the match to find its tournament, then checks management rights.
 */
export const requireTournamentManagementByMatch: RequestHandler = async (req, res, next) => {
  const user = req.userWithPermissions;
  if (!user) {
    return res.status(401).json({ message: "User permissions not loaded" });
  }

  const matchId = req.params.id;
  if (!matchId) {
    return res.status(400).json({ message: "Match ID required" });
  }

  try {
    const { db } = await import("./db");
    const { tournamentMatches } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");

    const [match] = await db
      .select({ tournamentId: tournamentMatches.tournamentId })
      .from(tournamentMatches)
      .where(eq(tournamentMatches.id, matchId));

    if (!match) {
      return res.status(404).json({ message: "Match not found" });
    }

    (req as any)._tournamentIdForGate = match.tournamentId;

    if (await canManageTournamentSpecific(user, match.tournamentId)) {
      return next();
    }

    return res.status(403).json({
      message: "Access denied. Only the tournament creator or a league commissioner can perform this action.",
    });
  } catch (err) {
    console.error('Error in requireTournamentManagementByMatch:', err);
    return res.status(500).json({ message: "Failed to verify tournament management access" });
  }
};

/**
 * Pre-payment gate: tournament creators must pay their tournament invoice
 * before they can do bracket-level management actions (assign players to
 * teams, edit brackets, set per-match schedule, score matches). Returns 402
 * with `{ paymentRequired: true }` so the client can render a "Pay invoice
 * to unlock" affordance instead of a generic error toast.
 *
 * Options:
 *  - getTournamentId: derive the tournament id from the request (defaults to
 *    `req.params.tournamentId || req.params.id || req._tournamentIdForGate`)
 *  - when: optional predicate that, when supplied and returns false, makes the
 *    middleware a no-op (e.g. participant approval is only gated when the
 *    request also assigns the participant to a team).
 */
export interface RequireTournamentPaidOptions {
  getTournamentId?: (req: any) => Promise<string | null | undefined> | string | null | undefined;
  when?: (req: any) => boolean;
}

const PAYMENT_REQUIRED_MESSAGE = "Pay your tournament invoice to unlock this.";

export function requireTournamentPaid(options: RequireTournamentPaidOptions = {}): RequestHandler {
  return async (req, res, next) => {
    try {
      if (options.when && !options.when(req)) {
        return next();
      }

      let tournamentId: string | null | undefined = undefined;
      if (options.getTournamentId) {
        tournamentId = await options.getTournamentId(req);
      } else {
        tournamentId =
          req.params.tournamentId ||
          req.params.id ||
          (req as any)._tournamentIdForGate;
      }

      if (!tournamentId) {
        // Without a tournament context we cannot evaluate the gate; let the
        // route handler decide what to do (it will typically 400/404).
        return next();
      }

      const { db } = await import("./db");
      const { tournaments } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const [tournament] = await db
        .select({ paymentStatus: tournaments.paymentStatus })
        .from(tournaments)
        .where(eq(tournaments.id, tournamentId));

      if (!tournament) {
        // Let the route surface its own 404
        return next();
      }

      if (tournament.paymentStatus !== 'paid') {
        return res.status(402).json({
          paymentRequired: true,
          message: PAYMENT_REQUIRED_MESSAGE,
          tournamentId,
        });
      }

      return next();
    } catch (err) {
      console.error('Error in requireTournamentPaid:', err);
      // Fail-closed on payment gates is safer than fail-open here.
      return res.status(500).json({ message: "Failed to verify tournament payment status" });
    }
  };
}

/**
 * Convenience: payment gate for participant-keyed endpoints. Looks up the
 * participant's tournament before checking payment status.
 */
export function requireTournamentPaidByParticipant(
  options: Omit<RequireTournamentPaidOptions, 'getTournamentId'> = {},
): RequestHandler {
  return requireTournamentPaid({
    ...options,
    getTournamentId: async (req: any) => {
      const participantId = req.params.id;
      if (!participantId) return null;
      const { db } = await import("./db");
      const { tournamentParticipants } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [p] = await db
        .select({ tournamentId: tournamentParticipants.tournamentId })
        .from(tournamentParticipants)
        .where(eq(tournamentParticipants.id, participantId));
      return p?.tournamentId ?? null;
    },
  });
}

/**
 * Convenience: payment gate for match-keyed endpoints
 * (e.g. PATCH /api/tournament-matches/:id). Looks up the match's tournament.
 * Re-uses `_tournamentIdForGate` populated by `requireTournamentManagementByMatch`
 * so we don't double-query when chained.
 */
export function requireTournamentPaidByMatch(
  options: Omit<RequireTournamentPaidOptions, 'getTournamentId'> = {},
): RequestHandler {
  return requireTournamentPaid({
    ...options,
    getTournamentId: async (req: any) => {
      if (req._tournamentIdForGate) return req._tournamentIdForGate as string;
      const matchId = req.params.id;
      if (!matchId) return null;
      const { db } = await import("./db");
      const { tournamentMatches } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [m] = await db
        .select({ tournamentId: tournamentMatches.tournamentId })
        .from(tournamentMatches)
        .where(eq(tournamentMatches.id, matchId));
      return m?.tournamentId ?? null;
    },
  });
}

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