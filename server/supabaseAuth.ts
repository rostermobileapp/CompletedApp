import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import type { Express, RequestHandler } from 'express';
import { storage } from './storage';
import { pool } from './db';
import { containsForbiddenDemoBody, demoBodyUserIdsAreMapped, demoMutationAllowed, demoResourcesAreIsolated, hasDemoPaymentScrimmageFields, DEMO_OWNER_DISPLAY_ID, getDemoContext } from './demo';
import { HighSchoolParentSecurity, ParentSecurityError, isParentSecurityDevelopment } from './highSchoolParentSecurity';
import { parentActorFromVerifiedToken, parentErrorResponse, parentGrantHeader, registerParentVerificationRoutes, requireDevParentAuthority } from './highSchoolParentHttp';
import { createDevelopmentParentMailer } from './developmentParentMailer';
import { createProductionParentMailer } from './productionParentMailer';
import { productionFamilyInstalled, productionFamilyEnrollmentEnabled } from './productionFamilyRuntime';
import { HighSchoolOnboarding } from './highSchoolOnboarding';
import { registerHighSchoolOnboarding } from './highSchoolOnboardingHttp';
import { HighSchoolYouthOnboarding } from './highSchoolYouthOnboarding';
import { HighSchoolChildDevices } from './highSchoolChildDevices';
import { registerHighSchoolYouthRoutes } from './highSchoolYouthHttp';
import { TeamSkinService } from './teamSkinService';
import { registerTeamSkinRoutes } from './teamSkinHttp';
import { HighSchoolStaffOperations } from './highSchoolStaffOperations';
import { SchoolLeagueManagement } from "./schoolLeagueManagement";
import { registerSchoolLeagueManagement } from "./schoolLeagueManagementHttp";
import { HighSchoolStaffEvents } from './highSchoolStaffEvents';
import { HighSchoolStaffChat } from './highSchoolStaffChat';
import { registerHighSchoolStaffRoutes } from './highSchoolStaffHttp';
import { SchoolEligibilityAlerts } from "./schoolEligibilityAlerts";
import { existingStaffPaymentEligibility } from './highSchoolStaffPaymentEligibility';
import { HighSchoolFamilySetup, HighSchoolFamilyReview } from './highSchoolFamilySetup';
import { registerHighSchoolFamilyRoutes } from './highSchoolFamilyHttp';
import { proCoverage, hasPersonalPro } from './proCoverage';
import { registerProductionOnboardingTests } from "./registerProductionOnboardingTests";

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

let devParentSecurity: HighSchoolParentSecurity | undefined;
let liveParentSecurity: HighSchoolParentSecurity | undefined;
function parentSecurity() {
  if (!isParentSecurityDevelopment()) return liveParentSecurity;
  return devParentSecurity ??= new HighSchoolParentSecurity(pool, createDevelopmentParentMailer());
}
const parentIssuer = () => `${new URL(process.env.SUPABASE_URL!).origin}/auth/v1`;
let devOnboarding: HighSchoolOnboarding | undefined;
function onboardingSecurity() {
  if (!isParentSecurityDevelopment()) return undefined;
  const parent=parentSecurity();
  return parent ? devOnboarding ??= new HighSchoolOnboarding(pool,parent) : undefined;
}

export async function isRetiredAccount(authId: string, email?: string): Promise<boolean> {
  const result = await pool.query(`SELECT 1 FROM account_user_merges WHERE source_user_id=$1
    OR ($2::text IS NOT NULL AND lower(trim(source_email))=lower(trim($2)))`, [authId, email || null]);
  return (result.rowCount ?? 0) > 0;
}

