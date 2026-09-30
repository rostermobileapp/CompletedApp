import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import type { Express, RequestHandler } from 'express';
import { storage } from './storage';
import { containsForbiddenDemoBody, demoBodyUserIdsAreMapped, demoMutationAllowed, demoResourcesAreIsolated, hasDemoPaymentScrimmageFields, DEMO_OWNER_DISPLAY_ID, getDemoContext } from './demo';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws } }
);

// Export supabase client for use in other modules
export { supabase };

export async function getAuthenticatedDatabaseUser(accessToken: string) {
  if (!accessToken || accessToken.length < 10) return null;
  const { data: { user }, error } = await supabase.auth.getUser(accessToken);
  if (error || !user) return null;
  return storage.upsertUser({
    id: user.id,
    email: user.email || '',
    firstName: user.user_metadata?.first_name || user.email?.split('@')[0] || '',
    lastName: user.user_metadata?.last_name || '',
    profileImageUrl: user.user_metadata?.profile_image_url || user.user_metadata?.avatar_url || null,
  });
}

export async function setupAuth(app: Express) {
  // No special setup needed for Supabase auth
  // Authentication will be handled via JWT verification middleware
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    console.log('[Auth] No authorization header present');
    return res.status(401).json({ message: 'Unauthorized' });
  }
  
  if (!authHeader.startsWith('Bearer ')) {
    console.log('[Auth] Authorization header does not start with Bearer');
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  if (!token || token.length < 10) {
    console.log('[Auth] Token is empty or too short');
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error) {
      console.error('[Auth] Supabase getUser error:', error.message);
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    if (!user) {
      console.error('[Auth] No user returned from Supabase');
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Sync user with our database
    // NOTE: Do NOT set role here - it's managed by Stripe subscription sync
    const dbUser = await storage.upsertUser({
      id: user.id,
      email: user.email || '',
      firstName: user.user_metadata?.first_name || user.email?.split('@')[0] || '',
      lastName: user.user_metadata?.last_name || '',
      profileImageUrl: user.user_metadata?.profile_image_url || user.user_metadata?.avatar_url || null,
    });

    // Attach user to request object with Replit-compatible format
    // Use the database user ID (which may differ from Supabase ID in migration scenarios)
    (req as any).user = {
      claims: {
        sub: dbUser.id, // Use database user ID
        supabaseId: user.id, // Always the real Supabase auth ID (for auth operations like deletion)
        email: dbUser.email || user.email,
        first_name: dbUser.firstName || user.user_metadata?.first_name,
        last_name: dbUser.lastName || user.user_metadata?.last_name,
        profile_image_url: dbUser.profileImageUrl || user.user_metadata?.profile_image_url || user.user_metadata?.avatar_url,
      }
    } as any;

    // Preserve the authenticated production identity even when a Demo POV is
    // requested.  Demo controls are intentionally never impersonated.
    req.realActor = { id: dbUser.id, displayId: dbUser.displayId };
    const povHeader = req.header("x-demo-pov-user-id");
    if (povHeader) {
      if (req.path.startsWith("/api/demo")) {
        return res.status(403).json({ message: "Demo control endpoints cannot impersonate" });
      }
      if (!req.path.startsWith("/api/") || dbUser.displayId !== DEMO_OWNER_DISPLAY_ID) {
        return res.status(403).json({ message: "Demo access denied" });
      }
      const context = await getDemoContext(povHeader);
      if (!context) return res.status(403).json({ message: "Invalid Demo POV user" });
      const demoLeagueId = context.demoLeagueId!;
      req.demoContext = {
        environmentId: context.environmentId,
        demoLeagueId,
        povUserId: context.demoId,
        realActorId: dbUser.id,
      };
      // Existing routes use this claim for all permission and membership
      // checks, so only this effective identity is changed.
      (req as any).user.claims.sub = context.demoId;
      if (!await demoResourcesAreIsolated(req.demoContext, { ...(req.params ?? {}), ...(req.query ?? {}), ...(req.body ?? {}) }, req.path)) {
        return res.status(403).json({ message: "Demo resources must belong to the active Demo snapshot." });
      }
      if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
          (!demoMutationAllowed(req.method, req.path) || containsForbiddenDemoBody(req.body) ||
           !await demoBodyUserIdsAreMapped(context.environmentId, req.body))) {
        return res.status(403).json({ message: "This action is not available in Demo." });
      }
      if (/^\/api\/scrimmages(?:\/|$)/.test(req.path) && hasDemoPaymentScrimmageFields(req.body)) {
        return res.status(403).json({ message: "Paid and first-to-pay scrimmages are disabled in Demo." });
      }
    }

    return next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({ message: 'Unauthorized' });
  }
};