async function verifiedAdultSocketUser(accessToken: string, parentGrant?: string) {
  if (!accessToken || accessToken.length < 10) return null;
  const { data: { user }, error } = await supabase.auth.getUser(accessToken);
  if (error || !user) return null;
  const parent = parentSecurity();
  if (parent) {
    try { await requireDevParentAuthority(parent, user.id, accessToken, parentIssuer(), parentGrant, "adult_account"); }
    catch { return null; }
    // Revoked Auth sessions must not survive through a still-unexpired JWT.
    try {
      const actor = parentActorFromVerifiedToken(accessToken, user.id, parentIssuer());
      await parent.status(actor, parentGrant);
    } catch { return null; }
  }
  if (await onboardingSecurity()?.blocksLegacy(user.id,user.email,!!user.email_confirmed_at)) return null;
  if (await isRetiredAccount(user.id, user.email)) return null;
  return user;
}
export async function adultSocketAuthorized(accessToken: string, parentGrant?: string) {
  try { return !!await verifiedAdultSocketUser(accessToken, parentGrant); } catch { return false; }
}
export async function getAuthenticatedDatabaseUser(accessToken: string, parentGrant?: string) {
  const user = await verifiedAdultSocketUser(accessToken, parentGrant);
  if (!user) return null;
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
  if (process.env.NODE_ENV === "production" && await productionFamilyInstalled(pool)) {
    liveParentSecurity = new HighSchoolParentSecurity(pool, createProductionParentMailer(), true);
  }
  const parent = parentSecurity();
  if (parent) {
    if (!await parent.installed()) {
      throw new Error("DEV parent security must be explicitly installed before starting isolated development.");
    }
    registerParentVerificationRoutes(app, parent, async req => {
      const header = req.get("authorization");
      if (!header?.startsWith("Bearer ")) throw new ParentSecurityError("INVALID_SESSION", 401);
      const token = header.slice(7);
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) throw new ParentSecurityError("INVALID_SESSION", 401);
      return parentActorFromVerifiedToken(token, user.id, parentIssuer());
    });
    const onboarding=onboardingSecurity()!;
    const authenticateOnboarding = async (req: import('express').Request) => {
      const header=req.get("authorization");
      if(!header?.startsWith("Bearer "))throw new ParentSecurityError("INVALID_SESSION",401);
      const token=header.slice(7);
      const {data:{user},error}=await supabase.auth.getUser(token);
      if(error||!user)throw new ParentSecurityError("INVALID_SESSION",401);
      return {...parentActorFromVerifiedToken(token,user.id,parentIssuer()),email:user.email??"",
        emailVerified:!!user.email_confirmed_at,fixture:!!user.app_metadata?.synthetic_high_school_onboarding_dev};
    };
    if (!isParentSecurityDevelopment()) {
      const family = new HighSchoolFamilySetup(pool, parent, async (id, leagueId) =>
        await hasPersonalPro(id) ? "personal" : await proCoverage.hasProFor(id, { leagueId }) ? "league" : "uncovered",
      true, productionFamilyEnrollmentEnabled());
      registerHighSchoolFamilyRoutes(app, family, new HighSchoolFamilyReview(pool, undefined, undefined, true),
        parent, authenticateOnboarding, true);
      await registerProductionOnboardingTests(app,pool,parent,authenticateOnboarding,
        id=>storage.getUserTeams(id),(id,leagueId)=>proCoverage.hasProFor(id,{leagueId}));
      return;
    }
    if(!await onboarding.installed()) throw new Error("Explicit DEV onboarding installation is required.");
    const youth = new HighSchoolYouthOnboarding(pool, parent, onboarding);
    // No environment variable or client input can activate child access here.
    // The approved plan requires further provider, coverage and native proof.
    const children = new HighSchoolChildDevices(pool, parent, false);
    registerHighSchoolOnboarding(app,onboarding,parent,authenticateOnboarding,(actor, grant) => youth.state(actor, grant));
    registerHighSchoolYouthRoutes(app,youth,children,authenticateOnboarding);
    registerTeamSkinRoutes(app,new TeamSkinService(pool,id=>storage.getUserTeams(id)),parent,children,authenticateOnboarding);
    const staff = new HighSchoolStaffOperations(pool, existingStaffPaymentEligibility);
    registerSchoolLeagueManagement(app, new SchoolLeagueManagement(pool), authenticateOnboarding);
    onboarding.staffDecisions = staff;
    registerHighSchoolStaffRoutes(app,staff,new HighSchoolStaffEvents(pool),new HighSchoolStaffChat(pool),parent,authenticateOnboarding,false,new SchoolEligibilityAlerts(pool));
    const family = new HighSchoolFamilySetup(pool, parent, async (id, leagueId) =>
      await hasPersonalPro(id) ? "personal" : await proCoverage.hasProFor(id, { leagueId }) ? "league" : "uncovered");
    family.intake.staffDecisions = staff;
    registerHighSchoolFamilyRoutes(app, family, new HighSchoolFamilyReview(pool), parent, authenticateOnboarding);
  } else {
    // Backward-compatible recovery/availability contract before installation.
    // No family account can exist when productionFamilyInstalled returns false.
    app.get("/api/high-school/parent-verification/status", (_req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.json({ enrolled: false, verified: false });
    });
    app.get("/api/high-school/family/availability", (_req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.json({ enabled: false });
    });
  }
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
    if(await onboardingSecurity()?.blocksLegacy(user.id,user.email,!!user.email_confirmed_at)){
      return res.status(403).json({code:"HS_ONBOARDING_PENDING",message:"Finish the guarded DEV onboarding flow before using adult APIs."});
    }
    // Adult sign-in and child-device access are separate credentials. Ordinary
    // adult actions use route-specific permissions, not Family enrollment.
    // Parent/child-device/password endpoints enforce their own additional proof.
    const parent = parentSecurity();
    if (parent) {
      try {
        await requireDevParentAuthority(parent, user.id, token, parentIssuer(), req.get(parentGrantHeader), "adult_account");
      } catch (error) { return parentErrorResponse(res, error); }
    }
    if (await isRetiredAccount(user.id, user.email)) {
      return res.status(403).json({ message: 'This account was retired. Sign in with the surviving account.' });
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
