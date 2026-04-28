import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { objectStorageClient } from "./objectStorage";
import { messagingService } from "./messagingService";
import { setupAuth, isAuthenticated, supabase } from "./supabaseAuth";
import { 
  loadUserPermissions, 
  requireRole, 
  requireLeagueManagement, 
  requireStatsManagement, 
  requireUserManagement,
  requirePremiumFeatures,
  requireSpecialPermission,
  roleHierarchy
} from "./permissionMiddleware";
import { db } from "./db";
import { leagues, leagueMemberships, importedPlayers, teams, users, announcementPolls, createChatPollRequestSchema, type DutyTemplate, visitorCount, waitlistSignups, onboardingSportPoll, insertOnboardingSportPollSchema, tournaments, tournamentTeams, tournamentMatches, tournamentMatchRsvps, tournamentStats, tournamentParticipants, insertTournamentSchema, insertTournamentTeamSchema, insertTournamentMatchSchema, updateTournamentMatchSchema, games, dutyExclusions, gameScoreSubmissions, gameStars, playerStats, teamMemberships, conversationParticipants, seasons, substituteRequests } from "@shared/schema";
import { generateSingleElimination, generateDoubleElimination, generateRoundRobin, generateRoundRobinSplit, generateThreeGameGuarantee, applyBracketType } from "./tournaments/bracketGenerator";
import { getFormatRecommendations } from "./tournaments/formatRecommendations";
import { eq, and, or, ilike, sql, inArray, isNotNull } from "drizzle-orm";
import { format, addDays, addWeeks, addMonths } from "date-fns";
import { formatScrimmageDateTime, formatFullDateTime, formatDayAndTime, formatShortDayAndTime, parseLeagueLocalDateTime } from "./dateUtils";
import {
  insertLeagueSchema,
  insertTeamSchema,
  insertLeagueMembershipSchema,
  insertTeamMembershipSchema,
  insertGameSchema,
  insertPersonalReminderSchema,
  insertGameRsvpSchema,
  insertSubstituteRequestSchema,
  insertMessageSchema,
  insertAnnouncementSchema,
  insertAnnouncementAttachmentSchema,
  insertAnnouncementReactionSchema,
  insertAnnouncementPollSchema,
  insertAnnouncementPollVoteSchema,
  createAnnouncementRequestSchema,
  updateAnnouncementRequestSchema,
  createAnnouncementReactionRequestSchema,
  createAnnouncementPollRequestSchema,
  createAnnouncementPollVoteRequestSchema,
  insertScrimmageSchema,
  insertScrimmageRequestSchema,
  updateScrimmageRequestSchema,
  createSubstituteRequestSchema,
  getSubstituteRequestsQuerySchema,
  approveSubstituteRequestSchema,
  getPendingApprovalsQuerySchema,
  updateSubstituteRequestSchema,
  insertPlayerStatsSchema,
  insertLineCombinationSchema,
  insertLineCombinationAssignmentSchema,
  createLineCombinationRequestSchema,
  createLineCombinationAssignmentRequestSchema,
  updateLineCombinationRequestSchema,
  createFeedbackSubmissionSchema,
  createPaymentRequestSchema,
  updatePaymentRequestRecipientSchema,
  createFacilityRequestSchema,
  updateFacilityRequestSchema,
  createFacilityMembershipRequestSchema,
  createCalendarEventRequestSchema,
  updateCalendarEventRequestSchema,
  createEventParticipantRequestSchema,
  createTeamEventRequestSchema,
  updateTeamEventRequestSchema,
  teamEvents,
  teamEventRsvps,
} from "@shared/schema";
import { z, ZodError } from "zod";
import multer from "multer";
import Papa from "papaparse";
import * as fs from 'fs';
import * as path from 'path';
import Stripe from "stripe";
import { nanoid } from "nanoid";
import { sendBulkScrimmageInvites, sendScrimmageApprovalEmail, sendScrimmageReminderEmail, sendWelcomeEmail } from "./emails";
import { startEventReminderJob } from "./eventReminderJob";
import { startTournamentAccessJob } from "./tournamentAccessJob";
import { startScrimmageInviteJob } from "./scrimmageInviteJob";
import { getUncachableResendClient } from "./resend";
import { sendTeamEventPushNotification } from "./oneSignalNotifications";

// Module-level map to store active WebSocket connections by user ID
// This allows broadcasting from anywhere in routes.ts
const activeConnections = new Map<string, WebSocket>();

// Helper function to broadcast a message to a specific user via WebSocket
export function broadcastToUser(userId: string, message: any) {
  const connection = activeConnections.get(userId);
  if (connection && connection.readyState === WebSocket.OPEN) {
    connection.send(JSON.stringify(message));
    return true;
  }
  return false;
}

// Helper function to broadcast notification count update to a user
// This enables real-time notification badges without polling
export function broadcastNotificationUpdate(userId: string) {
  broadcastToUser(userId, {
    type: 'notification_update',
    timestamp: new Date().toISOString()
  });
}

// Helper function to format date as local time string without timezone suffix
// Returns format: "YYYY-MM-DDTHH:MM:SS" which prevents timezone adjustments on frontend
function formatDateAsLocalString(date: Date | string | null | undefined): string {
  if (!date) return new Date().toISOString().slice(0, 19);
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

// Utility function to format game scheduledAt as local time string (no timezone conversion)
function formatGameForResponse(game: any) {
  if (game && game.scheduledAt) {
    return {
      ...game,
      scheduledAt: formatDateAsLocalString(game.scheduledAt)
    };
  }
  return game;
}

// Helper function to check if user has scorekeeper permission
async function checkScorekeeperPermission(userId: string, game: { leagueId?: string | null }): Promise<boolean> {
  // If no league, only the user's own stats can be managed
  if (!game.leagueId) {
    return false;
  }

  // Check if user is the commissioner of the league
  const league = await storage.getLeague(game.leagueId);
  if (league && league.commissionerId === userId) {
    return true;
  }

  // Check global stat_manager permission
  const user = await storage.getUser(userId);
  if (user?.specialPermissions?.includes('stat_manager')) {
    return true;
  }

  // Check league-specific stat_manager permission
  const leaguePermissions = await storage.getUserLeaguePermissions(userId, game.leagueId);
  if (leaguePermissions?.leagueSpecialPermissions?.includes('stat_manager')) {
    return true;
  }

  return false;
}


// Short-lived server-side cache for GET /api/visitor-locations.
// Avoids running 4 DB queries on every page load while keeping heatmap data
// fresh within 60 seconds. Invalidated immediately when a new visitor is recorded.
const VISITOR_CACHE_TTL_MS = 60_000;
type VisitorLocationsPayload = {
  locations: { lat: string; lng: string }[];
  total: number;
  cities: { city: string; country: string; count: number }[];
};
let visitorLocationsCache: { data: VisitorLocationsPayload; timestamp: number } | null = null;

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Initialize user registration count table
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_registration_count (
        id INTEGER PRIMARY KEY DEFAULT 1,
        count INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    // Seed or re-sync: only count authenticated (non-placeholder) users
    const userCountResult = await db.execute(sql`
      SELECT COUNT(*)::int as total FROM users 
      WHERE email IS NOT NULL AND email NOT LIKE '%@placeholder.roster'
    `);
    const currentUserCount = userCountResult.rows?.[0]?.total ?? 0;
    const existing = await db.execute(sql`SELECT count FROM user_registration_count WHERE id = 1`);
    if (!existing.rows || existing.rows.length === 0) {
      await db.execute(sql`
        INSERT INTO user_registration_count (id, count) VALUES (1, ${currentUserCount})
      `);
      console.log(`[Init] Seeded user registration count with ${currentUserCount} authenticated users`);
    } else {
      await db.execute(sql`
        UPDATE user_registration_count SET count = ${currentUserCount}, updated_at = NOW() WHERE id = 1
      `);
      console.log(`[Init] Re-synced user registration count to ${currentUserCount} authenticated users`);
    }
  } catch (e) {
    console.error('Error initializing user_registration_count table:', e);
  }

  // Returns a signed GCS URL for the demo video so the browser streams directly from GCS
  app.get('/api/demo-video-url', async (req, res) => {
    const SIDECAR = 'http://127.0.0.1:1106';
    const BUCKET = 'replit-objstore-79978f98-4528-493b-b950-64f3b6ab9dbf';
    const OBJECT = 'public/demo.mp4';
    try {
      const response = await fetch(`${SIDECAR}/object-storage/signed-object-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucket_name: BUCKET,
          object_name: OBJECT,
          method: 'GET',
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour
        }),
      });
      if (!response.ok) throw new Error(`Sidecar responded ${response.status}`);
      const { signed_url } = await response.json();
      res.json({ url: signed_url });
    } catch (err) {
      console.warn('[demo-video-url] Sidecar unavailable, falling back to static path:', err);
      res.json({ url: '/demo.mp4' });
    }
  });

  // User registration count route (public)
  app.get('/api/user-count', async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT count FROM user_registration_count WHERE id = 1
      `);
      const count = result.rows?.[0]?.count ?? 0;
      res.json({ count });
    } catch (error) {
      console.error("Error fetching user count:", error);
      res.status(500).json({ message: "Failed to fetch user count" });
    }
  });

  // Visitor count routes (public)
  app.get('/api/visitor-count', async (req, res) => {
    try {
      const [visitor] = await db.select().from(visitorCount).limit(1);
      if (!visitor) {
        // Initialize if doesn't exist
        const [newVisitor] = await db.insert(visitorCount).values({ id: 1, count: 0 }).returning();
        return res.json({ count: newVisitor.count });
      }
      res.json({ count: visitor.count });
    } catch (error) {
      console.error("Error fetching visitor count:", error);
      res.status(500).json({ message: "Failed to fetch visitor count" });
    }
  });

  // OneSignal config endpoint (public - needed before auth)
  app.get('/api/config/onesignal', (req, res) => {
    const appId = process.env.ONESIGNAL_APP_ID;
    if (appId) {
      res.json({ appId });
    } else {
      res.json({ appId: null, error: 'ONESIGNAL_APP_ID not configured' });
    }
  });

  app.post('/api/visitor-count/increment', async (req, res) => {
    try {
      // Atomic increment using SQL to prevent race conditions
      const result = await db.execute(sql`
        UPDATE visitor_count 
        SET count = count + 1, updated_at = NOW() 
        WHERE id = 1 
        RETURNING *
      `);
      
      if (result.rows && result.rows.length > 0) {
        return res.json({ count: result.rows[0].count });
      }
      
      // If no row exists, initialize it
      const [newVisitor] = await db.insert(visitorCount).values({ id: 1, count: 1 }).returning();
      res.json({ count: newVisitor.count });
    } catch (error) {
      console.error("Error incrementing visitor count:", error);
      res.status(500).json({ message: "Failed to increment visitor count" });
    }
  });

  // Visitor location heatmap endpoints (public)
  app.post('/api/visitor-location', async (req, res) => {
    try {
      const { ipHash, lat, lng, city, country } = req.body;
      if (!ipHash || lat === undefined || lng === undefined || !country) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      // Validate ipHash is a 64-char hex SHA-256 string
      if (typeof ipHash !== 'string' || !/^[0-9a-f]{64}$/.test(ipHash)) {
        return res.status(400).json({ message: "Invalid ipHash format" });
      }
      // Validate numeric coordinates
      const latNum = Number(lat);
      const lngNum = Number(lng);
      if (isNaN(latNum) || isNaN(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
        return res.status(400).json({ message: "Invalid coordinates" });
      }
      // Validate within US/Canada geographic bounding box
      if (latNum < 24 || latNum > 84 || lngNum < -170 || lngNum > -52) {
        return res.status(400).json({ message: "Coordinates outside supported region" });
      }
      if (country !== 'US' && country !== 'CA') {
        return res.status(200).json({ skipped: true });
      }
      const alreadyVisited = await storage.hasRecentVisit(ipHash, 24 * 60 * 60 * 1000);
      if (!alreadyVisited) {
        await storage.recordVisitorLocation({ ipHash, lat: String(latNum), lng: String(lngNum), city: typeof city === 'string' ? city.slice(0, 100) : null, country });
        // Invalidate the heatmap cache so the new visitor appears on the next GET
        visitorLocationsCache = null;
      }
      res.json({ recorded: !alreadyVisited });
    } catch (error) {
      console.error("Error recording visitor location:", error);
      res.status(500).json({ message: "Failed to record visitor location" });
    }
  });

  app.get('/api/visitor-locations', async (req, res) => {
    try {
      const now = Date.now();
      if (visitorLocationsCache && now - visitorLocationsCache.timestamp < VISITOR_CACHE_TTL_MS) {
        return res.json(visitorLocationsCache.data);
      }
      const [ipLocations, userLocations, total, cities] = await Promise.all([
        storage.getVisitorLocations(),
        storage.getUsersWithCoordinates(),
        storage.getVisitorLocationCount(),
        storage.getCityVisitorCounts(20),
      ]);
      const locations = [...ipLocations, ...userLocations];
      visitorLocationsCache = { data: { locations, total, cities }, timestamp: now };
      res.json({ locations, total, cities });
    } catch (error) {
      console.error("Error fetching visitor locations:", error);
      res.status(500).json({ message: "Failed to fetch visitor locations" });
    }
  });

  // Waitlist signup (public)
  app.post('/api/waitlist', async (req, res) => {
    try {
      const { firstName, email, phone, howHeard } = req.body;
      
      if (!firstName || !email) {
        return res.status(400).json({ message: "First name and email are required" });
      }

      const audienceId = process.env.RESEND_WAITLIST_AUDIENCE_ID;
      if (!audienceId) {
        console.error("RESEND_WAITLIST_AUDIENCE_ID is not configured");
        return res.status(500).json({ message: "Waitlist is not configured properly" });
      }

      // Save signup to database
      await db.insert(waitlistSignups).values({
        firstName,
        email,
        phone: phone || null,
        howHeard: howHeard || null,
      });

      // Add contact to Resend for marketing campaigns
      const { client: resend } = await getUncachableResendClient();
      
      const { data, error } = await resend.contacts.create({
        email,
        firstName,
        unsubscribed: false,
        audienceId,
      });

      if (error) {
        console.error("Resend contact creation error:", JSON.stringify(error, null, 2));
        // If it's a duplicate email error, still return success
        if (error.message?.includes('already exists') || error.message?.includes('Contact already exists')) {
          return res.json({ success: true, message: "You're already on the waitlist!" });
        }
        throw error;
      }
      
      res.json({ success: true, message: "Successfully joined waitlist" });
    } catch (error: any) {
      console.error("Error adding to waitlist:", error?.message || error);
      res.status(500).json({ message: "Failed to join waitlist" });
    }
  });

  // Onboarding sport poll (no auth required — pre-signup data collection)
  app.post('/api/onboarding-sport-poll', async (req, res) => {
    try {
      const data = insertOnboardingSportPollSchema.parse(req.body);
      await db.insert(onboardingSportPoll).values(data);
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving sport poll response:", error);
      res.status(500).json({ message: "Failed to save poll response" });
    }
  });

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Alias for /api/auth/user
  app.get('/api/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.patch('/api/auth/user/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { firstName, lastName, city, age, phoneNumber, dateOfBirth, playerType, email, timezone, zipCode } = req.body;
      
      const profileData: any = {};
      if (firstName !== undefined) profileData.firstName = firstName;
      if (lastName !== undefined) profileData.lastName = lastName;
      if (city !== undefined) profileData.city = city;
      if (age !== undefined) profileData.age = parseInt(age);
      if (phoneNumber !== undefined) profileData.phoneNumber = phoneNumber;
      if (dateOfBirth !== undefined) profileData.dateOfBirth = dateOfBirth;
      if (playerType !== undefined) profileData.playerType = playerType;
      if (email !== undefined) profileData.email = email;
      if (timezone !== undefined) {
        profileData.timezone = timezone;
        profileData.timezoneManuallySet = true;
      }
      if (zipCode !== undefined) {
        profileData.zipCode = zipCode;
        // Always start by clearing coordinates — only set them if geocoding succeeds
        profileData.lat = null;
        profileData.lng = null;
        // Geocode the zip code using zippopotam.us (free, no key required)
        if (zipCode && zipCode.trim()) {
          type ZippopotamPlace = { latitude: string; longitude: string };
          type ZippopotamResponse = { places?: ZippopotamPlace[] };
          try {
            // Normalize: remove spaces for Canadian codes like "T2P 3C8" → "T2P3C8"
            const cleanZip = zipCode.trim().replace(/\s+/g, '').toUpperCase();
            let geoData: ZippopotamResponse | null = null;
            const usRes = await fetch(`https://api.zippopotam.us/us/${cleanZip}`);
            if (usRes.ok) {
              geoData = (await usRes.json()) as ZippopotamResponse;
            } else {
              // Try Canadian postal code
              const caRes = await fetch(`https://api.zippopotam.us/ca/${cleanZip}`);
              if (caRes.ok) geoData = (await caRes.json()) as ZippopotamResponse;
            }
            if (geoData?.places && geoData.places.length > 0) {
              profileData.lat = geoData.places[0].latitude;
              profileData.lng = geoData.places[0].longitude;
            }
            // If neither API returned data, lat/lng remain null (stale data cleared above)
          } catch (geoErr) {
            console.error("Zip geocoding failed (non-fatal):", geoErr);
            // lat/lng already set to null above, so stale coordinates are cleared
          }
        }
      }

      const user = await storage.updateUserProfile(userId, profileData);
      
      if (firstName !== undefined || lastName !== undefined) {
        try {
          const updateFields: any = {};
          if (firstName !== undefined) updateFields.displayFirstName = firstName;
          if (lastName !== undefined) updateFields.displayLastName = lastName;
          await db.update(leagueMemberships)
            .set(updateFields)
            .where(eq(leagueMemberships.userId, userId));
        } catch (err) {
          console.error("Error syncing league membership display names:", err);
        }
      }
      
      res.json(user);
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.patch('/api/auth/user/image', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { profileImageUrl } = req.body;

      if (!profileImageUrl) {
        return res.status(400).json({ message: "Profile image URL is required" });
      }

      const user = await storage.updateUserImage(userId, profileImageUrl);
      res.json(user);
    } catch (error) {
      console.error("Error updating user image:", error);
      res.status(500).json({ message: "Failed to update profile image" });
    }
  });

  app.delete('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      // Use the real Supabase auth ID for auth deletion — in migration scenarios
      // the DB user ID (sub) may differ from the current Supabase auth ID
      const supabaseAuthId = req.user.claims.supabaseId || userId;
      
      // First delete user data from our database
      await storage.deleteUser(userId);
      
      // Then delete the user from Supabase authentication using the real auth ID
      const { error: supabaseError } = await supabase.auth.admin.deleteUser(supabaseAuthId);
      if (supabaseError) {
        console.error("Error deleting user from Supabase auth:", supabaseError);
        // Continue anyway since database deletion succeeded
      }
      
      res.json({ message: "Profile deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting user:", error);
      res.status(400).json({ message: error.message || "Failed to delete profile" });
    }
  });

  // Get user's navigation preferences
  app.get('/api/user/navigation-preferences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json({ preferences: user.navigationPreferences || null });
    } catch (error) {
      console.error("Error fetching navigation preferences:", error);
      res.status(500).json({ message: "Failed to fetch navigation preferences" });
    }
  });

  // Update user's navigation preferences
  app.patch('/api/user/navigation-preferences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { preferences } = req.body;
      
      // Validate preferences structure
      if (!preferences || typeof preferences !== 'object') {
        return res.status(400).json({ message: "Invalid preferences format" });
      }
      
      // Validate shortcuts array
      if (preferences.shortcuts) {
        if (!Array.isArray(preferences.shortcuts)) {
          return res.status(400).json({ message: "Shortcuts must be an array" });
        }
        
        if (preferences.shortcuts.length > 5) {
          return res.status(400).json({ message: "Maximum 5 shortcuts allowed" });
        }
        
        // Validate all shortcuts are valid IDs
        const validShortcutIds = ['teams', 'messages', 'home', 'profile', 'schedule', 'league-management', 'scrimmages'];
        const invalidShortcuts = preferences.shortcuts.filter((id: string) => !validShortcutIds.includes(id));
        
        if (invalidShortcuts.length > 0) {
          return res.status(400).json({ message: `Invalid shortcut IDs: ${invalidShortcuts.join(', ')}` });
        }
      }
      
      const user = await storage.updateUserNavigationPreferences(userId, preferences);
      res.json({ preferences: user.navigationPreferences });
    } catch (error) {
      console.error("Error updating navigation preferences:", error);
      res.status(500).json({ message: "Failed to update navigation preferences" });
    }
  });

  // Get teams where user is a captain
  app.get('/api/user/captain-teams', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const captainTeams = await storage.getTeamsWhereCaptain(userId);
      res.json(captainTeams);
    } catch (error) {
      console.error("Error fetching captain teams:", error);
      res.status(500).json({ message: "Failed to fetch captain teams" });
    }
  });

  // Onboarding Routes
  app.get('/api/user/onboarding', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json({
        onboardingCompleted: user.onboardingCompleted || false,
        onboardingProgress: user.onboardingProgress || {},
        selectedFacilityId: user.selectedFacilityId || null,
      });
    } catch (error) {
      console.error("Error fetching onboarding status:", error);
      res.status(500).json({ message: "Failed to fetch onboarding status" });
    }
  });

  app.patch('/api/user/onboarding', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const {
        firstName,
        lastName,
        email,
        phoneNumber,
        dateOfBirth,
        city,
        playerType,
        profileImageUrl,
        venmoUsername,
        cashappUsername,
        timezone,
        competitiveLevel,
        rosterUseCase,
        selectedFacilityId,
        onboardingProgress,
        onboardingCompleted,
        role,
      } = req.body;

      const updateData: any = {};
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (email !== undefined) updateData.email = email;
      if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
      if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth;
      if (city !== undefined) updateData.city = city;
      if (playerType !== undefined) updateData.playerType = playerType;
      if (profileImageUrl !== undefined) updateData.profileImageUrl = profileImageUrl;
      if (venmoUsername !== undefined) updateData.venmoUsername = venmoUsername;
      if (cashappUsername !== undefined) updateData.cashappUsername = cashappUsername;
      if (timezone !== undefined) updateData.timezone = timezone;
      if (competitiveLevel !== undefined) updateData.competitiveLevel = competitiveLevel;
      if (rosterUseCase !== undefined) updateData.rosterUseCase = rosterUseCase;
      if (selectedFacilityId !== undefined) updateData.selectedFacilityId = selectedFacilityId;
      if (onboardingProgress !== undefined) updateData.onboardingProgress = onboardingProgress;
      if (onboardingCompleted !== undefined) updateData.onboardingCompleted = onboardingCompleted;
      if (role !== undefined) updateData.role = role;

      const user = await storage.updateUserOnboarding(userId, updateData);
      res.json(user);
    } catch (error) {
      console.error("Error updating onboarding:", error);
      res.status(500).json({ message: "Failed to update onboarding" });
    }
  });

  // User Notifications Routes
  app.get('/api/notifications', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const notifications = await storage.getUserNotifications(userId);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.get('/api/notifications/unread', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const unreadNotifications = await storage.getUnreadNotifications(userId);
      res.json({ count: unreadNotifications.length, notifications: unreadNotifications });
    } catch (error) {
      console.error("Error fetching unread notifications:", error);
      res.status(500).json({ message: "Failed to fetch unread notifications" });
    }
  });

  app.patch('/api/notifications/:id/read', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const notification = await storage.markNotificationAsRead(id, userId);
      
      if (!notification) {
        return res.status(404).json({ message: "Notification not found or access denied" });
      }
      
      res.json(notification);
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  app.patch('/api/notifications/:id/dismiss', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const notification = await storage.dismissNotification(id, userId);
      
      if (!notification) {
        return res.status(404).json({ message: "Notification not found or access denied" });
      }
      
      res.json(notification);
    } catch (error) {
      console.error("Error dismissing notification:", error);
      res.status(500).json({ message: "Failed to dismiss notification" });
    }
  });

  // Push Notification Preferences Routes
  app.get('/api/notification-preferences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const preferences = await storage.getNotificationPreferences(userId);
      
      if (!preferences) {
        // Return default preferences if none exist
        return res.json({
          userId,
          notificationSettings: {
            inAppMessages: true,
            paymentRequests: true,
            substitutionRequests: true,
            joinRequests: true,
            upcomingEvents: true,
            newsAnnouncements: true,
            scrimmageInvites: true,
            playerRsvpUpdates: true,
            photoTagNotifications: true,
          },
          pushEnabled: false,
          oneSignalPlayerId: null,
        });
      }
      
      res.json(preferences);
    } catch (error) {
      console.error("Error fetching notification preferences:", error);
      res.status(500).json({ message: "Failed to fetch notification preferences" });
    }
  });

  app.put('/api/notification-preferences', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { notificationSettings, pushEnabled } = req.body;
      
      const updateData: any = {};
      if (notificationSettings !== undefined) {
        // Validate notification settings structure
        const validKeys = ['inAppMessages', 'paymentRequests', 'substitutionRequests', 'joinRequests', 'upcomingEvents', 'newsAnnouncements', 'scrimmageInvites', 'playerRsvpUpdates', 'photoTagNotifications'];
        const settings: Record<string, boolean> = {};
        
        for (const key of validKeys) {
          if (typeof notificationSettings[key] === 'boolean') {
            settings[key] = notificationSettings[key];
          } else {
            settings[key] = true; // Default to enabled if not specified
          }
        }
        
        updateData.notificationSettings = settings;
      }
      
      if (typeof pushEnabled === 'boolean') {
        updateData.pushEnabled = pushEnabled;
      }
      
      const preferences = await storage.upsertNotificationPreferences(userId, updateData);
      res.json(preferences);
    } catch (error) {
      console.error("Error updating notification preferences:", error);
      res.status(500).json({ message: "Failed to update notification preferences" });
    }
  });

  // OneSignal / BuildNatively Push Notification Endpoints
  
  // Register OneSignal Player ID (subscription ID)
  app.post('/api/notification-preferences/player-id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { playerId } = req.body;
      
      if (!playerId || typeof playerId !== 'string') {
        return res.status(400).json({ message: "playerId is required and must be a string" });
      }
      
      const preferences = await storage.updateOneSignalPlayerId(userId, playerId);
      console.log(`[OneSignal] Player ID registered for user ${userId}: ${playerId}`);
      
      res.json({ 
        success: true, 
        playerId: preferences.oneSignalPlayerId 
      });
    } catch (error) {
      console.error("Error registering OneSignal player ID:", error);
      res.status(500).json({ message: "Failed to register player ID" });
    }
  });

  // Clear OneSignal IDs on logout so the device no longer receives push notifications
  app.post('/api/notification-preferences/clear-device', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      await storage.clearOneSignalIds(userId);
      console.log(`[OneSignal] Cleared subscription IDs for user ${userId} on logout`);
      res.json({ success: true });
    } catch (error) {
      console.error("Error clearing OneSignal IDs:", error);
      res.status(500).json({ message: "Failed to clear device IDs" });
    }
  });

  // Link External ID to OneSignal subscription via backend REST API
  // This is a fallback method when the SDK methods fail
  app.post('/api/notification-preferences/link-external-id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { oneSignalId, userId: externalId } = req.body;
      
      if (!externalId) {
        return res.status(400).json({ message: "userId (externalId) is required" });
      }
      
      // Get user's displayId to use as external ID
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const externalIdToUse = user.displayId || externalId;
      
      // Save to our database — only update oneSignalPlayerId if a non-empty value was provided
      const updateData: { oneSignalExternalId: string; oneSignalPlayerId?: string } = {
        oneSignalExternalId: externalIdToUse,
      };
      if (oneSignalId) {
        updateData.oneSignalPlayerId = oneSignalId;
      }
      const preferences = await storage.upsertNotificationPreferences(userId, updateData);
      
      // Try to link via OneSignal REST API if API key is configured
      const oneSignalAppId = process.env.ONESIGNAL_APP_ID;
      const oneSignalRestApiKey = process.env.ONESIGNAL_REST_API_KEY;
      
      if (oneSignalId && oneSignalAppId && oneSignalRestApiKey) {
        try {
          // Build tags object with user email for cross-referencing with Supabase
          const tags: Record<string, string> = {};
          if (user.email) {
            tags.email = user.email;
          }
          if (user.displayId) {
            tags.display_id = user.displayId;
          }
          
          // Use OneSignal's REST API to set the external user ID and email tag
          const response = await fetch(`https://onesignal.com/api/v1/players/${oneSignalId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Basic ${oneSignalRestApiKey}`,
            },
            body: JSON.stringify({
              app_id: oneSignalAppId,
              external_user_id: externalIdToUse,
              tags,
            }),
          });
          
          if (response.ok) {
            console.log(`[OneSignal] External ID and email linked for user ${userId}: ${externalIdToUse}, email: ${user.email || 'N/A'}`);
          } else {
            const errorData = await response.text();
            console.warn(`[OneSignal] REST API link failed:`, errorData);
          }
        } catch (apiError) {
          console.error('[OneSignal] REST API error:', apiError);
          // Continue - we've saved to our DB at least
        }
      } else {
        console.log(`[OneSignal] External ID saved to DB only (no REST API key configured): ${externalIdToUse}`);
      }
      
      res.json({ 
        success: true, 
        externalId: preferences.oneSignalExternalId 
      });
    } catch (error) {
      console.error("Error linking external ID:", error);
      res.status(500).json({ message: "Failed to link external ID" });
    }
  });

  // Sync email to OneSignal for the current user (refresh email tag)
  app.post('/api/notification-preferences/sync-email', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const preferences = await storage.getNotificationPreferences(userId);
      if (!preferences?.oneSignalPlayerId) {
        return res.status(400).json({ message: "No OneSignal subscription found for this user" });
      }
      
      const oneSignalAppId = process.env.ONESIGNAL_APP_ID;
      const oneSignalRestApiKey = process.env.ONESIGNAL_REST_API_KEY;
      
      if (!oneSignalAppId || !oneSignalRestApiKey) {
        return res.status(500).json({ message: "OneSignal is not configured" });
      }
      
      const tags: Record<string, string> = {};
      if (user.email) {
        tags.email = user.email;
      }
      if (user.displayId) {
        tags.display_id = user.displayId;
      }
      
      const response = await fetch(`https://onesignal.com/api/v1/players/${preferences.oneSignalPlayerId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${oneSignalRestApiKey}`,
        },
        body: JSON.stringify({
          app_id: oneSignalAppId,
          tags,
        }),
      });
      
      if (response.ok) {
        console.log(`[OneSignal] Email synced for user ${userId}: ${user.email}`);
        res.json({ success: true, email: user.email, displayId: user.displayId });
      } else {
        const errorData = await response.text();
        console.error(`[OneSignal] Email sync failed for user ${userId}:`, errorData);
        res.status(500).json({ message: "Failed to sync email to OneSignal" });
      }
    } catch (error) {
      console.error("Error syncing email to OneSignal:", error);
      res.status(500).json({ message: "Failed to sync email" });
    }
  });

  // Admin endpoint: Bulk sync all users' emails to OneSignal
  app.post('/api/admin/sync-onesignal-emails', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Check if user has admin permissions
      if (!user?.specialPermissions?.includes('admin')) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const oneSignalAppId = process.env.ONESIGNAL_APP_ID;
      const oneSignalRestApiKey = process.env.ONESIGNAL_REST_API_KEY;
      
      if (!oneSignalAppId || !oneSignalRestApiKey) {
        return res.status(500).json({ message: "OneSignal is not configured" });
      }
      
      // Get all users with OneSignal subscriptions
      const allPreferences = await storage.getAllNotificationPreferencesWithUsers();
      
      let synced = 0;
      let failed = 0;
      const errors: string[] = [];
      
      for (const pref of allPreferences) {
        if (!pref.oneSignalPlayerId || !pref.user) continue;
        
        const tags: Record<string, string> = {};
        if (pref.user.email) {
          tags.email = pref.user.email;
        }
        if (pref.user.displayId) {
          tags.display_id = pref.user.displayId;
        }
        
        if (Object.keys(tags).length === 0) continue;
        
        try {
          const response = await fetch(`https://onesignal.com/api/v1/players/${pref.oneSignalPlayerId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Basic ${oneSignalRestApiKey}`,
            },
            body: JSON.stringify({
              app_id: oneSignalAppId,
              tags,
            }),
          });
          
          if (response.ok) {
            synced++;
            console.log(`[OneSignal Bulk Sync] Email synced for user ${pref.userId}: ${pref.user.email}`);
          } else {
            failed++;
            const errorData = await response.text();
            errors.push(`User ${pref.userId}: ${errorData}`);
          }
        } catch (error) {
          failed++;
          errors.push(`User ${pref.userId}: ${String(error)}`);
        }
        
        // Rate limit: wait 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      console.log(`[OneSignal Bulk Sync] Complete. Synced: ${synced}, Failed: ${failed}`);
      res.json({ success: true, synced, failed, errors: errors.slice(0, 10) });
    } catch (error) {
      console.error("Error in bulk email sync:", error);
      res.status(500).json({ message: "Bulk sync failed" });
    }
  });

  // Send test push notification
  app.post('/api/notification-preferences/test', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { type = 'message' } = req.body;
      
      // Get user's notification preferences
      const preferences = await storage.getNotificationPreferences(userId);
      
      if (!preferences?.oneSignalPlayerId) {
        return res.json({ 
          success: false, 
          message: "No OneSignal Player ID registered. Please enable push notifications first." 
        });
      }
      
      const oneSignalAppId = process.env.ONESIGNAL_APP_ID;
      const oneSignalRestApiKey = process.env.ONESIGNAL_REST_API_KEY;
      
      if (!oneSignalAppId || !oneSignalRestApiKey) {
        return res.json({ 
          success: false, 
          message: "OneSignal is not configured on the server." 
        });
      }
      
      // Get user info for personalized message
      const user = await storage.getUser(userId);
      const userName = user?.firstName || 'there';
      
      // Create test notification content based on type
      const notificationContent: Record<string, { title: string; message: string }> = {
        message: {
          title: '💬 Test Message',
          message: `Hey ${userName}! This is a test notification. If you see this, push notifications are working!`,
        },
        payment: {
          title: '💳 Test Payment Request',
          message: `This is a test payment notification. Your push notifications are set up correctly!`,
        },
        reminder: {
          title: '🏒 Test Game Reminder',
          message: `This is a test game reminder. You'll receive notifications like this before your games!`,
        },
      };
      
      const content = notificationContent[type] || notificationContent.message;
      
      // Send notification via OneSignal REST API
      // Try to target by external_user_id first (more reliable), fall back to subscription_id
      const targetFilter = preferences.oneSignalExternalId
        ? { include_external_user_ids: [preferences.oneSignalExternalId] }
        : { include_subscription_ids: [preferences.oneSignalPlayerId] };
      
      console.log(`[OneSignal Test] Targeting user ${userId} with:`, JSON.stringify(targetFilter));
      
      const response = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${oneSignalRestApiKey}`,
        },
        body: JSON.stringify({
          app_id: oneSignalAppId,
          ...targetFilter,
          // Required when using include_external_user_ids to specify push channel
          ...(preferences.oneSignalExternalId ? { channel_for_external_user_ids: 'push' } : {}),
          headings: { en: content.title },
          contents: { en: content.message },
          ios_badgeType: 'Increase',
          ios_badgeCount: 1,
          ...(process.env.ONESIGNAL_ANDROID_CHANNEL_ID ? { android_channel_id: process.env.ONESIGNAL_ANDROID_CHANNEL_ID } : {}),
        }),
      });
      
      const responseData = await response.json();
      
      if (response.ok && responseData.id) {
        console.log(`[OneSignal] Test notification sent to user ${userId}:`, responseData.id);
        res.json({ 
          success: true, 
          notificationId: responseData.id 
        });
      } else {
        console.warn(`[OneSignal] Test notification failed:`, responseData);
        res.json({ 
          success: false, 
          message: responseData.errors?.[0] || "Failed to send test notification" 
        });
      }
    } catch (error) {
      console.error("Error sending test notification:", error);
      res.status(500).json({ message: "Failed to send test notification" });
    }
  });

  // Personal Reminders Routes
  app.get('/api/user/personal-reminders', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const reminders = await storage.getUserPersonalReminders(userId);
      res.json(reminders);
    } catch (error) {
      console.error("Error fetching personal reminders:", error);
      res.status(500).json({ message: "Failed to fetch personal reminders" });
    }
  });

  app.post('/api/personal-reminders', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const reminderData = insertPersonalReminderSchema.parse({
        ...req.body,
        userId
      });
      
      const reminder = await storage.createPersonalReminder(reminderData);
      res.json(reminder);
    } catch (error) {
      console.error("Error creating personal reminder:", error);
      res.status(500).json({ message: "Failed to create personal reminder" });
    }
  });

  app.delete('/api/personal-reminders/:reminderId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { reminderId } = req.params;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      await storage.deletePersonalReminder(reminderId, userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting personal reminder:", error);
      res.status(500).json({ message: "Failed to delete personal reminder" });
    }
  });

  // Get user's created scrimmages - MUST be before /api/users/:userId
  app.get('/api/users/scrimmages', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      
      const scrimmages = await storage.getUserScrimmages(userId);
      res.json(scrimmages);
    } catch (error) {
      console.error('Error fetching user scrimmages:', error);
      res.status(500).json({ message: 'Failed to fetch user scrimmages' });
    }
  });

  // Get player's scrimmage requests - MUST be before /api/users/:userId
  app.get('/api/users/scrimmage-requests', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      
      const requests = await storage.getScrimmageRequestsByPlayer(userId);
      res.json(requests);
    } catch (error) {
      console.error('Error fetching player requests:', error);
      res.status(500).json({ message: 'Failed to fetch player requests' });
    }
  });

  // Get user's scrimmage invites - MUST be before /api/users/:userId
  app.get('/api/users/scrimmage-invites', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      
      const invites = await storage.getScrimmageInvitesForUser(userId);
      res.json(invites);
    } catch (error) {
      console.error('Error fetching user scrimmage invites:', error);
      res.status(500).json({ message: 'Failed to fetch scrimmage invites' });
    }
  });

  // User search for tagging - MUST be before /api/users/:userId to avoid route conflict
  app.get("/api/users/search", isAuthenticated, async (req: any, res) => {
    try {
      const { q, leagueId, tournamentId } = req.query;
      
      if (!q || typeof q !== 'string' || q.length < 2) {
        return res.json([]);
      }

      let usersQuery;
      
      if (tournamentId) {
        usersQuery = await db
          .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            profileImageUrl: users.profileImageUrl,
          })
          .from(users)
          .innerJoin(tournamentParticipants, eq(users.id, tournamentParticipants.userId))
          .where(
            and(
              eq(tournamentParticipants.tournamentId, tournamentId as string),
              eq(tournamentParticipants.status, 'approved'),
              or(
                sql`LOWER(${users.firstName}) LIKE LOWER(${`%${q}%`})`,
                sql`LOWER(${users.lastName}) LIKE LOWER(${`%${q}%`})`,
                sql`LOWER(${users.email}) LIKE LOWER(${`%${q}%`})`,
                sql`LOWER(CONCAT(${users.firstName}, ' ', ${users.lastName})) LIKE LOWER(${`%${q}%`})`
              )
            )
          )
          .limit(10);
      } else if (leagueId) {
        usersQuery = await db
          .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            profileImageUrl: users.profileImageUrl,
          })
          .from(users)
          .innerJoin(leagueMemberships, eq(users.id, leagueMemberships.userId))
          .where(
            and(
              eq(leagueMemberships.leagueId, leagueId as string),
              eq(leagueMemberships.status, 'approved'),
              or(
                sql`LOWER(${users.firstName}) LIKE LOWER(${`%${q}%`})`,
                sql`LOWER(${users.lastName}) LIKE LOWER(${`%${q}%`})`,
                sql`LOWER(${users.email}) LIKE LOWER(${`%${q}%`})`,
                sql`LOWER(CONCAT(${users.firstName}, ' ', ${users.lastName})) LIKE LOWER(${`%${q}%`})`
              )
            )
          )
          .limit(10);
      } else {
        usersQuery = await db
          .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            profileImageUrl: users.profileImageUrl,
          })
          .from(users)
          .where(
            or(
              sql`LOWER(${users.firstName}) LIKE LOWER(${`%${q}%`})`,
              sql`LOWER(${users.lastName}) LIKE LOWER(${`%${q}%`})`,
              sql`LOWER(${users.email}) LIKE LOWER(${`%${q}%`})`,
              sql`LOWER(CONCAT(${users.firstName}, ' ', ${users.lastName})) LIKE LOWER(${`%${q}%`})`
            )
          )
          .limit(10);
      }

      res.json(usersQuery);
    } catch (error) {
      console.error("Error searching users:", error);
      res.status(500).json({ error: "Failed to search users" });
    }
  });

  // Get any user's public profile by ID
  app.get('/api/users/:userId', isAuthenticated, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Return public user information
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Delete a placeholder user (commissioner only, for cleanup after merging)
  app.delete('/api/users/:userId', isAuthenticated, async (req: any, res) => {
    try {
      const { userId: targetUserId } = req.params;
      const requestingUserId = req.user.claims.sub;

      // Get the target user
      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Only allow deletion of placeholder users (check both email pattern and isPlaceholder flag)
      const isPlaceholder = targetUser.email?.includes('@placeholder.roster') || 
                            (targetUser as any).isPlaceholder === true;
      if (!isPlaceholder) {
        return res.status(403).json({ message: "Only placeholder users can be deleted" });
      }

      // Verify the requesting user is a commissioner of at least one league
      // This is a relaxed check since after merging, the placeholder may have no memberships left
      const requestingUserLeagues = await db
        .select({ id: leagues.id })
        .from(leagues)
        .where(eq(leagues.commissionerId, requestingUserId));

      if (requestingUserLeagues.length === 0) {
        return res.status(403).json({ message: "You must be a commissioner to delete placeholder users" });
      }

      // Get user's team assignments before deletion so we can sync team chats
      const userLeagueMemberships = await db
        .select({ assignedTeamId: leagueMemberships.assignedTeamId, leagueId: leagueMemberships.leagueId })
        .from(leagueMemberships)
        .where(eq(leagueMemberships.userId, targetUserId));
      
      const userTeamMemberships = await db
        .select({ teamId: teamMemberships.teamId })
        .from(teamMemberships)
        .where(eq(teamMemberships.userId, targetUserId));

      // Collect all teams the user was on
      const teamsToSync = new Map<string, string>(); // teamId -> leagueId
      for (const membership of userLeagueMemberships) {
        if (membership.assignedTeamId && membership.leagueId) {
          teamsToSync.set(membership.assignedTeamId, membership.leagueId);
        }
      }
      for (const membership of userTeamMemberships) {
        // Get team to find leagueId
        const [team] = await db.select().from(teams).where(eq(teams.id, membership.teamId));
        if (team && team.leagueId) {
          teamsToSync.set(membership.teamId, team.leagueId);
        }
      }

      // Soft delete approach: Mark user as deleted instead of hard delete
      // This preserves historical data integrity while hiding the user from active use
      await db
        .update(users)
        .set({ 
          email: `deleted_${Date.now()}_${targetUser.email || targetUserId}`,
          firstName: '[Deleted]',
          lastName: 'User'
        })
        .where(eq(users.id, targetUserId));

      // Clean up any remaining memberships
      await db.delete(leagueMemberships).where(eq(leagueMemberships.userId, targetUserId));
      await db.delete(teamMemberships).where(eq(teamMemberships.userId, targetUserId));

      // Remove user from all conversation participants
      await db
        .update(conversationParticipants)
        .set({ leftAt: new Date() })
        .where(eq(conversationParticipants.userId, targetUserId));

      // Sync team chats to remove the deleted user
      for (const [teamId, leagueId] of teamsToSync) {
        try {
          await messagingService.syncTeamChatParticipants(teamId, leagueId);
        } catch (syncError) {
          console.error(`Failed to sync team chat for team ${teamId}:`, syncError);
        }
      }

      res.json({ message: "Placeholder user deleted successfully" });
    } catch (error) {
      console.error("Error deleting placeholder user:", error);
      res.status(500).json({ message: "Failed to delete placeholder user" });
    }
  });

  // Stripe webhook routes only - subscription management handled via Stripe billing portal
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2024-06-20",
  });

  // Create checkout session for new subscriptions
  app.post('/api/stripe/create-checkout-session', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { priceId } = req.body;

      if (!priceId) {
        return res.status(400).json({ message: 'Price ID is required' });
      }

      // Allowlist of valid price IDs - reject anything else for security
      const ALLOWED_PRICES = [
        process.env.STRIPE_PRICE_PLAYER_PRO_MONTHLY,
        process.env.STRIPE_PRICE_COMMISSIONER_MONTHLY,
        process.env.STRIPE_PRICE_PLAYER_PRO_YEARLY,
        process.env.STRIPE_PRICE_COMMISSIONER_YEARLY,
      ].filter(Boolean);

      if (!ALLOWED_PRICES.includes(priceId)) {
        console.warn('[Stripe] Rejected invalid price ID:', priceId);
        return res.status(400).json({ message: 'Invalid price ID' });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      let customerId = user.stripeCustomerId;

      // Create Stripe customer if they don't have one
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          name: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : undefined,
          metadata: {
            userId: userId,
          },
        });
        
        customerId = customer.id;
        await storage.updateUserStripeInfo(userId, customerId, user.stripeSubscriptionId || '');
      } else {
        // Verify customer exists in Stripe and update their info
        try {
          await stripe.customers.update(customerId, {
            email: user.email || undefined,
            name: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : undefined,
          });
        } catch (customerError: any) {
          // If customer doesn't exist in Stripe, create a new one
          if (customerError.code === 'resource_missing' || customerError.statusCode === 404) {
            const customer = await stripe.customers.create({
              email: user.email || undefined,
              name: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : undefined,
              metadata: {
                userId: userId,
              },
            });
            customerId = customer.id;
            await storage.updateUserStripeInfo(userId, customerId, '');
          } else {
            throw customerError;
          }
        }

        // Check if customer has any active subscriptions
        // If they do, they should use billing portal to upgrade instead
        try {
          const subscriptions = await stripe.subscriptions.list({
            customer: customerId,
            status: 'active',
            limit: 1,
          });

          if (subscriptions.data.length > 0) {
            // Create a billing portal session for upgrade/management
            const protocol = req.protocol || 'https';
            const host = req.get('host') || (process.env.REPLIT_DOMAINS 
              ? `${process.env.REPLIT_DOMAINS}` 
              : 'localhost:5000');
            const appUrl = `${protocol}://${host}`;

            const portalSession = await stripe.billingPortal.sessions.create({
              customer: customerId,
              return_url: `${appUrl}/subscription`,
            });
            return res.json({ url: portalSession.url });
          }
        } catch (subError: any) {
          // Error checking subscriptions, proceeding with checkout
        }
      }

      // Build URL from request for reliability
      const protocol = req.protocol || 'https';
      const host = req.get('host') || (process.env.REPLIT_DOMAINS 
        ? `${process.env.REPLIT_DOMAINS}` 
        : 'localhost:5000');
      const appUrl = `${protocol}://${host}`;

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        allow_promotion_codes: true,
        success_url: `${appUrl}/subscription?success=true`,
        cancel_url: `${appUrl}/subscription`,
        client_reference_id: userId,
        metadata: {
          userId: userId,
        },
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error('[Stripe] Error creating checkout session:', error.message || error);
      console.error('[Stripe] Full error details:', JSON.stringify(error, null, 2));
      res.status(500).json({ message: 'Failed to create checkout session' });
    }
  });

  // Create checkout session for tournament payment
  app.post('/api/tournaments/:tournamentId/create-checkout', isAuthenticated, loadUserPermissions, requireLeagueManagement, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tournamentId } = req.params;

      // Get tournament
      const [tournament] = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, tournamentId));

      if (!tournament) {
        return res.status(404).json({ message: 'Tournament not found' });
      }

      // Check if already paid
      if (tournament.paymentStatus === 'paid') {
        return res.status(400).json({ message: 'Tournament payment already completed' });
      }

      // Get user
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      let customerId = user.stripeCustomerId;

      // Create Stripe customer if they don't have one
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          name: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : undefined,
          metadata: {
            userId: userId,
          },
        });
        
        customerId = customer.id;
        await storage.updateUserStripeInfo(userId, customerId, user.stripeSubscriptionId || '');

      } else {
        // Update existing customer's email to match current profile
        await stripe.customers.update(customerId, {
          email: user.email || undefined,
          name: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : undefined,
        });
      }

      // Build URL from request
      const protocol = req.protocol || 'https';
      const host = req.get('host') || (process.env.REPLIT_DOMAINS 
        ? `${process.env.REPLIT_DOMAINS}` 
        : 'localhost:5000');
      const appUrl = `${protocol}://${host}`;

      // Payment amount is already stored in cents
      const amountInCents = Math.round(tournament.paymentAmount || 0);

      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'payment',
        payment_method_types: ['card'],
        allow_promotion_codes: true,
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Tournament: ${tournament.name}`,
                description: `Access for ${tournament.name} (ID: ${tournament.uniqueTournamentId})`,
              },
              unit_amount: amountInCents,
            },
            quantity: 1,
          },
        ],
        success_url: `${appUrl}/tournament/${tournamentId}?payment=success`,
        cancel_url: `${appUrl}/tournament/${tournamentId}?payment=cancelled`,
        client_reference_id: userId,
        metadata: {
          userId: userId,
          tournamentId: tournamentId,
          type: 'tournament_payment'
        },
      });

      // Update tournament with session ID
      await db
        .update(tournaments)
        .set({
          stripeSessionId: session.id,
          updatedAt: new Date()
        })
        .where(eq(tournaments.id, tournamentId));

      if (!session.url) {
        console.error('[Stripe] Session created but URL is missing!', session);
        return res.status(500).json({ message: 'Stripe session URL missing' });
      }

      res.json({ url: session.url });
    } catch (error: any) {
      console.error('[Stripe] Error creating tournament checkout session:', error);
      res.status(500).json({ message: 'Failed to create tournament checkout session' });
    }
  });

  // Create checkout session for additional team payment
  app.post('/api/tournaments/:tournamentId/additional-teams-checkout', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tournamentId } = req.params;
      const { additionalTeamCount } = req.body;

      if (!additionalTeamCount || additionalTeamCount < 1) {
        return res.status(400).json({ message: 'additionalTeamCount is required and must be at least 1' });
      }

      // Get tournament
      const [tournament] = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, tournamentId));

      if (!tournament) {
        return res.status(404).json({ message: 'Tournament not found' });
      }

      // Only allow for standalone tournaments that are already paid
      if (tournament.type !== 'standalone') {
        return res.status(400).json({ message: 'Additional team payment only available for standalone tournaments' });
      }

      if (tournament.paymentStatus !== 'paid') {
        return res.status(400).json({ message: 'Tournament must be paid before adding additional teams' });
      }

      // Verify user is the tournament creator
      if (tournament.createdBy !== userId) {
        return res.status(403).json({ message: 'Only the tournament creator can pay for additional teams' });
      }

      // Get user
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      let customerId = user.stripeCustomerId;

      // Create Stripe customer if they don't have one
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          name: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : undefined,
          metadata: {
            userId: userId,
          },
        });
        
        customerId = customer.id;
        await storage.updateUserStripeInfo(userId, customerId, user.stripeSubscriptionId || '');

      } else {
        await stripe.customers.update(customerId, {
          email: user.email || undefined,
          name: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : undefined,
        });
      }

      // Build URL from request
      const protocol = req.protocol || 'https';
      const host = req.get('host') || (process.env.REPLIT_DOMAINS 
        ? `${process.env.REPLIT_DOMAINS}` 
        : 'localhost:5000');
      const appUrl = `${protocol}://${host}`;

      // Calculate amount: $10 per additional team (1000 cents per team)
      const amountInCents = additionalTeamCount * 1000;

      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'payment',
        payment_method_types: ['card'],
        allow_promotion_codes: true,
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Additional Teams: ${tournament.name}`,
                description: `${additionalTeamCount} additional team${additionalTeamCount > 1 ? 's' : ''} for ${tournament.name} (ID: ${tournament.uniqueTournamentId})`,
              },
              unit_amount: 1000, // $10 per team
            },
            quantity: additionalTeamCount,
          },
        ],
        success_url: `${appUrl}/tournament/${tournamentId}?payment=success&additional=true`,
        cancel_url: `${appUrl}/tournament/${tournamentId}?payment=cancelled`,
        client_reference_id: userId,
        metadata: {
          userId: userId,
          tournamentId: tournamentId,
          type: 'additional_team_payment',
          additionalTeamCount: additionalTeamCount.toString()
        },
      });

      if (!session.url) {
        console.error('[Stripe] Session created but URL is missing!', session);
        return res.status(500).json({ message: 'Stripe session URL missing' });
      }

      res.json({ url: session.url });
    } catch (error: any) {
      console.error('[Stripe] Error creating additional team checkout session:', error);
      res.status(500).json({ message: 'Failed to create checkout session' });
    }
  });

  // Create billing portal session - creates customer in Stripe if needed
  app.post('/api/stripe/create-portal-session', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      let customerId = user.stripeCustomerId;

      // Create Stripe customer if they don't have one or if the saved one doesn't exist
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          name: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : undefined,
          metadata: {
            userId: userId,
          },
        });
        
        customerId = customer.id;
        
        // Save customer ID to database
        await storage.updateUserStripeInfo(userId, customerId, user.stripeSubscriptionId || '');

      } else {
        // Update existing customer's email to match current profile
        await stripe.customers.update(customerId, {
          email: user.email || undefined,
          name: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : undefined,
        });
      }

      // Create billing portal session
      let portalSession;
      try {
        // Use REPLIT_DOMAINS for the return URL (not REPL_HOME which is a file path)
        const appUrl = process.env.REPLIT_DOMAINS 
          ? `https://${process.env.REPLIT_DOMAINS}` 
          : 'http://localhost:5000';
        
        portalSession = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: `${appUrl}/subscription`,
        });
      } catch (error: any) {
        // If customer doesn't exist in Stripe, create a new one
        if (error.code === 'resource_missing') {
          const customer = await stripe.customers.create({
            email: user.email || undefined,
            name: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : undefined,
            metadata: {
              userId: userId,
            },
          });
          
          customerId = customer.id;
          
          // Update database with new customer ID
          await storage.updateUserStripeInfo(userId, customerId, user.stripeSubscriptionId || '');
          
          // Retry creating portal session with new customer
          const appUrl = process.env.REPLIT_DOMAINS 
            ? `https://${process.env.REPLIT_DOMAINS}` 
            : 'http://localhost:5000';
          
          portalSession = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${appUrl}/subscription`,
          });
        } else {
          throw error;
        }
      }

      res.json({ url: portalSession.url });
    } catch (error: any) {
      console.error('[Stripe] Error creating portal session:', error);
      
      // Return a more specific error message to help with debugging
      let errorMessage = 'Failed to create billing portal session';
      
      if (error.code === 'account_invalid') {
        errorMessage = 'Stripe billing portal is not configured. Please configure it in your Stripe Dashboard.';
      } else if (error.message) {
        errorMessage = `Stripe error: ${error.message}`;
      }
      
      res.status(500).json({ message: errorMessage });
    }
  });

  // Cancel subscription immediately via Stripe API
  app.post('/api/stripe/cancel-subscription', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      if (!user.stripeSubscriptionId) {
        return res.status(400).json({ message: 'No active subscription found' });
      }

      // Cancel immediately via Stripe API (not at period end)
      await stripe.subscriptions.cancel(user.stripeSubscriptionId);

      // Immediately downgrade role and clear subscription info in our DB
      // (the webhook will also fire and confirm this, but we do it here for instant feedback)
      await storage.updateUserRole(userId, 'free_tier');
      await storage.updateUserStripeInfo(userId, user.stripeCustomerId || '', '');

      console.log(`[Stripe] Subscription ${user.stripeSubscriptionId} cancelled immediately for user ${userId}`);

      res.json({ message: 'Subscription cancelled successfully' });
    } catch (error: any) {
      console.error('[Stripe] Error cancelling subscription:', error);
      res.status(500).json({ message: error.message || 'Failed to cancel subscription' });
    }
  });

  // Get Stripe pricing configuration (public endpoint)
  app.get('/api/stripe/prices', async (req, res) => {
    try {
      const priceIds = {
        player_pro_monthly: process.env.STRIPE_PRICE_PLAYER_PRO_MONTHLY || null,
        commissioner_monthly: process.env.STRIPE_PRICE_COMMISSIONER_MONTHLY || null,
        player_pro_yearly: process.env.STRIPE_PRICE_PLAYER_PRO_YEARLY || null,
        commissioner_yearly: process.env.STRIPE_PRICE_COMMISSIONER_YEARLY || null,
      };

      // Fetch live amounts from Stripe for each configured price ID
      const result: Record<string, { id: string; amount: number | null; currency: string | null }> = {};

      for (const [key, priceId] of Object.entries(priceIds)) {
        if (!priceId) continue;
        try {
          const stripePrice = await stripe.prices.retrieve(priceId);
          result[key] = {
            id: priceId,
            amount: stripePrice.unit_amount !== null ? stripePrice.unit_amount / 100 : null,
            currency: stripePrice.currency || null,
          };
        } catch (err) {
          console.error(`[Stripe] Failed to retrieve price ${priceId}:`, err);
          result[key] = { id: priceId, amount: null, currency: null };
        }
      }

      res.json(result);
    } catch (error: any) {
      console.error('[Stripe] Error fetching prices:', error);
      res.status(500).json({ message: 'Failed to fetch pricing information' });
    }
  });

  // Admin diagnostic endpoint - checks user's Stripe status and finds any active subscriptions
  app.get('/api/admin/stripe/diagnose/:userId', isAuthenticated, requireSpecialPermission('admin'), async (req: any, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const diagnostic: any = {
        database: {
          userId: user.id,
          email: user.email,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
          currentRole: user.role,
          stripeCustomerId: user.stripeCustomerId || null,
          stripeSubscriptionId: user.stripeSubscriptionId || null,
        },
        stripe: {
          customer: null,
          subscriptions: [],
          activeSubscription: null,
        },
        sync: {
          inSync: false,
          issues: [],
          recommendations: [],
        }
      };

      // Check if user has Stripe customer ID
      if (!user.stripeCustomerId) {
        diagnostic.sync.issues.push('No Stripe customer ID in database');
        diagnostic.sync.recommendations.push('User needs to initiate a subscription through Stripe first');
        return res.json(diagnostic);
      }

      try {
        // Fetch customer from Stripe
        const customer = await stripe.customers.retrieve(user.stripeCustomerId);
        if (customer.deleted) {
          diagnostic.sync.issues.push('Stripe customer has been deleted');
          diagnostic.stripe.customer = { deleted: true };
        } else {
          diagnostic.stripe.customer = {
            id: customer.id,
            email: customer.email,
            name: customer.name,
            deleted: false,
          };
        }

        // Fetch all subscriptions for this customer
        const subscriptions = await stripe.subscriptions.list({
          customer: user.stripeCustomerId,
          limit: 10,
        });

        diagnostic.stripe.subscriptions = subscriptions.data.map(sub => ({
          id: sub.id,
          status: sub.status,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          currentPeriodEnd: sub.current_period_end,
          priceId: sub.items.data[0]?.price?.id,
          productName: sub.items.data[0]?.price?.nickname,
        }));

        // Find active subscription
        const activeSubscription = subscriptions.data.find(sub => 
          sub.status === 'active' || sub.status === 'trialing'
        );

        if (activeSubscription) {
          diagnostic.stripe.activeSubscription = {
            id: activeSubscription.id,
            status: activeSubscription.status,
            cancelAtPeriodEnd: activeSubscription.cancel_at_period_end,
            priceId: activeSubscription.items.data[0]?.price?.id,
          };

          // Check if database subscription ID matches
          if (user.stripeSubscriptionId !== activeSubscription.id) {
            diagnostic.sync.issues.push('Database subscription ID does not match active Stripe subscription');
            diagnostic.sync.recommendations.push('Run sync to update database with active subscription');
          }

          // Map Stripe price to expected role
          const PRICE_TO_ROLE: Record<string, 'player_pro' | 'commissioner'> = {
            [process.env.STRIPE_PRICE_PLAYER_PRO_MONTHLY || '']: 'player_pro',
            [process.env.STRIPE_PRICE_COMMISSIONER_MONTHLY || '']: 'commissioner',
            [process.env.STRIPE_PRICE_PLAYER_PRO_YEARLY || '']: 'player_pro',
            [process.env.STRIPE_PRICE_COMMISSIONER_YEARLY || '']: 'commissioner',
          };

          const priceId = activeSubscription.items.data[0]?.price?.id;
          const expectedRole = priceId ? PRICE_TO_ROLE[priceId] : null;

          if (expectedRole) {
            diagnostic.sync.expectedRole = expectedRole;
            if (user.role !== expectedRole) {
              diagnostic.sync.issues.push(`User role (${user.role}) does not match subscription tier (${expectedRole})`);
              diagnostic.sync.recommendations.push(`Update user role to ${expectedRole}`);
            }
          } else {
            diagnostic.sync.issues.push('Unknown Stripe price ID - cannot determine expected role');
          }
        } else {
          // No active subscription
          diagnostic.sync.issues.push('No active subscription found in Stripe');
          if (user.role !== 'free_tier') {
            diagnostic.sync.recommendations.push('Downgrade user to free_tier');
          }
        }

        // Check overall sync status
        diagnostic.sync.inSync = diagnostic.sync.issues.length === 0;

      } catch (stripeError: any) {
        diagnostic.sync.issues.push(`Stripe API error: ${stripeError.message}`);
      }

      res.json(diagnostic);
    } catch (error: any) {
      console.error('[Stripe Diagnostic] Error:', error);
      res.status(500).json({ message: 'Failed to run diagnostic', error: error.message });
    }
  });

  // Admin force sync endpoint - syncs subscription by customer ID (works even without stored subscription ID)
  app.post('/api/admin/stripe/force-sync/:userId', isAuthenticated, requireSpecialPermission('admin'), async (req: any, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      if (!user.stripeCustomerId) {
        return res.status(400).json({ message: 'User has no Stripe customer ID' });
      }

      // Map Stripe price IDs to user roles
      const PRICE_TO_ROLE: Record<string, 'player_pro' | 'commissioner'> = {
        [process.env.STRIPE_PRICE_PLAYER_PRO_MONTHLY || '']: 'player_pro',
        [process.env.STRIPE_PRICE_COMMISSIONER_MONTHLY || '']: 'commissioner',
        [process.env.STRIPE_PRICE_PLAYER_PRO_YEARLY || '']: 'player_pro',
        [process.env.STRIPE_PRICE_COMMISSIONER_YEARLY || '']: 'commissioner',
      };

      // Get all subscriptions for this customer from Stripe
      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        limit: 10,
      });


      // Find active subscription
      const activeSubscription = subscriptions.data.find(sub => 
        sub.status === 'active' || sub.status === 'trialing'
      );

      if (!activeSubscription) {
        // No active subscription - downgrade to free tier
        await storage.updateUserRole(userId, 'free_tier');
        await storage.updateUserStripeInfo(userId, user.stripeCustomerId, '');
        
        return res.json({ 
          message: 'No active subscription found - user downgraded to free_tier', 
          previousRole: user.role,
          newRole: 'free_tier',
          subscriptionsFound: subscriptions.data.map(s => ({ id: s.id, status: s.status }))
        });
      }

      // Check if subscription should be active
      if (activeSubscription.cancel_at_period_end || activeSubscription.status === 'canceled' || activeSubscription.status === 'unpaid') {
        await storage.updateUserRole(userId, 'free_tier');
        await storage.updateUserStripeInfo(userId, user.stripeCustomerId, '');
        
        return res.json({ 
          message: 'Subscription is cancelled - user downgraded to free_tier', 
          previousRole: user.role,
          newRole: 'free_tier',
          subscriptionId: activeSubscription.id,
          reason: activeSubscription.cancel_at_period_end ? 'cancel_at_period_end' : `status=${activeSubscription.status}`
        });
      }

      // Active subscription found - update user
      const priceId = activeSubscription.items.data[0]?.price?.id;
      const tier = priceId ? PRICE_TO_ROLE[priceId] : null;

      if (!tier) {
        console.warn('[Force Sync] Unknown price ID:', priceId);
        return res.status(400).json({ 
          message: 'Unknown subscription price ID', 
          priceId,
          subscriptionId: activeSubscription.id 
        });
      }

      // Update subscription ID and role
      await storage.updateUserStripeInfo(userId, user.stripeCustomerId, activeSubscription.id);
      await storage.updateUserRole(userId, tier);

      
      res.json({ 
        message: 'Subscription synced successfully', 
        previousRole: user.role,
        newRole: tier,
        subscriptionId: activeSubscription.id,
        subscriptionStatus: activeSubscription.status
      });
    } catch (error: any) {
      console.error('[Force Sync] Error syncing subscription:', error);
      res.status(500).json({ message: 'Failed to sync subscription', error: error.message });
    }
  });

  // Manual subscription sync endpoint - checks Stripe and updates user role
  app.post('/api/stripe/sync-subscription/:userId', isAuthenticated, requireSpecialPermission('admin'), async (req: any, res) => {
    try {
      const { userId } = req.params;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      if (!user.stripeSubscriptionId) {
        return res.status(400).json({ message: 'User has no subscription to sync' });
      }

      // Fetch subscription from Stripe
      const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      

      // Map Stripe price IDs to user roles
      const PRICE_TO_ROLE: Record<string, 'player_pro' | 'commissioner'> = {
        [process.env.STRIPE_PRICE_PLAYER_PRO_MONTHLY || '']: 'player_pro',
        [process.env.STRIPE_PRICE_COMMISSIONER_MONTHLY || '']: 'commissioner',
        [process.env.STRIPE_PRICE_PLAYER_PRO_YEARLY || '']: 'player_pro',
        [process.env.STRIPE_PRICE_COMMISSIONER_YEARLY || '']: 'commissioner',
      };

      // Check if subscription should be downgraded
      if (subscription.cancel_at_period_end || subscription.status === 'canceled' || subscription.status === 'unpaid') {
        await storage.updateUserRole(userId, 'free_tier');
        await storage.updateUserStripeInfo(userId, user.stripeCustomerId || '', '');
        
        return res.json({ 
          message: 'User downgraded to free_tier', 
          previousRole: user.role,
          newRole: 'free_tier',
          reason: subscription.cancel_at_period_end ? 'cancel_at_period_end' : `status=${subscription.status}`
        });
      } else if (subscription.status === 'active' || subscription.status === 'trialing') {
        // Get the price ID to determine tier
        const priceId = subscription.items.data[0]?.price?.id;
        const tier = priceId ? PRICE_TO_ROLE[priceId] : null;
        
        if (tier && tier !== user.role) {
          await storage.updateUserRole(userId, tier);
          
          return res.json({ 
            message: 'User role updated', 
            previousRole: user.role,
            newRole: tier
          });
        } else {
          return res.json({ 
            message: 'User role is already correct', 
            currentRole: user.role,
            subscriptionStatus: subscription.status
          });
        }
      } else {
        return res.json({ 
          message: 'Subscription status not handled', 
          subscriptionStatus: subscription.status 
        });
      }
    } catch (error: any) {
      console.error('[Stripe Sync] Error syncing subscription:', error);
      res.status(500).json({ message: 'Failed to sync subscription', error: error.message });
    }
  });

  // Stripe webhook handler - Note: This endpoint needs raw body, configured in server/index.ts
  app.post('/api/stripe-webhook', async (req, res) => {
    const sig = req.headers['stripe-signature'];

    if (!sig) {
      return res.status(400).send('Missing stripe-signature header');
    }

    let event: Stripe.Event;

    try {
      // Verify webhook signature for security
      if (process.env.STRIPE_WEBHOOK_SECRET) {
        // req.body is a Buffer when using express.raw() - convert to string for signature verification
        const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : 
                        typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
      } else {
        // Development mode without signature verification (not recommended for production)
        console.warn('[Webhook] WARNING: No STRIPE_WEBHOOK_SECRET configured - skipping signature verification');
        console.warn('[Webhook] Set STRIPE_WEBHOOK_SECRET environment variable for production use');
        const bodyStr = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : 
                       typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        event = JSON.parse(bodyStr);
      }
    } catch (err: any) {
      console.error('[Webhook] Signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    try {
      // Map Stripe price IDs to user roles
      const PRICE_TO_ROLE: Record<string, 'player_pro' | 'commissioner'> = {
        // Monthly prices
        [process.env.STRIPE_PRICE_PLAYER_PRO_MONTHLY || '']: 'player_pro',
        [process.env.STRIPE_PRICE_COMMISSIONER_MONTHLY || '']: 'commissioner',
        // Yearly prices
        [process.env.STRIPE_PRICE_PLAYER_PRO_YEARLY || '']: 'player_pro',
        [process.env.STRIPE_PRICE_COMMISSIONER_YEARLY || '']: 'commissioner',
      };

      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          
          // Check if this is a tournament payment
          if (session.metadata?.type === 'tournament_payment') {
            const tournamentId = session.metadata.tournamentId;
            
            if (tournamentId && session.payment_status === 'paid') {
              // Get current team count to record as paid team count
              const teamCount = await db
                .select({ count: sql<number>`count(*)::int` })
                .from(tournamentTeams)
                .where(eq(tournamentTeams.tournamentId, tournamentId));
              const paidTeamCount = teamCount[0]?.count || 0;
              
              await db
                .update(tournaments)
                .set({
                  paymentStatus: 'paid',
                  paidTeamCount: paidTeamCount,
                  stripePaymentIntentId: session.payment_intent as string || null,
                  stripeCheckoutSessionId: session.id,
                  updatedAt: new Date()
                })
                .where(eq(tournaments.id, tournamentId));
              
            }
          }
          // Handle additional team payment
          else if (session.metadata?.type === 'additional_team_payment') {
            const tournamentId = session.metadata.tournamentId;
            const additionalTeamCount = parseInt(session.metadata.additionalTeamCount || '0');
            
            if (tournamentId && session.payment_status === 'paid' && additionalTeamCount > 0) {
              // Increment the paidTeamCount by the number of additional teams paid for
              await db
                .update(tournaments)
                .set({
                  paidTeamCount: sql`${tournaments.paidTeamCount} + ${additionalTeamCount}`,
                  updatedAt: new Date()
                })
                .where(eq(tournaments.id, tournamentId));
              
            }
          }
          // Handle subscription checkout
          else if (session.subscription && session.customer) {
            const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
            const users = await storage.getAllUsers();
            let user = users.find(u => u.stripeCustomerId === session.customer);
            
            if (user) {
              // Update customer ID and subscription ID
              await storage.updateUserStripeInfo(user.id, session.customer as string, subscription.id);
              
              // Determine tier from price ID
              const priceId = subscription.items.data[0]?.price?.id;
              const tier = priceId ? PRICE_TO_ROLE[priceId] : null;
              
              if (tier) {
                await storage.updateUserRole(user.id, tier);
              } else {
                console.warn('[Webhook] Unknown price ID:', priceId);
              }
            }
          }
          break;
        }

        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
        case 'customer.subscription.created': {
          const subscription = event.data.object as Stripe.Subscription;
          
          // Find user by Stripe customer ID or subscription ID
          const users = await storage.getAllUsers();
          let user = users.find(u => u.stripeSubscriptionId === subscription.id);
          
          // If not found by subscription ID, try to find by customer ID
          if (!user) {
            user = users.find(u => u.stripeCustomerId === subscription.customer);
          }
          
          if (user) {
            // IMMEDIATE ACCESS RESTRICTION: Check if subscription is cancelled or will be cancelled
            // This ensures users lose access immediately upon cancellation, not at period end
            if (subscription.cancel_at_period_end || subscription.status === 'canceled' || subscription.status === 'unpaid' || event.type === 'customer.subscription.deleted') {
              await storage.updateUserRole(user.id, 'free_tier');
              
              // Clear subscription ID when downgrading to free tier
              await storage.updateUserStripeInfo(user.id, user.stripeCustomerId || '', '');
            } else if (subscription.status === 'active' || subscription.status === 'trialing') {
              // Get the price ID to determine tier
              const priceId = subscription.items.data[0]?.price?.id;
              const tier = priceId ? PRICE_TO_ROLE[priceId] : null;
              
              if (tier) {
                await storage.updateUserRole(user.id, tier);
                
                // Update subscription ID if it changed
                if (user.stripeSubscriptionId !== subscription.id) {
                  await storage.updateUserStripeInfo(user.id, user.stripeCustomerId || '', subscription.id);
                }
              } else {
                console.warn('[Webhook] Unknown price ID in subscription:', priceId);
              }
            }
          }
          break;
        }

        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as Stripe.Invoice;
          
          // If this invoice has a subscription, update the user's role
          const subscriptionId = (invoice as any).subscription;
          if (subscriptionId) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId as string);
            const users = await storage.getAllUsers();
            const user = users.find(u => u.stripeSubscriptionId === subscription.id);
            
            if (user && subscription.status === 'active') {
              // Get the price ID to determine tier
              const priceId = subscription.items.data[0]?.price?.id;
              const tier = priceId ? PRICE_TO_ROLE[priceId] : null;
              
              if (tier) {
                await storage.updateUserRole(user.id, tier);
              } else {
                console.warn('[Webhook] Unknown price ID in invoice:', priceId);
              }
            }
          }
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          
          // Find user by subscription ID
          const subscriptionId = invoice.subscription as string;
          if (subscriptionId) {
            const users = await storage.getAllUsers();
            const user = users.find(u => u.stripeSubscriptionId === subscriptionId);
            
            if (user) {
              
              // Downgrade user to free tier
              await storage.updateUserRole(user.id, 'free_tier');
              
              // Clear subscription ID
              await storage.updateUserStripeInfo(user.id, user.stripeCustomerId || '', '');
              
              // Create notification for user
              await storage.createNotification({
                userId: user.id,
                type: 'payment_failed',
                title: 'Payment Failed',
                message: 'Your subscription payment failed. Please update your payment method to continue using premium features.',
                actionUrl: '/settings/billing',
                actionText: 'Update Payment Method',
                isRead: false,
                isDismissed: false,
              });
              broadcastNotificationUpdate(user.id);
              
            }
          }
          break;
        }

        default:
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error('Error processing webhook:', error);
      res.status(500).json({ message: 'Webhook processing error' });
    }
  });

  // Manual subscription sync utility - for fixing users with subscriptions in Stripe but not synced to app
  app.post('/api/stripe/sync-subscription', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || !user.stripeCustomerId) {
        return res.status(400).json({ message: 'User does not have a Stripe customer ID', userId, userKeys: user ? Object.keys(user) : [] });
      }

      // Map Stripe price IDs to user roles
      const PRICE_TO_ROLE: Record<string, 'player_pro' | 'commissioner'> = {
        [process.env.STRIPE_PRICE_PLAYER_PRO_MONTHLY || '']: 'player_pro',
        [process.env.STRIPE_PRICE_COMMISSIONER_MONTHLY || '']: 'commissioner',
        [process.env.STRIPE_PRICE_PLAYER_PRO_YEARLY || '']: 'player_pro',
        [process.env.STRIPE_PRICE_COMMISSIONER_YEARLY || '']: 'commissioner',
      };

      // Get all subscriptions for this customer from Stripe
      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        status: 'active',
        limit: 1,
      });

      if (subscriptions.data.length === 0) {
        return res.status(404).json({ message: 'No active subscription found in Stripe' });
      }

      const subscription = subscriptions.data[0];
      const priceId = subscription.items.data[0]?.price?.id;
      const tier = priceId ? PRICE_TO_ROLE[priceId] : null;

      if (!tier) {
        return res.status(400).json({ 
          message: 'Unknown subscription price ID', 
          priceId,
          subscriptionId: subscription.id,
          availablePriceIds: Object.keys(PRICE_TO_ROLE)
        });
      }

      // Update user's subscription info and role
      await storage.updateUserStripeInfo(userId, user.stripeCustomerId, subscription.id);
      
      // WORKAROUND: Use raw SQL to update role column to bypass Drizzle column confusion
      // The users table has TWO role columns (Supabase auth.users + app schema)
      // Drizzle was updating the correct enum column but selecting the wrong VARCHAR column
      await db.execute(sql.raw(`
        UPDATE users 
        SET role = '${tier}'::user_role,
            last_updated = NOW(),
            updated_at = NOW()
        WHERE id = '${userId}'
      `));
      
      // Also sync role to Supabase user metadata for tracking
      try {
        const { error: supabaseError } = await supabase.auth.admin.updateUserById(userId, {
          user_metadata: { subscription_tier: tier }
        });
        if (supabaseError) {
          console.warn('[Sync] Failed to update Supabase metadata:', supabaseError.message);
        }
      } catch (supabaseErr) {
        console.warn('[Sync] Error updating Supabase metadata:', supabaseErr);
      }
      
      // Verify the update by fetching the user again
      const verifyUser = await storage.getUser(userId);
      
      res.json({ 
        message: 'Subscription synced successfully', 
        tier,
        subscriptionId: subscription.id,
        actualRole: verifyUser?.role // Add this to see what's actually in DB
      });
    } catch (error: any) {
      console.error('[Sync] Error syncing subscription:', error);
      res.status(500).json({ message: 'Failed to sync subscription', error: error.message });
    }
  });

  // ─── Apple App Store Server API helpers ────────────────────────────────────
  // Product ID → subscription role mapping (server-side truth only — never trust client)
  const IAP_PRODUCT_ROLES: Record<string, 'commissioner' | 'player_pro'> = {
    'com.rosterapp.commissioner_monthly': 'commissioner',
    'com.rosterapp.player_pro_monthly': 'player_pro',
    'com.rosterapp.commissioner_yearly': 'commissioner',
    'com.rosterapp.player_pro_yearly': 'player_pro',
  };

  // Stable namespace used to derive deterministic appAccountTokens from userIds
  const IAP_APP_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

  /**
   * Validate an Apple JWS transaction payload against this user.
   * Returns the decoded payload if valid, or throws.
   */
  const validateAppleTransaction = async (
    jws: string,
    userId: string,
  ): Promise<import('./appleIap').AppleTransactionPayload> => {
    const { decodeAppleJWSPayload } = await import('./appleIap');
    const { v5: uuidv5 } = await import('uuid');

    const tx = await decodeAppleJWSPayload(jws) as import('./appleIap').AppleTransactionPayload;
    const expectedToken = uuidv5(userId, IAP_APP_NAMESPACE).toLowerCase();

    if (tx.appAccountToken) {
      if (tx.appAccountToken.toLowerCase() !== expectedToken) {
        console.warn('[IAP] appAccountToken mismatch — possible replay attack', { userId });
        throw Object.assign(new Error('Purchase does not belong to this account'), { status: 403 });
      }
    } else {
      // No appAccountToken: reject — all new purchases must include it
      console.warn('[IAP] No appAccountToken in transaction — binding cannot be verified', { userId });
      throw Object.assign(new Error('Receipt cannot be bound to an account — please re-purchase or contact support'), { status: 403 });
    }

    return tx;
  };

  /**
   * Update the user's role in the DB and sync to Supabase.
   * Also stores the IAP originalTransactionId for webhook lookups.
   */
  const applyIapRole = async (
    userId: string,
    newRole: 'commissioner' | 'player_pro',
    originalTransactionId?: string,
  ) => {
    await db
      .update(users)
      .set({
        role: newRole,
        lastUpdated: new Date(),
        updatedAt: new Date(),
        ...(originalTransactionId ? { iapOriginalTransactionId: originalTransactionId } : {}),
      })
      .where(eq(users.id, userId));

    try {
      await supabase.auth.admin.updateUserById(userId, {
        user_metadata: { subscription_tier: newRole },
      });
    } catch (supabaseErr) {
      console.warn('[IAP] Failed to sync Supabase metadata:', supabaseErr);
    }
  };

  // ─── POST /api/iap/verify ──────────────────────────────────────────────────
  // Called by the iOS client after a successful StoreKit purchase.
  //
  // Accepts (in priority order):
  //   1. jws            — StoreKit 2 JWS-signed transaction (preferred, verified
  //                       against Apple's x5c cert chain + bundleId check)
  //   2. transactionId  — Numeric transaction ID; looked up via App Store Server API
  //                       using a server-generated JWT (requires APPLE_IAP_* env vars)
  app.post('/api/iap/verify', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { jws, transactionId } = req.body;

      // ── Path 1: StoreKit 2 JWS transaction ──────────────────────────────
      if (jws && typeof jws === 'string' && jws.trim()) {
        const tx = await validateAppleTransaction(jws, userId);
        const now = Date.now();

        if (tx.revocationDate) {
          return res.status(402).json({ message: 'Transaction has been revoked' });
        }
        if (tx.expiresDate && tx.expiresDate < now) {
          return res.status(402).json({ message: 'Subscription has expired' });
        }

        const newRole = IAP_PRODUCT_ROLES[tx.productId] ?? null;
        if (!newRole) {
          return res.status(400).json({ message: `Unrecognised product: ${tx.productId}` });
        }

        await applyIapRole(userId, newRole, tx.originalTransactionId);
        console.log(`[IAP] JWS verified for user ${userId}: role → ${newRole} (${tx.environment})`);
        return res.json({ message: 'IAP verified and role updated', role: newRole });
      }

      // ── Path 2: Transaction ID → App Store Server API ───────────────────
      if (transactionId && typeof transactionId === 'string' && transactionId.trim()) {
        const { lookupTransactionById, isAppleIapConfigured } = await import('./appleIap');

        if (!isAppleIapConfigured()) {
          return res.status(503).json({ message: 'Apple IAP API not configured on server' });
        }

        const { payload: tx } = await lookupTransactionById(transactionId);
        const now = Date.now();

        if (tx.revocationDate) {
          return res.status(402).json({ message: 'Transaction has been revoked' });
        }
        if (tx.expiresDate && tx.expiresDate < now) {
          return res.status(402).json({ message: 'Subscription has expired' });
        }

        // Verify account binding using the payload's appAccountToken
        const { v5: uuidv5 } = await import('uuid');
        const expectedToken = uuidv5(userId, IAP_APP_NAMESPACE).toLowerCase();
        if (tx.appAccountToken) {
          if (tx.appAccountToken.toLowerCase() !== expectedToken) {
            console.warn('[IAP] appAccountToken mismatch (transactionId path)', { userId });
            return res.status(403).json({ message: 'Purchase does not belong to this account' });
          }
        } else {
          console.warn('[IAP] No appAccountToken in Apple response (transactionId path)', { userId });
          return res.status(403).json({ message: 'Receipt cannot be bound to an account' });
        }

        const newRole = IAP_PRODUCT_ROLES[tx.productId] ?? null;
        if (!newRole) {
          return res.status(400).json({ message: `Unrecognised product: ${tx.productId}` });
        }

        await applyIapRole(userId, newRole, tx.originalTransactionId);
        console.log(`[IAP] Transaction ID verified for user ${userId}: role → ${newRole}`);
        return res.json({ message: 'IAP verified and role updated', role: newRole });
      }

      return res.status(400).json({ message: 'Missing jws or transactionId' });

    } catch (error: any) {
      console.error('[IAP] Verification error:', error);
      const status = typeof error.status === 'number' ? error.status : 500;
      res.status(status).json({ message: error.message || 'IAP verification failed' });
    }
  });

  // ─── POST /api/iap/notifications ──────────────────────────────────────────
  // App Store Server Notifications v2 webhook.
  // Register this URL in App Store Connect → General → App Information →
  // App Store Server Notifications (both Production and Sandbox).
  //
  // Apple sends a JSON body: { "signedPayload": "<JWS>" }
  // The JWS contains the notification type and signed transaction/renewal info.
  app.post('/api/iap/notifications', async (req, res) => {
    try {
      const { signedPayload } = req.body as { signedPayload?: string };

      if (!signedPayload || typeof signedPayload !== 'string') {
        return res.status(400).json({ message: 'Missing signedPayload' });
      }

      const { decodeAppleJWSPayload } = await import('./appleIap');

      // Decode the outer notification envelope (verified against Apple Root CA G3).
      // The outer envelope does not carry a bundleId field, so skipBundleCheck=true.
      const notifRaw = await decodeAppleJWSPayload(signedPayload, true);
      const notificationType = notifRaw.notificationType as string;
      const subtype = notifRaw.subtype as string | undefined;
      const data = notifRaw.data as {
        environment: string;
        signedTransactionInfo?: string;
        signedRenewalInfo?: string;
      } | undefined;

      console.log(`[IAP/Notify] ${notificationType}${subtype ? '/' + subtype : ''} (${data?.environment})`);

      if (!data?.signedTransactionInfo) {
        // Some notification types (e.g. CONSUMPTION_REQUEST) have no transaction
        return res.status(200).json({ message: 'Notification acknowledged (no transaction)' });
      }

      // Decode the signed transaction payload — bundleId is enforced here (skipBundleCheck defaults to false)
      const txRaw = await decodeAppleJWSPayload(data.signedTransactionInfo);
      const productId = txRaw.productId as string;
      const originalTransactionId = txRaw.originalTransactionId as string | undefined;
      const expiresDate = txRaw.expiresDate as number | undefined;

      // Find the user by iap_original_transaction_id (stored when they first subscribed)
      let notifUserId: string | null = null;
      if (originalTransactionId) {
        const rows = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.iapOriginalTransactionId, originalTransactionId))
          .limit(1);
        notifUserId = rows[0]?.id ?? null;
      }

      if (!notifUserId) {
        // User hasn't subscribed through this server yet — they will be updated on next app open
        console.warn('[IAP/Notify] No user found for originalTransactionId:', originalTransactionId);
        return res.status(200).json({ message: 'Notification acknowledged (user not found)' });
      }

      // Determine what to do based on notification type
      const GRANT_TYPES = new Set([
        'SUBSCRIBED',
        'DID_RENEW',
        'OFFER_REDEEMED',
        'DID_CHANGE_RENEWAL_STATUS',
      ]);
      const REVOKE_TYPES = new Set([
        'EXPIRED',
        'REFUND',
        'REVOKE',
        'GRACE_PERIOD_EXPIRED',
      ]);

      const now = Date.now();

      if (GRANT_TYPES.has(notificationType)) {
        // Subscription is (or becomes) active
        if (expiresDate && expiresDate < now) {
          console.log(`[IAP/Notify] ${notificationType} but subscription already expired — skipping`);
          return res.status(200).json({ message: 'Already expired' });
        }
        const newRole = IAP_PRODUCT_ROLES[productId];
        if (newRole) {
          await applyIapRole(notifUserId, newRole, originalTransactionId);
          console.log(`[IAP/Notify] ${notificationType} → role set to ${newRole} for user ${notifUserId}`);
        }

      } else if (REVOKE_TYPES.has(notificationType)) {
        // Subscription ended — downgrade to free_tier
        await db
          .update(users)
          .set({ role: 'free_tier', lastUpdated: new Date(), updatedAt: new Date() })
          .where(eq(users.id, notifUserId));

        try {
          await supabase.auth.admin.updateUserById(notifUserId, {
            user_metadata: { subscription_tier: 'free_tier' },
          });
        } catch (e) {
          console.warn('[IAP/Notify] Supabase metadata sync failed on revoke:', e);
        }
        console.log(`[IAP/Notify] ${notificationType} → role reset to free_tier for user ${notifUserId}`);

      } else {
        console.log(`[IAP/Notify] Unhandled notification type: ${notificationType} — acknowledged`);
      }

      res.status(200).json({ message: 'Notification processed' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[IAP/Notify] Error processing notification:', message);
      // Always return 200 to Apple — non-200 triggers retries
      res.status(200).json({ message: 'Notification acknowledged (internal error)' });
    }
  });

  // Supabase storage routes for profile images  
  app.post("/api/profile-images/upload", isAuthenticated, async (req: any, res) => {
    try {
      const { SupabaseStorageService } = await import('./supabaseStorage');
      const supabaseStorageService = new SupabaseStorageService();
      const { uploadURL, path } = await supabaseStorageService.getProfileImageUploadURL();
      res.json({ uploadURL, path });
    } catch (error) {
      console.error("Error getting profile image upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // Serve profile images
  app.get("/profile-images/:objectPath(*)", async (req, res) => {
    try {
      const { SupabaseStorageService, SupabaseStorageNotFoundError } = await import('./supabaseStorage');
      const supabaseStorageService = new SupabaseStorageService();
      const fullPath = `/profile-images/${req.params.objectPath}`;
      const objectFile = await supabaseStorageService.getProfileImageFile(fullPath);
      await supabaseStorageService.streamToResponse(objectFile, res);
    } catch (error) {
      console.error("Error serving profile image:", error);
      if ((error as Error).name === 'SupabaseStorageNotFoundError') {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Team logo upload and serving routes
  app.post("/api/team-logos/upload", isAuthenticated, async (req: any, res) => {
    try {
      const { SupabaseStorageService } = await import('./supabaseStorage');
      const supabaseStorageService = new SupabaseStorageService();
      const { uploadURL, path } = await supabaseStorageService.getTeamLogoUploadURL();
      res.json({ uploadURL, path });
    } catch (error) {
      console.error("Error getting team logo upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // Serve team logos
  app.get("/team-logos/:objectPath(*)", async (req, res) => {
    try {
      const { SupabaseStorageService, SupabaseStorageNotFoundError } = await import('./supabaseStorage');
      const supabaseStorageService = new SupabaseStorageService();
      const fullPath = `/team-logos/${req.params.objectPath}`;
      const objectFile = await supabaseStorageService.getTeamLogoFile(fullPath);
      await supabaseStorageService.streamToResponse(objectFile, res);
    } catch (error) {
      console.error("Error serving team logo:", error);
      if ((error as Error).name === 'SupabaseStorageNotFoundError') {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Announcement media upload URL
  app.post("/api/announcement-media/upload", isAuthenticated, async (req: any, res) => {
    try {
      const { SupabaseStorageService } = await import('./supabaseStorage');
      const supabaseStorageService = new SupabaseStorageService();
      const { uploadURL, path } = await supabaseStorageService.getAnnouncementMediaUploadURL();
      res.json({ uploadURL, path });
    } catch (error) {
      console.error("Error getting announcement media upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // Serve announcement media
  app.get("/announcement-media/:objectPath(*)", async (req, res) => {
    try {
      const { SupabaseStorageService, SupabaseStorageNotFoundError } = await import('./supabaseStorage');
      const supabaseStorageService = new SupabaseStorageService();
      const fullPath = `/announcement-media/${req.params.objectPath}`;
      const objectFile = await supabaseStorageService.getAnnouncementMediaFile(fullPath);
      await supabaseStorageService.streamToResponse(objectFile, res);
    } catch (error) {
      console.error("Error serving announcement media:", error);
      if ((error as Error).name === 'SupabaseStorageNotFoundError') {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Message attachment upload URL
  app.post("/api/message-attachments/upload", isAuthenticated, async (req: any, res) => {
    try {
      const { SupabaseStorageService } = await import('./supabaseStorage');
      const supabaseStorageService = new SupabaseStorageService();
      const { uploadURL, path } = await supabaseStorageService.getMessageAttachmentUploadURL();
      res.json({ uploadURL, path });
    } catch (error) {
      console.error("Error getting message attachment upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // Serve message attachments (authenticated and authorized)
  app.get("/message-attachments/:objectPath(*)", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { SupabaseStorageService, SupabaseStorageNotFoundError } = await import('./supabaseStorage');
      const supabaseStorageService = new SupabaseStorageService();
      const fullPath = `/message-attachments/${req.params.objectPath}`;
      
      // Find the message attachment to verify access
      const attachment = await messagingService.getMessageAttachmentByPath(fullPath);
      if (!attachment) {
        return res.sendStatus(404);
      }
      
      // Get the message to check conversation access
      const message = await messagingService.getMessage(attachment.messageId);
      if (!message) {
        return res.sendStatus(404);
      }
      
      // Verify user is participant in the conversation
      const isParticipant = await messagingService.isUserInConversation(userId, message.conversationId);
      if (!isParticipant) {
        return res.sendStatus(403);
      }
      
      const objectFile = await supabaseStorageService.getMessageAttachmentFile(fullPath);
      await supabaseStorageService.streamToResponse(objectFile, res);
    } catch (error) {
      console.error("Error serving message attachment:", error);
      if ((error as Error).name === 'SupabaseStorageNotFoundError') {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Tournament photo routes
  app.post("/api/tournament-photos/upload", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tournamentId, fileType, fileSize } = req.body;

      if (!tournamentId) {
        return res.status(400).json({ error: "Tournament ID is required" });
      }

      // Validate file type (only images allowed)
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!fileType || !allowedTypes.includes(fileType.toLowerCase())) {
        return res.status(400).json({ error: "Invalid file type. Only images (JPEG, PNG, GIF, WebP) are allowed" });
      }

      // Validate file size (max 10MB)
      const maxSize = 10 * 1024 * 1024;
      if (!fileSize || fileSize > maxSize) {
        return res.status(400).json({ error: "File size exceeds maximum of 10MB" });
      }

      // Check if user is an approved participant in the tournament
      const participant = await db
        .select()
        .from(tournamentParticipants)
        .where(
          and(
            eq(tournamentParticipants.tournamentId, tournamentId),
            eq(tournamentParticipants.userId, userId),
            eq(tournamentParticipants.status, 'approved')
          )
        )
        .limit(1);

      if (!participant || participant.length === 0) {
        return res.status(403).json({ error: "Only approved tournament participants can upload photos" });
      }

      const { SupabaseStorageService } = await import('./supabaseStorage');
      const supabaseStorageService = new SupabaseStorageService();
      const { uploadURL, path } = await supabaseStorageService.getTournamentPhotoUploadURL();
      res.json({ uploadURL, path });
    } catch (error) {
      console.error("Error getting tournament photo upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  app.get("/tournament-photos/:objectPath(*)", async (req, res) => {
    try {
      const { SupabaseStorageService, SupabaseStorageNotFoundError } = await import('./supabaseStorage');
      const supabaseStorageService = new SupabaseStorageService();
      const fullPath = `/tournament-photos/${req.params.objectPath}`;
      const objectFile = await supabaseStorageService.getTournamentPhotoFile(fullPath);
      await supabaseStorageService.streamToResponse(objectFile, res);
    } catch (error) {
      console.error("Error serving tournament photo:", error);
      if ((error as Error).name === 'SupabaseStorageNotFoundError') {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  app.post("/api/tournament-photos", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tournamentId, fileUrl, fileName, fileSize, caption } = req.body;

      if (!tournamentId || !fileUrl || !fileName) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Check if user is an approved participant in the tournament
      const participant = await db
        .select()
        .from(tournamentParticipants)
        .where(
          and(
            eq(tournamentParticipants.tournamentId, tournamentId),
            eq(tournamentParticipants.userId, userId),
            eq(tournamentParticipants.status, 'approved')
          )
        )
        .limit(1);

      if (!participant || participant.length === 0) {
        return res.status(403).json({ error: "Only approved tournament participants can upload photos" });
      }

      const { SupabaseStorageService } = await import('./supabaseStorage');
      const supabaseStorageService = new SupabaseStorageService();
      const normalizedPath = supabaseStorageService.normalizeTournamentPhotoPath(fileUrl);

      // Always set uploadedBy to the authenticated user (prevent spoofing)
      const photo = await storage.createTournamentPhoto({
        tournamentId,
        uploadedBy: userId,
        fileUrl: normalizedPath,
        fileName,
        fileSize: fileSize || 0,
        caption: caption || null,
      });

      res.json(photo);
    } catch (error) {
      console.error("Error creating tournament photo:", error);
      res.status(500).json({ error: "Failed to create photo" });
    }
  });

  app.get("/api/tournament-photos/:tournamentId", async (req, res) => {
    try {
      const { tournamentId } = req.params;
      const photos = await storage.getTournamentPhotos(tournamentId);
      res.json(photos);
    } catch (error) {
      console.error("Error fetching tournament photos:", error);
      res.status(500).json({ error: "Failed to fetch photos" });
    }
  });

  app.get("/api/tournaments/:tournamentId/participants", isAuthenticated, async (req: any, res) => {
    try {
      const { tournamentId } = req.params;
      
      const participants = await db
        .select({
          id: tournamentParticipants.id,
          userId: tournamentParticipants.userId,
          status: tournamentParticipants.status,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          profileImageUrl: users.profileImageUrl,
        })
        .from(tournamentParticipants)
        .innerJoin(users, eq(tournamentParticipants.userId, users.id))
        .where(eq(tournamentParticipants.tournamentId, tournamentId));

      res.json(participants);
    } catch (error) {
      console.error("Error fetching tournament participants:", error);
      res.status(500).json({ error: "Failed to fetch participants" });
    }
  });

  app.delete("/api/tournament-photos/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;

      const photo = await storage.getTournamentPhoto(id);
      if (!photo) {
        return res.status(404).json({ error: "Photo not found" });
      }

      if (photo.uploadedBy !== userId) {
        return res.status(403).json({ error: "Unauthorized to delete this photo" });
      }

      const { SupabaseStorageService } = await import('./supabaseStorage');
      const supabaseStorageService = new SupabaseStorageService();
      await supabaseStorageService.deleteTournamentPhoto(photo.fileUrl);

      await storage.deleteTournamentPhoto(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting tournament photo:", error);
      res.status(500).json({ error: "Failed to delete photo" });
    }
  });

  app.get("/api/tournament-photos/:tournamentId/download-zip", async (req, res) => {
    try {
      const { tournamentId } = req.params;
      const photos = await storage.getTournamentPhotos(tournamentId);

      if (photos.length === 0) {
        return res.status(404).json({ error: "No photos found" });
      }

      const { SupabaseStorageService } = await import('./supabaseStorage');
      const supabaseStorageService = new SupabaseStorageService();
      const archiver = require('archiver');

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="tournament-${tournamentId}-photos.zip"`);

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.pipe(res);

      for (const photo of photos) {
        try {
          const fileData = await supabaseStorageService.getTournamentPhotoFile(photo.fileUrl);
          const buffer = Buffer.from(await fileData.data.arrayBuffer());
          archive.append(buffer, { name: photo.fileName });
        } catch (error) {
          console.error(`Error adding photo ${photo.fileName} to zip:`, error);
        }
      }

      await archive.finalize();
    } catch (error) {
      console.error("Error creating zip file:", error);
      res.status(500).json({ error: "Failed to create zip file" });
    }
  });

  // League photo routes
  app.post("/api/league-photos/upload", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { leagueId, fileType, fileSize } = req.body;

      if (!leagueId) {
        return res.status(400).json({ error: "League ID is required" });
      }

      // Get user info to check if they have paid access (player_pro) or are a commissioner
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user || user.length === 0) {
        return res.status(403).json({ error: "User not found" });
      }

      // Allow access for: player_pro (paid), commissioner, or secondary_commissioner
      const hasAccess = user[0].role === 'player_pro' || 
                        user[0].role === 'commissioner' || 
                        user[0].role === 'secondary_commissioner';

      if (!hasAccess) {
        return res.status(403).json({ error: "League photos require a paid subscription" });
      }

      // Validate file type (only images allowed)
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!fileType || !allowedTypes.includes(fileType.toLowerCase())) {
        return res.status(400).json({ error: "Invalid file type. Only images (JPEG, PNG, GIF, WebP) are allowed" });
      }

      // Validate file size (max 10MB)
      const maxSize = 10 * 1024 * 1024;
      if (!fileSize || fileSize > maxSize) {
        return res.status(400).json({ error: "File size exceeds maximum of 10MB" });
      }

      // Check if user is an approved member of the league
      const membership = await db
        .select()
        .from(leagueMemberships)
        .where(
          and(
            eq(leagueMemberships.leagueId, leagueId),
            eq(leagueMemberships.userId, userId),
            eq(leagueMemberships.status, 'approved')
          )
        )
        .limit(1);

      if (!membership || membership.length === 0) {
        return res.status(403).json({ error: "Only approved league members can upload photos" });
      }

      const { SupabaseStorageService } = await import('./supabaseStorage');
      const supabaseStorageService = new SupabaseStorageService();
      const { uploadURL, path } = await supabaseStorageService.getLeaguePhotoUploadURL();
      res.json({ uploadURL, path });
    } catch (error) {
      console.error("Error getting league photo upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  app.get("/league-photos/:objectPath(*)", async (req, res) => {
    try {
      const { SupabaseStorageService, SupabaseStorageNotFoundError } = await import('./supabaseStorage');
      const supabaseStorageService = new SupabaseStorageService();
      const fullPath = `/league-photos/${req.params.objectPath}`;
      const objectFile = await supabaseStorageService.getLeaguePhotoFile(fullPath);
      await supabaseStorageService.streamToResponse(objectFile, res);
    } catch (error) {
      console.error("Error serving league photo:", error);
      if ((error as Error).name === 'SupabaseStorageNotFoundError') {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  app.post("/api/league-photos", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { leagueId, fileUrl, fileName, fileSize, caption } = req.body;

      if (!leagueId || !fileUrl || !fileName) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Check if user is an approved member of the league
      const membership = await db
        .select()
        .from(leagueMemberships)
        .where(
          and(
            eq(leagueMemberships.leagueId, leagueId),
            eq(leagueMemberships.userId, userId),
            eq(leagueMemberships.status, 'approved')
          )
        )
        .limit(1);

      if (!membership || membership.length === 0) {
        return res.status(403).json({ error: "Only approved league members can upload photos" });
      }

      // Get user info to check if they have paid access (player_pro) or are a commissioner
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user || user.length === 0) {
        return res.status(403).json({ error: "User not found" });
      }

      // Allow access for: player_pro (paid), commissioner, or secondary_commissioner
      const hasAccess = user[0].role === 'player_pro' || 
                        user[0].role === 'commissioner' || 
                        user[0].role === 'secondary_commissioner';

      if (!hasAccess) {
        return res.status(403).json({ error: "League photos require a paid subscription" });
      }

      const { SupabaseStorageService } = await import('./supabaseStorage');
      const supabaseStorageService = new SupabaseStorageService();
      const normalizedPath = supabaseStorageService.normalizeLeaguePhotoPath(fileUrl);

      // Always set uploadedBy to the authenticated user (prevent spoofing)
      const photo = await storage.createLeaguePhoto({
        leagueId,
        uploadedBy: userId,
        fileUrl: normalizedPath,
        fileName,
        fileSize: fileSize || 0,
        caption: caption || null,
      });

      res.json(photo);
    } catch (error) {
      console.error("Error creating league photo:", error);
      res.status(500).json({ error: "Failed to create photo" });
    }
  });

  app.get("/api/league-photos/:leagueId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { leagueId } = req.params;

      // Check if user is an approved member of the league
      const membership = await db
        .select()
        .from(leagueMemberships)
        .where(
          and(
            eq(leagueMemberships.leagueId, leagueId),
            eq(leagueMemberships.userId, userId),
            eq(leagueMemberships.status, 'approved')
          )
        )
        .limit(1);

      if (!membership || membership.length === 0) {
        return res.status(403).json({ error: "Only approved league members can view photos" });
      }

      // Get user info to check if they have paid access (player_pro) or are a commissioner
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user || user.length === 0) {
        return res.status(403).json({ error: "User not found" });
      }

      // Allow access for: player_pro (paid), commissioner, or secondary_commissioner
      const hasAccess = user[0].role === 'player_pro' || 
                        user[0].role === 'commissioner' || 
                        user[0].role === 'secondary_commissioner';

      if (!hasAccess) {
        return res.status(403).json({ error: "League photos require a paid subscription" });
      }

      const photos = await storage.getLeaguePhotos(leagueId);
      res.json(photos);
    } catch (error) {
      console.error("Error fetching league photos:", error);
      res.status(500).json({ error: "Failed to fetch photos" });
    }
  });

  app.delete("/api/league-photos/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;

      const photo = await storage.getLeaguePhoto(id);
      if (!photo) {
        return res.status(404).json({ error: "Photo not found" });
      }

      // Check if user is the uploader
      if (photo.uploadedBy !== userId) {
        return res.status(403).json({ error: "Unauthorized to delete this photo" });
      }

      // Check if user is still an approved member of the league
      const membership = await db
        .select()
        .from(leagueMemberships)
        .where(
          and(
            eq(leagueMemberships.leagueId, photo.leagueId),
            eq(leagueMemberships.userId, userId),
            eq(leagueMemberships.status, 'approved')
          )
        )
        .limit(1);

      if (!membership || membership.length === 0) {
        return res.status(403).json({ error: "Only approved league members can delete photos" });
      }

      // Get user info to check if they have paid access (player_pro) or are a commissioner
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user || user.length === 0) {
        return res.status(403).json({ error: "User not found" });
      }

      // Allow access for: player_pro (paid), commissioner, or secondary_commissioner
      const hasAccess = user[0].role === 'player_pro' || 
                        user[0].role === 'commissioner' || 
                        user[0].role === 'secondary_commissioner';

      if (!hasAccess) {
        return res.status(403).json({ error: "League photos require a paid subscription" });
      }

      const { SupabaseStorageService } = await import('./supabaseStorage');
      const supabaseStorageService = new SupabaseStorageService();
      await supabaseStorageService.deleteLeaguePhoto(photo.fileUrl);

      await storage.deleteLeaguePhoto(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting league photo:", error);
      res.status(500).json({ error: "Failed to delete photo" });
    }
  });

  app.get("/api/league-photos/:leagueId/download-zip", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { leagueId } = req.params;

      // Check if user is an approved member of the league
      const membership = await db
        .select()
        .from(leagueMemberships)
        .where(
          and(
            eq(leagueMemberships.leagueId, leagueId),
            eq(leagueMemberships.userId, userId),
            eq(leagueMemberships.status, 'approved')
          )
        )
        .limit(1);

      if (!membership || membership.length === 0) {
        return res.status(403).json({ error: "Only approved league members can download photos" });
      }

      // Get user info to check if they have paid access (player_pro) or are a commissioner
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user || user.length === 0) {
        return res.status(403).json({ error: "User not found" });
      }

      // Allow access for: player_pro (paid), commissioner, or secondary_commissioner
      const hasAccess = user[0].role === 'player_pro' || 
                        user[0].role === 'commissioner' || 
                        user[0].role === 'secondary_commissioner';

      if (!hasAccess) {
        return res.status(403).json({ error: "League photos require a paid subscription" });
      }

      const photos = await storage.getLeaguePhotos(leagueId);

      if (photos.length === 0) {
        return res.status(404).json({ error: "No photos found" });
      }

      const { SupabaseStorageService } = await import('./supabaseStorage');
      const supabaseStorageService = new SupabaseStorageService();
      const archiver = require('archiver');

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="league-${leagueId}-photos.zip"`);

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.pipe(res);

      for (const photo of photos) {
        try {
          const fileData = await supabaseStorageService.getLeaguePhotoFile(photo.fileUrl);
          const buffer = Buffer.from(await fileData.data.arrayBuffer());
          archive.append(buffer, { name: photo.fileName });
        } catch (error) {
          console.error(`Error adding photo ${photo.fileName} to zip:`, error);
        }
      }

      await archive.finalize();
    } catch (error) {
      console.error("Error creating zip file:", error);
      res.status(500).json({ error: "Failed to create zip file" });
    }
  });

  // Photo tag routes - Tournament
  app.post("/api/tournament-photos/:photoId/tags", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { photoId } = req.params;
      const { taggedUserIds } = req.body;

      if (!taggedUserIds || !Array.isArray(taggedUserIds)) {
        return res.status(400).json({ error: "taggedUserIds must be an array" });
      }

      const photo = await storage.getTournamentPhoto(photoId);
      if (!photo) {
        return res.status(404).json({ error: "Photo not found" });
      }

      const tagger = await storage.getUser(userId);
      const taggerName = tagger
        ? [tagger.firstName, tagger.lastName].filter(Boolean).join(' ') || 'Someone'
        : 'Someone';

      const results = [];
      for (const taggedUserId of taggedUserIds) {
        try {
          const tag = await storage.addTournamentPhotoTag({
            photoId,
            userId: taggedUserId,
            taggedBy: userId,
          });
          results.push(tag);

          if (taggedUserId !== userId) {
            const prefs = await storage.getNotificationPreferences(taggedUserId);
            const settings = prefs?.notificationSettings as Record<string, boolean> | undefined;
            const photoTagEnabled = settings?.photoTagNotifications !== false;
            if (photoTagEnabled) {
              await storage.createNotification({
                userId: taggedUserId,
                type: 'photo_tag',
                title: 'You were tagged in a photo',
                message: `${taggerName} tagged you in a photo`,
                actionUrl: `/media/tournament/${photo.tournamentId}`,
                actionText: 'View Photo',
                isRead: false,
                isDismissed: false,
              });
              broadcastNotificationUpdate(taggedUserId);
              import('./oneSignalNotifications').then(({ sendPhotoTagPushNotification }) => {
                sendPhotoTagPushNotification(taggedUserId, taggerName, 'tournament', photo.tournamentId)
                  .catch((err: unknown) => console.error('[Push] Photo tag push failed (tournament):', err));
              }).catch((err) => console.error('[Push] Failed to load push module (tournament):', err));
            }
          }
        } catch (error) {
          console.error(`Error tagging user ${taggedUserId}:`, error);
        }
      }

      res.json({ success: true, tags: results });
    } catch (error) {
      console.error("Error adding photo tags:", error);
      res.status(500).json({ error: "Failed to add photo tags" });
    }
  });

  app.get("/api/tournament-photos/:photoId/tags", async (req, res) => {
    try {
      const { photoId } = req.params;
      const tags = await storage.getTournamentPhotoTags(photoId);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching photo tags:", error);
      res.status(500).json({ error: "Failed to fetch photo tags" });
    }
  });

  // Batch endpoint to get tags for multiple tournament photos at once
  app.get("/api/tournaments/:tournamentId/photos/tags-batch", isAuthenticated, async (req: any, res) => {
    try {
      const { tournamentId } = req.params;
      
      // Use efficient single-query batch method
      const tagsMap = await storage.getAllTournamentPhotoTags(tournamentId);
      
      res.json(tagsMap);
    } catch (error) {
      console.error("Error fetching batch photo tags:", error);
      res.status(500).json({ error: "Failed to fetch photo tags" });
    }
  });

  app.delete("/api/tournament-photos/:photoId/tags/:userId", isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user.claims.sub;
      const { photoId, userId } = req.params;

      const photo = await storage.getTournamentPhoto(photoId);
      if (!photo) {
        return res.status(404).json({ error: "Photo not found" });
      }

      if (photo.uploadedBy !== currentUserId && userId !== currentUserId) {
        return res.status(403).json({ error: "Unauthorized to remove this tag" });
      }

      await storage.removeTournamentPhotoTag(photoId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing photo tag:", error);
      res.status(500).json({ error: "Failed to remove photo tag" });
    }
  });

  // Photo tag routes - League
  app.post("/api/league-photos/:photoId/tags", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { photoId } = req.params;
      const { taggedUserIds } = req.body;

      if (!taggedUserIds || !Array.isArray(taggedUserIds)) {
        return res.status(400).json({ error: "taggedUserIds must be an array" });
      }

      const photo = await storage.getLeaguePhoto(photoId);
      if (!photo) {
        return res.status(404).json({ error: "Photo not found" });
      }

      const tagger = await storage.getUser(userId);
      const taggerName = tagger
        ? [tagger.firstName, tagger.lastName].filter(Boolean).join(' ') || 'Someone'
        : 'Someone';

      const results = [];
      for (const taggedUserId of taggedUserIds) {
        try {
          const tag = await storage.addLeaguePhotoTag({
            photoId,
            userId: taggedUserId,
            taggedBy: userId,
          });
          results.push(tag);

          if (taggedUserId !== userId) {
            const prefs = await storage.getNotificationPreferences(taggedUserId);
            const settings = prefs?.notificationSettings as Record<string, boolean> | undefined;
            const photoTagEnabled = settings?.photoTagNotifications !== false;
            if (photoTagEnabled) {
              await storage.createNotification({
                userId: taggedUserId,
                type: 'photo_tag',
                title: 'You were tagged in a photo',
                message: `${taggerName} tagged you in a photo`,
                actionUrl: `/media/league/${photo.leagueId}`,
                actionText: 'View Photo',
                isRead: false,
                isDismissed: false,
              });
              broadcastNotificationUpdate(taggedUserId);
              import('./oneSignalNotifications').then(({ sendPhotoTagPushNotification }) => {
                sendPhotoTagPushNotification(taggedUserId, taggerName, 'league', photo.leagueId)
                  .catch((err: unknown) => console.error('[Push] Photo tag push failed (league):', err));
              }).catch((err) => console.error('[Push] Failed to load push module (league):', err));
            }
          }
        } catch (error) {
          console.error(`Error tagging user ${taggedUserId}:`, error);
        }
      }

      res.json({ success: true, tags: results });
    } catch (error) {
      console.error("Error adding photo tags:", error);
      res.status(500).json({ error: "Failed to add photo tags" });
    }
  });

  app.get("/api/league-photos/:photoId/tags", async (req, res) => {
    try {
      const { photoId } = req.params;
      const tags = await storage.getLeaguePhotoTags(photoId);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching photo tags:", error);
      res.status(500).json({ error: "Failed to fetch photo tags" });
    }
  });

  // Batch endpoint to get tags for multiple league photos at once
  app.get("/api/leagues/:leagueId/photos/tags-batch", isAuthenticated, async (req: any, res) => {
    try {
      const { leagueId } = req.params;
      
      // Use efficient single-query batch method
      const tagsMap = await storage.getAllLeaguePhotoTags(leagueId);
      
      res.json(tagsMap);
    } catch (error) {
      console.error("Error fetching batch photo tags:", error);
      res.status(500).json({ error: "Failed to fetch photo tags" });
    }
  });

  app.delete("/api/league-photos/:photoId/tags/:userId", isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user.claims.sub;
      const { photoId, userId } = req.params;

      const photo = await storage.getLeaguePhoto(photoId);
      if (!photo) {
        return res.status(404).json({ error: "Photo not found" });
      }

      if (photo.uploadedBy !== currentUserId && userId !== currentUserId) {
        return res.status(403).json({ error: "Unauthorized to remove this tag" });
      }

      await storage.removeLeaguePhotoTag(photoId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing photo tag:", error);
      res.status(500).json({ error: "Failed to remove photo tag" });
    }
  });

  // User search for tagging
  app.get("/api/users/search", isAuthenticated, async (req: any, res) => {
    try {
      const { q, leagueId, tournamentId } = req.query;
      
      if (!q || typeof q !== 'string' || q.length < 2) {
        return res.json([]);
      }

      let usersQuery;
      
      if (tournamentId) {
        usersQuery = await db
          .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            profileImageUrl: users.profileImageUrl,
          })
          .from(users)
          .innerJoin(tournamentParticipants, eq(users.id, tournamentParticipants.userId))
          .where(
            and(
              eq(tournamentParticipants.tournamentId, tournamentId as string),
              eq(tournamentParticipants.status, 'approved'),
              or(
                sql`LOWER(${users.firstName}) LIKE LOWER(${`%${q}%`})`,
                sql`LOWER(${users.lastName}) LIKE LOWER(${`%${q}%`})`,
                sql`LOWER(CONCAT(${users.firstName}, ' ', ${users.lastName})) LIKE LOWER(${`%${q}%`})`
              )
            )
          )
          .limit(10);
      } else if (leagueId) {
        usersQuery = await db
          .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            profileImageUrl: users.profileImageUrl,
          })
          .from(users)
          .innerJoin(leagueMemberships, eq(users.id, leagueMemberships.userId))
          .where(
            and(
              eq(leagueMemberships.leagueId, leagueId as string),
              eq(leagueMemberships.status, 'approved'),
              or(
                sql`LOWER(${users.firstName}) LIKE LOWER(${`%${q}%`})`,
                sql`LOWER(${users.lastName}) LIKE LOWER(${`%${q}%`})`,
                sql`LOWER(CONCAT(${users.firstName}, ' ', ${users.lastName})) LIKE LOWER(${`%${q}%`})`
              )
            )
          )
          .limit(10);
      } else {
        usersQuery = await db
          .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            profileImageUrl: users.profileImageUrl,
          })
          .from(users)
          .where(
            or(
              sql`LOWER(${users.firstName}) LIKE LOWER(${`%${q}%`})`,
              sql`LOWER(${users.lastName}) LIKE LOWER(${`%${q}%`})`,
              sql`LOWER(CONCAT(${users.firstName}, ' ', ${users.lastName})) LIKE LOWER(${`%${q}%`})`
            )
          )
          .limit(10);
      }

      res.json(usersQuery);
    } catch (error) {
      console.error("Error searching users:", error);
      res.status(500).json({ error: "Failed to search users" });
    }
  });

  // League routes
  app.get("/api/leagues", async (req, res) => {
    try {
      const { sport, search } = req.query;
      const leagues = await storage.getLeagues(
        sport as string,
        search as string
      );
      // Explicitly map to ensure uniqueLeagueId is present
      const mappedLeagues = leagues.map(league => ({
        ...league,
        uniqueLeagueId: league.uniqueLeagueId || (league as any).unique_league_id
      }));
      res.json(mappedLeagues);
    } catch (error) {
      console.error("Error fetching leagues:", error);
      res.status(500).json({ message: "Failed to fetch leagues" });
    }
  });

  app.get("/api/leagues/commissioner", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Check if user has stat_manager permission
      const hasStatManager = user.specialPermissions && user.specialPermissions.includes('stat_manager');
      
      // Stat managers can see all leagues they're a member of
      // Commissioners only see leagues they commission
      const leagues = hasStatManager 
        ? await storage.getUserLeagues(userId)
        : await storage.getLeaguesByCommissioner(userId);
      
      // Explicitly map to ensure uniqueLeagueId is present
      const mappedLeagues = leagues.map(league => ({
        ...league,
        uniqueLeagueId: league.uniqueLeagueId || (league as any).unique_league_id
      }));
      res.json(mappedLeagues);
    } catch (error) {
      console.error("Error fetching commissioner leagues:", error);
      res.status(500).json({ message: "Failed to fetch leagues" });
    }
  });

  // Get leagues where user can manage tournaments (commissioner, secondary commissioner, or admin)
  app.get("/api/leagues/manageable", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Get leagues where user is commissioner
      const commissionerLeagues = await storage.getLeaguesByCommissioner(userId);
      
      // Get leagues where user is secondary commissioner
      const allMemberships = await storage.getUserLeagueMemberships(userId);
      const secondaryCommissionerLeagueIds = allMemberships
        .filter(m => m.leagueRole === 'secondary_commissioner')
        .map(m => m.leagueId);
      
      // Fetch the secondary commissioner leagues
      const secondaryLeaguesResults = await Promise.all(
        secondaryCommissionerLeagueIds.map(id => storage.getLeague(id))
      );
      const secondaryLeagues = secondaryLeaguesResults.filter((league): league is NonNullable<typeof league> => league !== null && league !== undefined);
      
      // Combine and deduplicate
      const allManageableLeagues = [...commissionerLeagues, ...secondaryLeagues];
      const uniqueLeagues = Array.from(
        new Map(allManageableLeagues.map(league => [league.id, league])).values()
      );
      
      // Get tournament counts for each league
      const leaguesWithCounts = await Promise.all(
        uniqueLeagues.map(async (league) => {
          try {
            const tournamentList = await db
              .select()
              .from(tournaments)
              .where(eq(tournaments.leagueId, league.id.toString()));
            
            return {
              ...league,
              uniqueLeagueId: league.uniqueLeagueId || (league as any).unique_league_id,
              tournamentCount: tournamentList.length
            };
          } catch (error) {
            // If tournament fetch fails, return league with 0 count
            return {
              ...league,
              uniqueLeagueId: league.uniqueLeagueId || (league as any).unique_league_id,
              tournamentCount: 0
            };
          }
        })
      );
      
      res.json(leaguesWithCounts);
    } catch (error) {
      console.error("Error fetching manageable leagues:", error);
      res.status(500).json({ message: "Failed to fetch manageable leagues" });
    }
  });

  app.post("/api/leagues", isAuthenticated, loadUserPermissions, requireLeagueManagement, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { season, ...leagueBody } = req.body;
      
      const leagueData = insertLeagueSchema.parse({
        ...leagueBody,
        commissionerId: userId
      });
      
      // Generate unique league ID if not provided
      if (!leagueData.uniqueLeagueId) {
        leagueData.uniqueLeagueId = nanoid(8);
      }
      
      // Check if unique league ID already exists
      const existingLeague = await storage.getLeagueByUniqueId(leagueData.uniqueLeagueId);
      if (existingLeague) {
        return res.status(400).json({ message: "League ID already exists, please choose a different name" });
      }
      
      const league = await storage.createLeague({
        ...leagueData,
        commissionerId: userId,
      });

      // Automatically create season if one was provided during league creation
      if (season && season.trim()) {
        try {
          await storage.createSeason({
            leagueId: league.id,
            name: season,
            isActive: true,
          });
        } catch (seasonError) {
          console.warn("Failed to create season during league creation:", seasonError);
          // Don't fail the whole operation if season creation fails
        }
      }

      res.json(league);
    } catch (error) {
      console.error("Error creating league:", error);
      res.status(500).json({ message: "Failed to create league" });
    }
  });

  app.patch("/api/leagues/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const leagueId = req.params.id;
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Verify that the user owns the league - try by primary key first, then by uniqueLeagueId
      let league = await storage.getLeague(leagueId);
      if (!league) {
        league = await storage.getLeagueByUniqueId(leagueId);
      }
      if (!league || league.commissionerId !== userId) {
        return res.status(403).json({ message: "You can only edit your own leagues" });
      }
      
      const result = await storage.updateLeague(league.id, req.body);
      res.json(result);
    } catch (error) {
      console.error("Error updating league:", error);
      res.status(500).json({ message: "Failed to update league" });
    }
  });

  app.get("/api/leagues/:id", async (req, res) => {
    try {
      // Try by primary key first, then by uniqueLeagueId
      let league = await storage.getLeague(req.params.id);
      if (!league) {
        league = await storage.getLeagueByUniqueId(req.params.id);
      }
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      res.json(league);
    } catch (error) {
      console.error("Error fetching league:", error);
      res.status(500).json({ message: "Failed to fetch league" });
    }
  });

  app.delete("/api/leagues/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const leagueId = req.params.id;
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Verify that the user owns the league - try by primary key first, then by uniqueLeagueId
      let league = await storage.getLeague(leagueId);
      if (!league) {
        league = await storage.getLeagueByUniqueId(leagueId);
      }
      if (!league || league.commissionerId !== userId) {
        return res.status(403).json({ message: "You can only delete your own leagues" });
      }
      
      await storage.deleteLeague(league.id);
      res.json({ message: "League deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting league:", error?.message || error);
      res.status(500).json({ message: "Failed to delete league" });
    }
  });

  // Co-commissioner management routes
  app.post("/api/leagues/:leagueId/co-commissioner", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = req.params.leagueId;
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      // Verify that the user is the commissioner of this league
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only the commissioner can add co-commissioners" });
      }

      // Find the user by email
      const targetUser = await storage.getUserByEmail(email);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found with that email" });
      }

      // Check if user is already a member
      const existingMembership = await storage.getUserLeagueMembership(targetUser.id, leagueId);
      
      let updatedMembership;
      
      if (existingMembership) {
        // If already a member, update their role to secondary_commissioner
        updatedMembership = await storage.updateLeagueMember(existingMembership.id, {
          leagueRole: 'secondary_commissioner',
          status: 'approved'
        });
      } else {
        // Create new membership with secondary_commissioner role
        const membership = await storage.requestLeagueMembership({
          userId: targetUser.id,
          leagueId: leagueId,
        });
        
        // Update the membership to secondary_commissioner and approved
        updatedMembership = await storage.updateLeagueMember(membership.id, {
          leagueRole: 'secondary_commissioner',
          status: 'approved'
        });
      }
      
      // Send notification to the new co-commissioner
      const commissioner = await storage.getUser(userId);
      const commissionerName = commissioner 
        ? `${commissioner.firstName || ''} ${commissioner.lastName || ''}`.trim() || 'The commissioner'
        : 'The commissioner';
      
      await storage.createNotification({
        userId: targetUser.id,
        type: 'general',
        title: 'Co-Commissioner Role Granted',
        message: `${commissionerName} has added you as a co-commissioner for ${league.name}. You now have access to League Management features for this league.`,
        actionUrl: `/league-management/${leagueId}`,
        actionText: 'View League Management'
      });
      broadcastNotificationUpdate(targetUser.id);
      
      // Send push notification
      try {
        const { sendCoCommissionerPushNotification } = await import('./oneSignalNotifications');
        const pushResult = await sendCoCommissionerPushNotification(
          targetUser.id,
          league.name,
          commissionerName,
          leagueId
        );
        console.log(`[Push] Co-commissioner notification to ${targetUser.id}: ${pushResult ? 'sent' : 'skipped/failed'}`);
      } catch (pushError) {
        console.error('[Push] Failed to send co-commissioner notification:', pushError);
      }
      
      return res.json(updatedMembership);
    } catch (error) {
      console.error("Error adding co-commissioner:", error);
      res.status(500).json({ message: "Failed to add co-commissioner" });
    }
  });

  app.delete("/api/leagues/:leagueId/co-commissioner/:memberId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { leagueId, memberId } = req.params;

      // Verify that the user is the commissioner of this league
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: "Only the commissioner can remove co-commissioners" });
      }

      // Fetch the membership to verify it belongs to this league
      const members = await storage.getLeagueMembers(leagueId);
      const membership = members.find(m => m.id === memberId);
      
      if (!membership) {
        return res.status(404).json({ message: "Membership not found in this league" });
      }

      // Verify the membership belongs to the specified league
      if (membership.leagueId !== leagueId) {
        return res.status(403).json({ message: "Cannot modify memberships from other leagues" });
      }

      // Update the member's role back to free_tier
      const updatedMembership = await storage.updateLeagueMember(memberId, {
        leagueRole: 'free_tier'
      });

      res.json(updatedMembership);
    } catch (error) {
      console.error("Error removing co-commissioner:", error);
      res.status(500).json({ message: "Failed to remove co-commissioner" });
    }
  });

  // Season routes
  app.get("/api/leagues/:leagueId/seasons", async (req, res) => {
    try {
      const seasons = await storage.getSeasonsByLeague(req.params.leagueId);
      res.json(seasons);
    } catch (error) {
      console.error("Error fetching seasons:", error);
      res.status(500).json({ message: "Failed to fetch seasons" });
    }
  });

  app.post("/api/leagues/:leagueId/seasons", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const leagueId = req.params.leagueId;
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Verify that the user owns the league
      const league = await storage.getLeague(leagueId);
      if (!league || league.commissionerId !== userId) {
        return res.status(403).json({ message: "You can only manage your own leagues" });
      }
      
      // Validate required fields
      if (!req.body.name || req.body.name.trim() === '') {
        return res.status(400).json({ message: "Season name is required" });
      }
      
      // Prepare season data
      const seasonData = {
        name: req.body.name,
        leagueId: leagueId,
        startDate: req.body.startDate ? new Date(req.body.startDate) : null,
        endDate: req.body.endDate ? new Date(req.body.endDate) : null,
        isActive: req.body.isActive === true || req.body.isActive === 'true'
      };
      
      const season = await storage.createSeason(seasonData);
      res.json(season);
    } catch (error) {
      console.error("Error creating season:", error);
      console.error("Error stack:", error instanceof Error ? error.stack : error);
      res.status(500).json({ message: "Failed to create season" });
    }
  });

  // League membership routes
  app.post("/api/leagues/:id/join", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = req.params.id;
      
      // Validate message length if provided
      if (req.body.message && typeof req.body.message === 'string' && req.body.message.length > 500) {
        return res.status(400).json({ message: "Message cannot exceed 500 characters" });
      }
      
      // Check if already a member
      const existingMembership = await storage.getUserLeagueMembership(userId, leagueId);
      if (existingMembership) {
        // If user has pending or approved status, prevent duplicate request
        if (existingMembership.status === 'pending' || existingMembership.status === 'approved') {
          return res.status(400).json({ message: "Already requested or member" });
        }
        
        // If user was rejected or inactive, allow them to re-request by updating status to pending
        if (existingMembership.status === 'rejected' || existingMembership.status === 'inactive') {
          const updatedMembership = await storage.updateLeagueMembershipStatus(existingMembership.id, 'pending');
          
          // Send WebSocket notification to commissioner for re-request
          storage.getLeague(leagueId).then(async (league) => {
            if (league && league.commissionerId) {
              const requestingUser = await storage.getUser(userId);
              const requesterName = requestingUser 
                ? `${requestingUser.firstName} ${requestingUser.lastName}`.trim() || requestingUser.email 
                : 'Someone';
              
              broadcastToUser(league.commissionerId, {
                type: 'pending_member_added',
                leagueId,
                membershipId: updatedMembership.id,
                requesterName
              });
            }
          }).catch(err => console.error('[Notifications] Failed to send re-request notification:', err));
          
          return res.json(updatedMembership);
        }
      }

      // Create new membership request
      const membership = await storage.requestLeagueMembership({
        userId,
        leagueId,
        message: req.body.message,
      });
      
      // Send push notification and WebSocket broadcast to league commissioner (fire and forget)
      storage.getLeague(leagueId).then(async (league) => {
        if (league && league.commissionerId) {
          const requestingUser = await storage.getUser(userId);
          const requesterName = requestingUser 
            ? `${requestingUser.firstName} ${requestingUser.lastName}`.trim() || requestingUser.email 
            : 'Someone';
          
          // Send WebSocket message to commissioner for immediate UI update
          broadcastToUser(league.commissionerId, {
            type: 'pending_member_added',
            leagueId,
            membershipId: membership.id,
            requesterName
          });
          
          const { sendJoinRequestPushNotification } = await import('./oneSignalNotifications');
          sendJoinRequestPushNotification(
            league.commissionerId,
            requesterName,
            'league',
            league.name,
            membership.id
          ).catch(console.error);
        }
      }).catch(err => console.error('[Notifications] Failed to send join request notification:', err));
      
      res.json(membership);
    } catch (error) {
      console.error("Error joining league:", error);
      res.status(500).json({ message: "Failed to join league" });
    }
  });

  app.get("/api/user/leagues", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagues = await storage.getUserLeagues(userId);
      res.json(leagues);
    } catch (error) {
      console.error("Error fetching user leagues:", error);
      res.status(500).json({ message: "Failed to fetch leagues" });
    }
  });

  app.get("/api/user/league-memberships", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const memberships = await storage.getUserLeagueMemberships(userId);
      res.json(memberships);
    } catch (error) {
      console.error("Error fetching user league memberships:", error);
      res.status(500).json({ message: "Failed to fetch league memberships" });
    }
  });

  // Get paid tournaments where user is a participant or creator
  app.get("/api/user/paid-tournaments", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get tournaments where user is a participant with approved status
      const participantTournaments = await db
        .select({
          id: tournaments.id,
          name: tournaments.name,
          format: tournaments.format,
          status: tournaments.status,
          type: tournaments.type,
          uniqueTournamentId: tournaments.uniqueTournamentId,
          paymentStatus: tournaments.paymentStatus,
          createdBy: tournaments.createdBy,
          tournamentTeamId: tournamentParticipants.tournamentTeamId,
          teamName: tournamentTeams.teamName
        })
        .from(tournamentParticipants)
        .innerJoin(tournaments, eq(tournamentParticipants.tournamentId, tournaments.id))
        .leftJoin(tournamentTeams, eq(tournamentParticipants.tournamentTeamId, tournamentTeams.id))
        .where(and(
          eq(tournamentParticipants.userId, userId),
          eq(tournamentParticipants.status, 'approved'),
          eq(tournaments.paymentStatus, 'paid')
        ));
      
      // Get tournaments created by user that are paid
      const creatorTournaments = await db
        .select({
          id: tournaments.id,
          name: tournaments.name,
          format: tournaments.format,
          status: tournaments.status,
          type: tournaments.type,
          uniqueTournamentId: tournaments.uniqueTournamentId,
          paymentStatus: tournaments.paymentStatus,
          createdBy: tournaments.createdBy,
          tournamentTeamId: sql<string>`null`,
          teamName: sql<string>`null`
        })
        .from(tournaments)
        .where(and(
          eq(tournaments.createdBy, userId),
          eq(tournaments.paymentStatus, 'paid')
        ));
      
      // Combine and deduplicate by tournament ID
      const allTournaments = [...participantTournaments, ...creatorTournaments];
      const uniqueTournaments = Array.from(
        new Map(allTournaments.map(t => [t.id, t])).values()
      );
      
      res.json(uniqueTournaments);
    } catch (error) {
      console.error("Error fetching user paid tournaments:", error);
      res.status(500).json({ message: "Failed to fetch paid tournaments" });
    }
  });

  // Get leagues where user is commissioner
  app.get("/api/user/commissioner-leagues", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagues = await storage.getCommissionerLeagues(userId);
      res.json(leagues);
    } catch (error) {
      console.error("Error fetching commissioner leagues:", error);
      res.status(500).json({ message: "Failed to fetch commissioner leagues" });
    }
  });

  // Update league member details (team assignment, captain role, position, etc.)
  app.patch("/api/leagues/:leagueId/members/:memberId", isAuthenticated, async (req: any, res) => {
    try {
      const { leagueId, memberId } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const league = await storage.getLeague(leagueId);
      
      // Check if user is the commissioner of this league
      if (!league || !user) {
        return res.status(404).json({ message: "League or user not found" });
      }
      
      // Verify user is commissioner or secondary commissioner
      const isCommissioner = league.commissionerId === userId;
      const isSecondaryCommissioner = league.secondaryCommissionerId === userId;
      if (!isCommissioner && !isSecondaryCommissioner) {
        return res.status(403).json({ message: "Only commissioners can update player details" });
      }
      
      const updates = req.body;
      
      // Get the membership to verify it belongs to this league
      const membership = await storage.getLeagueMembership(memberId);
      if (!membership || membership.leagueId !== leagueId) {
        return res.status(404).json({ message: "Member not found in this league" });
      }
      
      // If firstName or lastName is being updated, also update the actual user profile
      if (updates.displayFirstName !== undefined || updates.displayLastName !== undefined) {
        const profileUpdates: { firstName?: string; lastName?: string } = {};
        if (updates.displayFirstName !== undefined) {
          profileUpdates.firstName = updates.displayFirstName;
        }
        if (updates.displayLastName !== undefined) {
          profileUpdates.lastName = updates.displayLastName;
        }
        // Update the actual user profile
        await storage.updateUserProfile(membership.userId, profileUpdates);
      }
      
      // If timezone is being updated, update the user's timezone
      if (updates.timezone !== undefined) {
        await storage.updateUserProfile(membership.userId, { 
          timezone: updates.timezone,
          timezoneManuallySet: true 
        });
      }
      
      // Track if team assignment is changing to sync chats
      const oldTeamId = membership.assignedTeamId;
      const newTeamId = updates.assignedTeamId;
      
      const updatedMember = await storage.updateLeagueMember(memberId, updates);
      
      // If team assignment changed, sync team chats
      if (oldTeamId !== newTeamId) {
        try {
          // Sync old team (if existed) to remove user
          if (oldTeamId) {
            await messagingService.syncTeamChatParticipants(oldTeamId, leagueId);
          }
          // Sync new team (if assigned) to add user
          if (newTeamId) {
            await messagingService.syncTeamChatParticipants(newTeamId, leagueId);
          }
        } catch (error) {
          console.error('Error syncing team chat after member update:', error);
        }
      }
      
      res.json(updatedMember);
    } catch (error) {
      console.error("Error updating league member:", error);
      res.status(500).json({ message: "Failed to update league member" });
    }
  });

  // League Management Routes for Commissioners
  app.get("/api/leagues/:id/members", isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.id;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const league = await storage.getLeague(leagueId);
      
      // Check if user is the commissioner of this league
      if (!league || !user) {
        return res.status(404).json({ message: "League or user not found" });
      }
      
      const members = await storage.getLeagueMembers(leagueId);
      res.json(members);
    } catch (error) {
      console.error("Error fetching league members:", error);
      res.status(500).json({ message: "Failed to fetch league members" });
    }
  });

  // Get league players for stats management
  app.get('/api/leagues/:leagueId/players', isAuthenticated, loadUserPermissions, requireStatsManagement, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const userId = req.user.claims.sub;
      
      // Verify user has access to this league
      const userMembership = await storage.getUserLeagueMembership(userId, leagueId);
      if (!userMembership || userMembership.status !== 'approved') {
        return res.status(403).json({ message: 'Access denied - not an approved league member' });
      }
      
      // Get all league members and format them for stats management
      const members = await storage.getLeagueMembers(leagueId);
      const players = members.map(member => ({
        id: member.user.id,
        // Use displayFirstName/displayLastName from membership if set, otherwise fall back to user's names
        firstName: member.displayFirstName || member.user.firstName || '',
        lastName: member.displayLastName || member.user.lastName || '',
        email: member.user.email,
        isGoalie: member.isGoalie || false,
        teamName: member.assignedTeamId ? null : null // Will be populated if we have team info
      }));
      
      res.json(players);
    } catch (error) {
      console.error('Error fetching league players:', error);
      res.status(500).json({ message: 'Failed to fetch league players' });
    }
  });

  // League members for scrimmage creation - accessible by Player Pro+ users who are members of the league
  app.get("/api/leagues/:id/members-for-scrimmage", isAuthenticated, loadUserPermissions, requirePremiumFeatures, async (req: any, res) => {
    try {
      const leagueId = req.params.id;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const league = await storage.getLeague(leagueId);
      
      // Check if user has Player Plus+ access and is a member of this league
      if (!league || !user) {
        return res.status(404).json({ message: "League or user not found" });
      }
      
      // Check if user is a member of this league
      const userMembership = await storage.getUserLeagueMembership(userId, leagueId);
      if (!userMembership || userMembership.status !== 'approved') {
        return res.status(403).json({ message: "You must be an approved member of this league" });
      }
      
      const members = await storage.getLeagueMembers(leagueId);
      res.json(members);
    } catch (error) {
      console.error("Error fetching league members for scrimmage:", error);
      res.status(500).json({ message: "Failed to fetch league members" });
    }
  });

  app.get("/api/leagues/:id/pending-members", isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.id;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const league = await storage.getLeague(leagueId);
      
      // Check if user is the commissioner of this league
      if (!league || !user) {
        return res.status(404).json({ message: "League or user not found" });
      }
      
      const pendingMembers = await storage.getPendingLeagueMembers(leagueId);
      res.json(pendingMembers);
    } catch (error) {
      console.error("Error fetching pending league members:", error);
      res.status(500).json({ message: "Failed to fetch pending members" });
    }
  });

  app.post("/api/league-memberships/:id/approve", isAuthenticated, async (req: any, res) => {
    try {
      const membershipId = req.params.id;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const membership = await storage.approveLeagueMembership(membershipId, userId);
      res.json(membership);
    } catch (error) {
      console.error("Error approving membership:", error);
      res.status(500).json({ message: "Failed to approve membership" });
    }
  });

  app.post("/api/league-memberships/:id/reject", isAuthenticated, async (req: any, res) => {
    try {
      const membershipId = req.params.id;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const membership = await storage.rejectLeagueMembership(membershipId, userId);
      res.json(membership);
    } catch (error) {
      console.error("Error rejecting membership:", error);
      res.status(500).json({ message: "Failed to reject membership" });
    }
  });

  app.patch("/api/league-memberships/:id/skill-level", isAuthenticated, async (req: any, res) => {
    try {
      const membershipId = req.params.id;
      const { skillLevel } = req.body;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Validate skill level - can be text, number, or null
      const trimmedSkillLevel = skillLevel?.toString()?.trim() || null;
      
      const membership = await storage.updatePlayerSkillLevel(membershipId, trimmedSkillLevel);
      res.json(membership);
    } catch (error) {
      console.error("Error updating skill level:", error);
      res.status(500).json({ message: "Failed to update skill level" });
    }
  });

  app.delete("/api/league-memberships/:id", isAuthenticated, async (req: any, res) => {
    try {
      const membershipId = req.params.id;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      await storage.deleteLeagueMembership(membershipId);
      res.json({ message: "Player removed from league successfully" });
    } catch (error) {
      console.error("Error removing player from league:", error);
      res.status(500).json({ message: "Failed to remove player from league" });
    }
  });

  app.get("/api/leagues/:id/teams", async (req, res) => {
    try {
      const leagueId = req.params.id;
      const teams = await storage.getTeamsByLeague(leagueId);
      res.json(teams);
    } catch (error) {
      console.error("Error fetching league teams:", error);
      res.status(500).json({ message: "Failed to fetch league teams" });
    }
  });

  app.get("/api/leagues/:id/games", async (req, res) => {
    try {
      const leagueId = req.params.id;
      const games = await storage.getGamesByLeague(leagueId);
      
      const tournamentLinkedGames = await db
        .select({ gameId: tournamentMatches.gameId })
        .from(tournamentMatches)
        .where(isNotNull(tournamentMatches.gameId));
      const tournamentGameIds = new Set(tournamentLinkedGames.map(t => t.gameId).filter(Boolean));
      
      const filteredGames = games.filter((game: any) => !tournamentGameIds.has(game.id));
      const formattedGames = filteredGames.map(formatGameForResponse);
      res.json(formattedGames);
    } catch (error) {
      console.error("Error fetching league games:", error);
      res.status(500).json({ message: "Failed to fetch league games" });
    }
  });

  // Get games that need score verification (for commissioners only)
  app.get("/api/leagues/:id/games-needing-verification", isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.id;
      const userId = req.user.claims.sub;
      
      // Check if user is commissioner of this league
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      const isCommissioner = league.commissionerId === userId;
      
      // Also check if user has stat_manager permission
      const user = await storage.getUser(userId);
      const hasStatManager = user?.specialPermissions?.includes('stat_manager');
      
      // Check league-specific permissions
      const leaguePermissions = await storage.getUserLeaguePermissions(userId, leagueId);
      const hasLeagueStatManager = leaguePermissions?.leagueSpecialPermissions?.includes('stat_manager');
      
      if (!isCommissioner && !hasStatManager && !hasLeagueStatManager) {
        // Return empty array for non-commissioners instead of 403
        return res.json([]);
      }
      
      const games = await storage.getGamesByLeague(leagueId);
      
      // Get all game IDs that are linked to tournament matches (these should not appear as regular games)
      const tournamentLinkedGames = await db
        .select({ gameId: tournamentMatches.gameId })
        .from(tournamentMatches)
        .where(isNotNull(tournamentMatches.gameId));
      const tournamentGameIds = new Set(tournamentLinkedGames.map(t => t.gameId).filter(Boolean));
      
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      
      // Filter games that started more than 1 hour ago (exclude scrimmages and tournament-linked games)
      const pastGames = games.filter((game: any) => {
        if (game.isScrimmage) return false;
        if (tournamentGameIds.has(game.id)) return false;
        const gameStart = new Date(game.scheduledAt);
        return gameStart <= oneHourAgo;
      });
      
      // Batch fetch all score submissions for past games (optimization)
      const pastGameIds = pastGames.map((g: any) => g.id);
      const allSubmissions = pastGameIds.length > 0 
        ? await db.select().from(gameScoreSubmissions).where(inArray(gameScoreSubmissions.gameId, pastGameIds))
        : [];
      
      // Group submissions by game ID for quick lookup
      const submissionsByGameId = new Map<string, typeof allSubmissions>();
      for (const sub of allSubmissions) {
        const existing = submissionsByGameId.get(sub.gameId) || [];
        existing.push(sub);
        submissionsByGameId.set(sub.gameId, existing);
      }
      
      // Check each past game for verification needs
      const gamesNeedingVerification = [];
      
      for (const game of pastGames) {
        const submissions = submissionsByGameId.get(game.id) || [];
        const submissionCount = submissions.length;
        let needsVerification = false;
        let reason = '';
        
        // Check for commissioner override
        const hasCommissionerSubmission = submissions.some((sub: any) => 
          sub.submitterRole === 'commissioner' || sub.isCommissionerOverride === true
        );
        
        if (hasCommissionerSubmission) {
          needsVerification = false;
        } else if (submissionCount === 0) {
          needsVerification = true;
          reason = 'No score submissions';
        } else if (submissionCount === 1) {
          needsVerification = true;
          reason = 'Missing one team submission';
        } else if (submissionCount === 2) {
          const [sub1, sub2] = submissions;
          if (sub1.homeScore !== sub2.homeScore || sub1.awayScore !== sub2.awayScore) {
            needsVerification = true;
            reason = `Mismatched scores: ${sub1.homeScore}-${sub1.awayScore} vs ${sub2.homeScore}-${sub2.awayScore}`;
          }
        }
        
        if (needsVerification) {
          gamesNeedingVerification.push({
            ...formatGameForResponse(game),
            reason,
            submissionCount
          });
        }
      }
      
      res.json(gamesNeedingVerification);
    } catch (error) {
      console.error("Error fetching games needing verification:", error);
      res.status(500).json({ message: "Failed to fetch games needing verification" });
    }
  });

  // Get tournament matches needing score verification for a league
  app.get("/api/leagues/:id/tournament-matches-needing-verification", isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.id;
      const userId = req.user.claims.sub;
      
      // Check if user is commissioner of this league
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      const isCommissioner = league.commissionerId === userId;
      
      // Also check if user has stat_manager permission
      const user = await storage.getUser(userId);
      const hasStatManager = user?.specialPermissions?.includes('stat_manager');
      
      // Check league-specific permissions
      const leaguePermissions = await storage.getUserLeaguePermissions(userId, leagueId);
      const hasLeagueStatManager = leaguePermissions?.leagueSpecialPermissions?.includes('stat_manager');
      
      if (!isCommissioner && !hasStatManager && !hasLeagueStatManager) {
        // Return empty array for non-commissioners instead of 403
        return res.json([]);
      }
      
      // Get all tournaments for this league
      const leagueTournaments = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.leagueId, leagueId));
      
      if (leagueTournaments.length === 0) {
        return res.json([]);
      }
      
      const tournamentIds = leagueTournaments.map(t => t.id);
      
      // Get all matches from these tournaments that need verification
      // A match needs verification if:
      // 1. It has both teams assigned (team1Id and team2Id are not null)
      // 2. It has a scheduled time in the past
      // 3. It doesn't have scores set yet (team1Score or team2Score is null)
      // 4. Status is not 'completed'
      const allMatches = await db
        .select()
        .from(tournamentMatches)
        .where(inArray(tournamentMatches.tournamentId, tournamentIds));
      
      // Batch fetch all tournament teams for these tournaments (optimization)
      const allTournamentTeams = await db
        .select()
        .from(tournamentTeams)
        .where(inArray(tournamentTeams.tournamentId, tournamentIds));
      
      // Create a map for quick team name lookups
      const teamNameMap = new Map<string, string>();
      for (const team of allTournamentTeams) {
        teamNameMap.set(team.id, team.teamName);
      }
      
      const today = new Date();
      
      const matchesNeedingVerification = [];
      
      // Helper function to check if team name is a real team (not placeholder)
      const isRealTeam = (name: string | null | undefined): name is string => 
        !!name && !name.startsWith('winner:') && !name.startsWith('loser:') && name !== '';
      
      for (const match of allMatches) {
        const tournament = leagueTournaments.find(t => t.id === match.tournamentId);
        const settings = tournament?.settings as any;
        
        // Get team names - first try from team IDs (using cached map), then from custom bracket settings
        let team1Name: string | null = match.team1Id ? teamNameMap.get(match.team1Id) || null : null;
        let team2Name: string | null = match.team2Id ? teamNameMap.get(match.team2Id) || null : null;
        
        // For custom brackets, get team names from settings if not already set
        if (settings?.customBracket?.matchups) {
          const matchup = settings.customBracket.matchups.find(
            (m: any) => m.id === match.id
          );
          if (matchup) {
            if (!team1Name && isRealTeam(matchup.team1)) {
              team1Name = matchup.team1;
            }
            if (!team2Name && isRealTeam(matchup.team2)) {
              team2Name = matchup.team2;
            }
          }
        }
        
        // Must have both teams assigned (either via IDs or custom bracket names)
        if (!team1Name || !team2Name) continue;
        
        // Must have a scheduled time in the past (or no scheduled time but tournament has started)
        const matchTime = match.scheduledTime ? new Date(match.scheduledTime) : null;
        const tournamentStartDate = tournament?.startDate ? new Date(tournament.startDate) : null;
        
        // Check if match should be played already
        let isPastMatch = false;
        if (matchTime && matchTime < today) {
          isPastMatch = true;
        } else if (!matchTime && tournamentStartDate && tournamentStartDate < today) {
          // No scheduled time but tournament has started - include it
          isPastMatch = true;
        }
        
        if (!isPastMatch) continue;

        
        // Must not already have scores set
        if (match.team1Score !== null && match.team2Score !== null) continue;
        
        // Must not be completed
        if (match.status === 'completed') continue;
        
        matchesNeedingVerification.push({
          ...match,
          team1Name: team1Name,
          team2Name: team2Name,
          tournamentName: tournament?.name || 'Unknown Tournament',
          tournamentId: tournament?.id,
          reason: 'Score not entered'
        });
      }
      
      res.json(matchesNeedingVerification);
    } catch (error) {
      console.error("Error fetching tournament matches needing verification:", error);
      res.status(500).json({ message: "Failed to fetch tournament matches needing verification" });
    }
  });

  app.get("/api/leagues/:id/standings", async (req, res) => {
    try {
      const leagueId = req.params.id;
      const seasonId = typeof req.query.seasonId === 'string' ? req.query.seasonId : undefined;
      const standings = await storage.getLeagueStandings(leagueId, seasonId);
      res.json(standings);
    } catch (error) {
      console.error("Error fetching league standings:", error);
      res.status(500).json({ message: "Failed to fetch league standings" });
    }
  });

  // Team routes
  app.get("/api/teams/:id", isAuthenticated, async (req: any, res) => {
    try {
      const teamId = req.params.id;
      const team = await storage.getTeam(teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }
      res.json(team);
    } catch (error) {
      console.error("Error fetching team:", error);
      res.status(500).json({ message: "Failed to fetch team" });
    }
  });

  app.post("/api/teams", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const teamData = insertTeamSchema.parse(req.body);
      const team = await storage.createTeam({
        ...teamData,
        captainId: userId,
      });
      res.json(team);
    } catch (error) {
      console.error("Error creating team:", error);
      res.status(500).json({ message: "Failed to create team" });
    }
  });

  app.patch("/api/teams/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const teamId = req.params.id;
      const { name } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ message: "Team name is required" });
      }

      // Check if user is the team captain or commissioner
      const team = await storage.getTeam(teamId);
      const user = await storage.getUser(userId);
      const isTeamCaptain = team && team.captainId === userId;
      const isCommissioner = user && (user.role === 'commissioner' || user.role === 'secondary_commissioner' || user.specialPermissions?.includes('admin'));
      
      if (!team || (!isTeamCaptain && !isCommissioner)) {
        return res.status(403).json({ message: "Only team captains and commissioners can update team name" });
      }

      const updatedTeam = await storage.updateTeam(teamId, { name: name.trim() });
      res.json(updatedTeam);
    } catch (error) {
      console.error("Error updating team name:", error);
      res.status(500).json({ message: "Failed to update team name" });
    }
  });

  app.patch("/api/teams/:id/logo", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const teamId = req.params.id;
      const { logoUrl } = req.body;

      if (!logoUrl) {
        return res.status(400).json({ message: "Logo URL is required" });
      }

      // Check if user is the team captain, league member captain, or commissioner
      const team = await storage.getTeam(teamId);
      const user = await storage.getUser(userId);
      const isTeamCaptain = team && team.captainId === userId;
      const isCommissioner = user && (user.role === 'commissioner' || user.role === 'secondary_commissioner' || user.specialPermissions?.includes('admin'));
      
      // Also check if user is a league member captain for this team's league
      let isLeagueMemberCaptain = false;
      if (team) {
        const leagueMemberships = await storage.getUserLeagueMemberships(userId);
        // Check if user is captain of the team through teams.captainId
        isLeagueMemberCaptain = team.captainId === userId;
      }
      
      if (!team || (!isTeamCaptain && !isLeagueMemberCaptain && !isCommissioner)) {
        return res.status(403).json({ message: "Only team captains and commissioners can update team logos" });
      }

      // Normalize the logo URL to use a relative path that can be served through the backend
      const { ObjectStorageService } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      const normalizedLogoUrl = objectStorageService.normalizeTeamLogoPath(logoUrl);

      const updatedTeam = await storage.updateTeamLogo(teamId, normalizedLogoUrl);
      res.json(updatedTeam);
    } catch (error) {
      console.error("Error updating team logo:", error);
      res.status(500).json({ message: "Failed to update team logo" });
    }
  });

  app.get("/api/teams/:id/members", async (req, res) => {
    try {
      const teamId = req.params.id;
      const members = await storage.getTeamMembers(teamId);
      
      // Get all captains for this team to properly set isCaptain flag
      const captainIds = await storage.getTeamCaptains(teamId);
      
      // Add isCaptain flag to each member based on captains list
      const membersWithCaptainStatus = members.map(member => ({
        ...member,
        isCaptain: captainIds.includes(member.userId)
      }));
      
      res.json(membersWithCaptainStatus);
    } catch (error) {
      console.error("Error fetching team members:", error);
      res.status(500).json({ message: "Failed to fetch team members" });
    }
  });

  app.get("/api/user/teams", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const teams = await storage.getUserTeams(userId);
      
      // Prevent browser caching to ensure fresh data
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      
      res.json(teams);
    } catch (error) {
      console.error("Error fetching user teams:", error);
      res.status(500).json({ message: "Failed to fetch teams" });
    }
  });

  app.patch("/api/teams/:id/captain", isAuthenticated, loadUserPermissions, requireLeagueManagement, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const teamId = req.params.id;
      const { captainId } = req.body;

      // Get team and user info
      const team = await storage.getTeam(teamId);
      const user = await storage.getUser(userId);

      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Check authorization
      // For league teams: only commissioner can set captain
      // For standalone teams: only team creator can set captain
      if (team.leagueId) {
        const league = await storage.getLeague(team.leagueId);
        const isCommissioner = league && league.commissionerId === userId;
        if (!isCommissioner) {
          return res.status(403).json({ message: "Only league commissioners can assign team captains" });
        }
      } else {
        // Standalone team - only creator can set captain
        if (team.creatorId !== userId) {
          return res.status(403).json({ message: "Only team creator can assign team captain" });
        }
      }

      // Validate captainId if provided
      if (captainId) {
        const captainUser = await storage.getUser(captainId);
        if (!captainUser) {
          return res.status(400).json({ message: "Captain user not found" });
        }

        // Verify the captain user is a member of this team (either through team membership or league assignment)
        const teamMembers = await storage.getTeamMembers(teamId);
        const hasDirectMembership = teamMembers.some(member => member.userId === captainId);
        
        let hasLeagueAssignment = false;
        if (team.leagueId) {
          const leagueMembership = await storage.getUserLeagueMembership(captainId, team.leagueId);
          hasLeagueAssignment = leagueMembership !== undefined && leagueMembership.assignedTeamId === teamId;
        }

        if (!hasDirectMembership && !hasLeagueAssignment) {
          return res.status(400).json({ message: "User must be a member of this team to be assigned as captain" });
        }
      }

      // Update team captain
      const updatedTeam = await storage.setTeamCaptain(teamId, captainId || null);
      res.json(updatedTeam);
    } catch (error) {
      console.error("Error setting team captain:", error);
      res.status(500).json({ message: "Failed to set team captain" });
    }
  });

  // Add a captain to a team (multi-captain support)
  app.post("/api/teams/:id/captains", isAuthenticated, loadUserPermissions, async (req: any, res) => {
    try {
      const teamId = req.params.id;
      const userId = req.user.claims.sub;
      const { captainUserId } = req.body;

      if (!captainUserId) {
        return res.status(400).json({ message: "Captain user ID is required" });
      }

      const team = await storage.getTeam(teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Check authorization - commissioner or existing captain
      let isAuthorized = false;
      if (team.leagueId) {
        const league = await storage.getLeague(team.leagueId);
        isAuthorized = league?.commissionerId === userId;
      }
      if (!isAuthorized) {
        isAuthorized = await storage.isTeamCaptain(teamId, userId);
      }
      if (!isAuthorized && team.creatorId === userId) {
        isAuthorized = true;
      }

      if (!isAuthorized) {
        return res.status(403).json({ message: "Only commissioners or existing captains can add new captains" });
      }

      // Verify user is a team member
      const teamMembers = await storage.getTeamMembers(teamId);
      const hasDirectMembership = teamMembers.some(member => member.userId === captainUserId);
      
      let hasLeagueAssignment = false;
      if (team.leagueId) {
        const leagueMembership = await storage.getUserLeagueMembership(captainUserId, team.leagueId);
        hasLeagueAssignment = leagueMembership !== undefined && leagueMembership.assignedTeamId === teamId;
      }

      if (!hasDirectMembership && !hasLeagueAssignment) {
        return res.status(400).json({ message: "User must be a member of this team to be assigned as captain" });
      }

      const success = await storage.addTeamCaptain(teamId, captainUserId);
      
      if (!success) {
        return res.status(500).json({ message: "Failed to add captain - database error" });
      }
      
      // Return updated list of captains
      const captains = await storage.getTeamCaptains(teamId);
      res.json({ message: "Captain added successfully", captains });
    } catch (error) {
      console.error("Error adding team captain:", error);
      res.status(500).json({ message: "Failed to add team captain" });
    }
  });

  // Remove a captain from a team (multi-captain support)
  app.delete("/api/teams/:id/captains/:captainUserId", isAuthenticated, loadUserPermissions, async (req: any, res) => {
    try {
      const { id: teamId, captainUserId } = req.params;
      const userId = req.user.claims.sub;

      const team = await storage.getTeam(teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Check authorization - commissioner or the captain themselves
      let isAuthorized = false;
      if (team.leagueId) {
        const league = await storage.getLeague(team.leagueId);
        isAuthorized = league?.commissionerId === userId;
      }
      if (!isAuthorized && userId === captainUserId) {
        // Captains can remove themselves
        isAuthorized = true;
      }
      if (!isAuthorized && team.creatorId === userId) {
        isAuthorized = true;
      }

      if (!isAuthorized) {
        return res.status(403).json({ message: "Only commissioners can remove captains" });
      }

      await storage.removeTeamCaptain(teamId, captainUserId);
      
      // Return updated list of captains
      const captains = await storage.getTeamCaptains(teamId);
      res.json({ message: "Captain removed successfully", captains });
    } catch (error) {
      console.error("Error removing team captain:", error);
      res.status(500).json({ message: "Failed to remove team captain" });
    }
  });

  // Get all captains for a team
  app.get("/api/teams/:id/captains", isAuthenticated, async (req: any, res) => {
    try {
      const teamId = req.params.id;
      const captains = await storage.getTeamCaptains(teamId);
      res.json({ captains });
    } catch (error) {
      console.error("Error fetching team captains:", error);
      res.status(500).json({ message: "Failed to fetch team captains" });
    }
  });

  // Game routes
  app.get("/api/user/games/upcoming", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const games = await storage.getUpcomingGames(userId);
      
      // Get game IDs where user is an approved substitute
      const substituteGameIds = await storage.getUserSubstituteGameIds(userId);
      
      // Get approved scrimmages for the user
      const scrimmageRequests = await storage.getScrimmageRequestsByPlayer(userId);
      const approvedScrimmageRequests = scrimmageRequests.filter(req => req.status === 'approved');
      
      
      // Create a set of existing game IDs for deduplication
      const existingGameIds = new Set(games.map(g => g.id));
      
      // Use centralized visibility helper
      const { shouldShowEventBasedOnLeagueNoon } = await import('./dateUtils');
      
      // Fetch and add substitute games that aren't already in the list
      // Games drop off by noon the following day according to league timezone
      const leagueCache = new Map<string, any>();
      
      const substituteGames: typeof games = [];
      for (const gameId of substituteGameIds) {
        const alreadyInRoster = existingGameIds.has(gameId);
        
        if (!alreadyInRoster) {
          const game = await storage.getGameById(gameId);
          
          if (game) {
            // Get league timezone (cache for performance)
            let league = leagueCache.get(game.leagueId);
            if (league === undefined && !leagueCache.has(game.leagueId)) {
              league = await storage.getLeague(game.leagueId);
              leagueCache.set(game.leagueId, league);
            }
            
            const leagueTimezone = league?.timezone || 'America/New_York';
            
            if (shouldShowEventBasedOnLeagueNoon(game.scheduledAt, leagueTimezone)) {
              substituteGames.push(game);
            }
          }
        }
      }
      
      // Combine roster games and substitute games
      const allGames = [...games, ...substituteGames];
      
      // Format regular games
      const formattedGames = allGames.map(game => {
        const formatted = formatGameForResponse(game);
        const isSubstitute = substituteGameIds.includes(game.id);
        return {
          ...formatted,
          isSubstitute,
          isScrimmage: game.isScrimmage || false
        };
      });
      
      // Add approved scrimmages as schedule items (filter by league timezone)
      const formattedScrimmages = [];
      for (const req of approvedScrimmageRequests) {
        // Get league timezone (use cache)
        let league = leagueCache.get(req.scrimmage.leagueId);
        if (league === undefined && !leagueCache.has(req.scrimmage.leagueId)) {
          league = await storage.getLeague(req.scrimmage.leagueId);
          leagueCache.set(req.scrimmage.leagueId, league);
        }
        
        const leagueTimezone = league?.timezone || 'America/New_York';
        
        if (shouldShowEventBasedOnLeagueNoon(req.scrimmage.dateTime, leagueTimezone)) {
          formattedScrimmages.push({
            id: req.scrimmage.id,
            scheduledAt: req.scrimmage.dateTime,
            location: req.scrimmage.location,
            isScrimmage: true,
            scrimmageTitle: req.scrimmage.title,
            scrimmageCreator: req.scrimmage.creator,
            isSubstitute: false,
            homeTeam: null,
            awayTeam: null,
            homeScore: null,
            awayScore: null,
            status: req.scrimmage.status,
          });
        }
      }
      
      // Combine games and scrimmages
      const allItems = [...formattedGames, ...formattedScrimmages];
      
      // Sort by date
      allItems.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
      
      // Disable caching to force fresh response
      res.setHeader('Cache-Control', 'no-store');
      res.json(allItems);
    } catch (error) {
      console.error("Error fetching upcoming games:", error);
      res.status(500).json({ message: "Failed to fetch upcoming games" });
    }
  });

  // Get all games for user (past and future) with scores
  app.get("/api/user/games/all", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const games = await storage.getAllUserGames(userId);
      const formattedGames = games.map(formatGameForResponse);
      res.json(formattedGames);
    } catch (error) {
      console.error("Error fetching all user games:", error);
      res.status(500).json({ message: "Failed to fetch all user games" });
    }
  });

  // Consolidated calendar endpoint - fetches all calendar data in one request
  app.get("/api/user/calendar", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Fetch all data in parallel for maximum performance
      const [
        userTeams,
        allGames,
        createdScrimmages,
        scrimmageRequests,
        substituteRequests,
        personalReminders
      ] = await Promise.all([
        storage.getUserTeams(userId),
        storage.getAllUserGames(userId),
        storage.getUserScrimmages(userId),
        storage.getScrimmageRequestsByPlayer(userId),
        storage.getSubstituteRequests({ status: 'approved', userId }),
        storage.getUserPersonalReminders(userId)
      ]);
      
      // Filter substitute requests to only include those where user is the substitute
      const mySubstitutions = substituteRequests.filter(
        req => req.substitutePlayerId === userId
      );
      
      // Format games with date strings
      const formattedGames = allGames.map(formatGameForResponse);
      
      res.json({
        userTeams,
        allGames: formattedGames,
        createdScrimmages,
        scrimmageRequests,
        mySubstitutions,
        personalReminders
      });
    } catch (error) {
      console.error("Error fetching calendar data:", error);
      res.status(500).json({ message: "Failed to fetch calendar data" });
    }
  });

  // Get team record (wins, losses, ties) based on game scores
  app.get("/api/teams/:teamId/record", isAuthenticated, async (req: any, res) => {
    try {
      const { teamId } = req.params;
      const record = await storage.getTeamRecord(teamId);
      res.json(record);
    } catch (error) {
      console.error("Error fetching team record:", error);
      res.status(500).json({ message: "Failed to fetch team record" });
    }
  });

  // Line combinations routes
  app.get("/api/teams/:teamId/line-combinations", isAuthenticated, async (req: any, res) => {
    try {
      const { teamId } = req.params;
      const { gameId } = req.query;
      
      // Check if user has access to this team's line combinations (team member or captain)
      const userId = req.user.claims.sub;
      const teamMembers = await storage.getTeamMembers(teamId);
      const isTeamMember = teamMembers.some(member => member.user.id === userId);
      const team = await storage.getTeam(teamId);
      const isTeamCaptain = team?.captainId === userId;
      
      if (!isTeamMember && !isTeamCaptain) {
        return res.status(403).json({ message: "Access denied. You must be a team member or captain." });
      }
      
      const lineCombinations = await storage.getTeamLineCombinations(teamId, gameId as string);
      res.json(lineCombinations);
    } catch (error) {
      console.error("Error fetching line combinations:", error);
      res.status(500).json({ message: "Failed to fetch line combinations" });
    }
  });

  app.post("/api/teams/:teamId/line-combinations", isAuthenticated, async (req: any, res) => {
    try {
      const { teamId } = req.params;
      const userId = req.user.claims.sub;
      
      // Check if user is team captain
      const team = await storage.getTeam(teamId);
      if (!team || team.captainId !== userId) {
        return res.status(403).json({ message: "Only team captains can create line combinations" });
      }
      
      const lineCombinationData = createLineCombinationRequestSchema.parse(req.body);
      
      // Validate gameId belongs to this team if provided
      if (lineCombinationData.gameId) {
        const game = await storage.getGameById(lineCombinationData.gameId);
        if (!game || (game.homeTeamId !== teamId && game.awayTeamId !== teamId)) {
          return res.status(400).json({ message: "Game does not involve this team" });
        }
      }
      
      const lineCombination = await storage.createLineCombination({
        ...lineCombinationData,
        teamId,
      });
      res.json(lineCombination);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error creating line combination:", error);
      res.status(500).json({ message: "Failed to create line combination" });
    }
  });

  app.get("/api/line-combinations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const lineCombination = await storage.getLineCombination(id);
      if (!lineCombination) {
        return res.status(404).json({ message: "Line combination not found" });
      }
      
      // Check if user has access to this line combination (team member or captain)
      const teamMembers = await storage.getTeamMembers(lineCombination.teamId);
      const isTeamMember = teamMembers.some(member => member.user.id === userId);
      const team = await storage.getTeam(lineCombination.teamId);
      const isTeamCaptain = team?.captainId === userId;
      
      if (!isTeamMember && !isTeamCaptain) {
        return res.status(403).json({ message: "Access denied. You must be a team member or captain." });
      }
      
      res.json(lineCombination);
    } catch (error) {
      console.error("Error fetching line combination:", error);
      res.status(500).json({ message: "Failed to fetch line combination" });
    }
  });

  app.patch("/api/line-combinations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const lineCombination = await storage.getLineCombination(id);
      if (!lineCombination) {
        return res.status(404).json({ message: "Line combination not found" });
      }
      
      // Check if user is team captain
      const team = await storage.getTeam(lineCombination.teamId);
      if (!team || team.captainId !== userId) {
        return res.status(403).json({ message: "Only team captains can update line combinations" });
      }
      
      const updates = updateLineCombinationRequestSchema.parse(req.body);
      
      // Validate gameId belongs to this team if provided
      if (updates.gameId) {
        const game = await storage.getGameById(updates.gameId);
        if (!game || (game.homeTeamId !== lineCombination.teamId && game.awayTeamId !== lineCombination.teamId)) {
          return res.status(400).json({ message: "Game does not involve this team" });
        }
      }
      
      const updatedLineCombination = await storage.updateLineCombination(id, updates);
      res.json(updatedLineCombination);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error updating line combination:", error);
      res.status(500).json({ message: "Failed to update line combination" });
    }
  });

  app.delete("/api/line-combinations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const lineCombination = await storage.getLineCombination(id);
      if (!lineCombination) {
        return res.status(404).json({ message: "Line combination not found" });
      }
      
      // Check if user is team captain
      const team = await storage.getTeam(lineCombination.teamId);
      if (!team || team.captainId !== userId) {
        return res.status(403).json({ message: "Only team captains can delete line combinations" });
      }
      
      await storage.deleteLineCombination(id);
      res.json({ message: "Line combination deleted successfully" });
    } catch (error) {
      console.error("Error deleting line combination:", error);
      res.status(500).json({ message: "Failed to delete line combination" });
    }
  });

  // Line combination assignment routes
  app.post("/api/line-combinations/:lineId/assignments", isAuthenticated, async (req: any, res) => {
    try {
      const { lineId } = req.params;
      const userId = req.user.claims.sub;
      
      const lineCombination = await storage.getLineCombination(lineId);
      if (!lineCombination) {
        return res.status(404).json({ message: "Line combination not found" });
      }
      
      // Check if user is team captain
      const team = await storage.getTeam(lineCombination.teamId);
      if (!team || team.captainId !== userId) {
        return res.status(403).json({ message: "Only team captains can assign players to line combinations" });
      }
      
      const assignmentData = createLineCombinationAssignmentRequestSchema.parse(req.body);
      
      // Validate that the player is a member of this team
      const teamMembers = await storage.getTeamMembers(lineCombination.teamId);
      const isPlayerTeamMember = teamMembers.some(member => member.user.id === assignmentData.playerId);
      if (!isPlayerTeamMember) {
        return res.status(400).json({ message: "Player must be a member of this team" });
      }
      
      const assignment = await storage.createLineCombinationAssignment({
        ...assignmentData,
        lineCombinationId: lineId,
      });
      res.json(assignment);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error creating line assignment:", error);
      res.status(500).json({ message: "Failed to create line assignment" });
    }
  });

  app.patch("/api/line-assignments/:assignmentId", isAuthenticated, async (req: any, res) => {
    try {
      const { assignmentId } = req.params;
      const { playerId } = req.body;
      const userId = req.user.claims.sub;
      
      // Get the assignment to find the line combination
      const assignments = await storage.getLineCombinationAssignments("");
      const assignment = assignments.find(a => a.id === assignmentId);
      if (!assignment) {
        return res.status(404).json({ message: "Line assignment not found" });
      }
      
      const lineCombination = await storage.getLineCombination(assignment.lineCombinationId);
      if (!lineCombination) {
        return res.status(404).json({ message: "Line combination not found" });
      }
      
      // Check if user is team captain
      const team = await storage.getTeam(lineCombination.teamId);
      if (!team || team.captainId !== userId) {
        return res.status(403).json({ message: "Only team captains can update line assignments" });
      }
      
      const updatedAssignment = await storage.updateLineCombinationAssignment(assignmentId, playerId);
      res.json(updatedAssignment);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error updating line assignment:", error);
      res.status(500).json({ message: "Failed to update line assignment" });
    }
  });

  // Update assignment position (for drag & drop)
  app.patch("/api/line-assignments/:assignmentId/position", isAuthenticated, async (req: any, res) => {
    try {
      const { assignmentId } = req.params;
      const { position } = req.body;
      const userId = req.user.claims.sub;
      
      if (!position) {
        return res.status(400).json({ message: "Position is required" });
      }
      
      // Get the assignment to find the line combination
      const assignments = await storage.getLineCombinationAssignments("");
      const assignment = assignments.find(a => a.id === assignmentId);
      if (!assignment) {
        return res.status(404).json({ message: "Line assignment not found" });
      }
      
      const lineCombination = await storage.getLineCombination(assignment.lineCombinationId);
      if (!lineCombination) {
        return res.status(404).json({ message: "Line combination not found" });
      }
      
      // Check if user is team captain
      const team = await storage.getTeam(lineCombination.teamId);
      if (!team || team.captainId !== userId) {
        return res.status(403).json({ message: "Only team captains can update line assignments" });
      }
      
      const updatedAssignment = await storage.updateLineCombinationAssignmentPosition(assignmentId, position);
      res.json(updatedAssignment);
    } catch (error) {
      console.error("Error updating line assignment position:", error);
      res.status(500).json({ message: "Failed to update line assignment position" });
    }
  });

  // Bulk update assignments (for efficient drag & drop reordering)
  app.patch("/api/line-combinations/:lineId/assignments/bulk", isAuthenticated, async (req: any, res) => {
    try {
      const { lineId } = req.params;
      const { updates } = req.body;
      const userId = req.user.claims.sub;
      
      if (!Array.isArray(updates)) {
        return res.status(400).json({ message: "Updates must be an array" });
      }
      
      const lineCombination = await storage.getLineCombination(lineId);
      if (!lineCombination) {
        return res.status(404).json({ message: "Line combination not found" });
      }
      
      // Check if user is team captain
      const team = await storage.getTeam(lineCombination.teamId);
      if (!team || team.captainId !== userId) {
        return res.status(403).json({ message: "Only team captains can update line assignments" });
      }
      
      // Validate all player IDs if provided
      if (updates.some((u: any) => u.playerId)) {
        const teamMembers = await storage.getTeamMembers(lineCombination.teamId);
        const teamMemberIds = new Set(teamMembers.map(member => member.user.id));
        
        for (const update of updates) {
          if (update.playerId && !teamMemberIds.has(update.playerId)) {
            return res.status(400).json({ message: `Player ${update.playerId} is not a member of this team` });
          }
        }
      }
      
      const updatedAssignments = await storage.bulkUpdateLineCombinationAssignments(updates);
      res.json(updatedAssignments);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("Error bulk updating line assignments:", error);
      res.status(500).json({ message: "Failed to bulk update line assignments" });
    }
  });

  app.delete("/api/line-assignments/:assignmentId", isAuthenticated, async (req: any, res) => {
    try {
      const { assignmentId } = req.params;
      const userId = req.user.claims.sub;
      
      // Get the assignment to find the line combination  
      const assignment = await storage.getLineCombinationAssignment(assignmentId);
      if (!assignment) {
        return res.status(404).json({ message: "Line assignment not found" });
      }
      
      const lineCombination = await storage.getLineCombination(assignment.lineCombinationId);
      if (!lineCombination) {
        return res.status(404).json({ message: "Line combination not found" });
      }
      
      // Check if user is team captain
      const team = await storage.getTeam(lineCombination.teamId);
      if (!team || team.captainId !== userId) {
        return res.status(403).json({ message: "Only team captains can delete line assignments" });
      }
      
      await storage.deleteLineCombinationAssignment(assignmentId);
      res.json({ message: "Line assignment deleted successfully" });
    } catch (error) {
      console.error("Error deleting line assignment:", error);
      res.status(500).json({ message: "Failed to delete line assignment" });
    }
  });

  app.post("/api/games", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const gameData = insertGameSchema.parse(req.body);
      
      // Convert empty string awayTeamId to null for single-team scrimmages
      if (gameData.awayTeamId === '') {
        gameData.awayTeamId = null;
      }
      
      // Permission check: Only team captains, team creators, or league commissioners can schedule games
      let hasPermission = false;
      
      // Check if user is captain or creator of home team (uses isTeamCaptain which checks both teams.captainId and team_memberships.is_captain)
      const homeTeam = await storage.getTeam(gameData.homeTeamId);
      if (homeTeam?.creatorId === userId || await storage.isTeamCaptain(gameData.homeTeamId, userId)) {
        hasPermission = true;
      }
      
      // Check if user is captain or creator of away team (if present)
      if (!hasPermission && gameData.awayTeamId) {
        const awayTeam = await storage.getTeam(gameData.awayTeamId);
        if (awayTeam?.creatorId === userId || await storage.isTeamCaptain(gameData.awayTeamId, userId)) {
          hasPermission = true;
        }
      }
      
      // Check if user is commissioner of the league (only for league games)
      if (!hasPermission && gameData.leagueId) {
        const league = await storage.getLeague(gameData.leagueId);
        if (league?.commissionerId === userId) {
          hasPermission = true;
        }
      }
      
      if (!hasPermission) {
        return res.status(403).json({ message: "You don't have permission to schedule games. Only team captains, team creators, or league commissioners can schedule games." });
      }
      
      const game = await storage.createGame(gameData);
      const formattedGame = formatGameForResponse(game);
      res.json(formattedGame);
    } catch (error) {
      console.error("Error creating game:", error);
      res.status(500).json({ message: "Failed to create game" });
    }
  });

  app.patch("/api/games/:gameId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const gameId = req.params.gameId;
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Verify that the game exists
      const existingGame = await storage.getGameById(gameId);
      if (!existingGame) {
        return res.status(404).json({ message: "Game not found" });
      }
      
      // Permission check: Only team captains, team creators, or league commissioners can update games
      let hasPermission = false;
      
      // Check if user is captain or creator of home team (uses isTeamCaptain which checks both teams.captainId and team_memberships.is_captain)
      const homeTeam = await storage.getTeam(existingGame.homeTeamId);
      if (homeTeam?.creatorId === userId || await storage.isTeamCaptain(existingGame.homeTeamId, userId)) {
        hasPermission = true;
      }
      
      // Check if user is captain or creator of away team (if present)
      if (!hasPermission && existingGame.awayTeamId) {
        const awayTeam = await storage.getTeam(existingGame.awayTeamId);
        if (awayTeam?.creatorId === userId || await storage.isTeamCaptain(existingGame.awayTeamId, userId)) {
          hasPermission = true;
        }
      }
      
      // Check if user is commissioner of the league (only for league games)
      if (!hasPermission && existingGame.leagueId) {
        const league = await storage.getLeague(existingGame.leagueId);
        if (league?.commissionerId === userId) {
          hasPermission = true;
        }
      }
      
      if (!hasPermission) {
        return res.status(403).json({ message: "You don't have permission to update this game. Only team captains, team creators, or league commissioners can update games." });
      }

      const updates = req.body;
      
      // scheduledAt is kept as string - Drizzle uses { mode: 'string' } for league-local times
      // No conversion needed - string is passed through directly to storage
      
      const updatedGame = await storage.updateGame(gameId, updates);
      const formattedGame = formatGameForResponse(updatedGame);
      res.json(formattedGame);
    } catch (error) {
      console.error("Error updating game:", error);
      res.status(500).json({ message: "Failed to update game" });
    }
  });

  app.delete("/api/games/:gameId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const gameId = req.params.gameId;
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Verify that the game exists
      const game = await storage.getGameById(gameId);
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }

      // Permission check: Only team captains, team creators, or league commissioners can delete games
      let hasPermission = false;
      
      // Check if user is captain or creator of home team (uses isTeamCaptain which checks both teams.captainId and team_memberships.is_captain)
      const homeTeam = await storage.getTeam(game.homeTeamId);
      if (homeTeam?.creatorId === userId || await storage.isTeamCaptain(game.homeTeamId, userId)) {
        hasPermission = true;
      }
      
      // Check if user is captain or creator of away team (if present)
      if (!hasPermission && game.awayTeamId) {
        const awayTeam = await storage.getTeam(game.awayTeamId);
        if (awayTeam?.creatorId === userId || await storage.isTeamCaptain(game.awayTeamId, userId)) {
          hasPermission = true;
        }
      }
      
      // Check if user is commissioner of the league (only for league games)
      if (!hasPermission && game.leagueId) {
        const league = await storage.getLeague(game.leagueId);
        if (league?.commissionerId === userId) {
          hasPermission = true;
        }
      }
      
      if (!hasPermission) {
        return res.status(403).json({ message: "You don't have permission to delete this game. Only team captains, team creators, or league commissioners can delete games." });
      }

      await storage.deleteGame(gameId);
      res.json({ message: "Game deleted successfully" });
    } catch (error) {
      console.error("Error deleting game:", error);
      res.status(500).json({ message: "Failed to delete game" });
    }
  });

  // Game Score Submission Routes
  app.post("/api/games/:gameId/submit-score", isAuthenticated, async (req: any, res) => {
    try {
      const { gameId } = req.params;
      const { homeScore, awayScore, resultType } = req.body;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Get the game to validate it exists and get team info
      const game = await storage.getGameById(gameId);
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }

      // Check if the game is in the future - cannot record scores for games that haven't happened yet
      const gameStartTime = new Date(game.scheduledAt).getTime();
      const now = Date.now();
      
      if (now < gameStartTime) {
        return res.status(400).json({ message: "Cannot record score for a future-dated game. The game must have started before scores can be submitted." });
      }

      // Determine the user's role in this game
      let submitterRole = '';
      
      // Check if user is commissioner or secondary commissioner (only for league games)
      if (game.leagueId) {
        const league = await storage.getLeague(game.leagueId);
        if (league && league.commissionerId === userId) {
          submitterRole = 'commissioner';
        } else {
          // Check if user is a secondary commissioner via league membership
          const leaguePermissions = await storage.getUserLeaguePermissions(userId, game.leagueId);
          if (leaguePermissions && leaguePermissions.leagueRole === 'secondary_commissioner') {
            submitterRole = 'commissioner';
          }
        }
      }
      
      if (!submitterRole) {
        // Check if user is captain of home team
        const homeTeam = await storage.getTeam(game.homeTeamId);
        const homeTeamCaptain = homeTeam && homeTeam.captainId === userId;
        
        if (homeTeamCaptain) {
          submitterRole = 'home_captain';
        } else if (game.awayTeamId) {
          // Check if user is captain of away team (only if awayTeamId exists)
          const awayTeam = await storage.getTeam(game.awayTeamId);
          const awayTeamCaptain = awayTeam && awayTeam.captainId === userId;
          
          if (awayTeamCaptain) {
            submitterRole = 'away_captain';
          }
        }
      }

      // Only captains and commissioners can submit scores
      if (!submitterRole) {
        return res.status(403).json({ 
          message: "Access denied. Only team captains and commissioners can submit scores." 
        });
      }

      // Create the score submission
      const submission = await storage.submitGameScore({
        gameId,
        submittedBy: userId,
        submitterRole,
        homeScore: parseInt(homeScore),
        awayScore: parseInt(awayScore),
        isCommissionerOverride: submitterRole === 'commissioner'
      });

      // If it's a commissioner submission, update the game score immediately
      if (submitterRole === 'commissioner') {
        await storage.updateGameScore(gameId, parseInt(homeScore), parseInt(awayScore), resultType || 'regulation');
        res.json({ 
          submission, 
          gameUpdated: true, 
          message: "Commissioner score submitted and game updated" 
        });
      } else {
        // Check if both captains have submitted matching scores
        const matchResult = await storage.checkForMatchingCaptainScores(gameId);
        
        if (matchResult.isMatch && matchResult.homeScore !== undefined && matchResult.awayScore !== undefined) {
          // Update the game score automatically
          await storage.updateGameScore(gameId, matchResult.homeScore, matchResult.awayScore, resultType || 'regulation');
          res.json({ 
            submission, 
            gameUpdated: true, 
            message: "Captain scores match - game score updated automatically" 
          });
        } else {
          res.json({ 
            submission, 
            gameUpdated: false, 
            message: "Score submitted - waiting for other captain or commissioner" 
          });
        }
      }
    } catch (error) {
      console.error("Error submitting game score:", error);
      res.status(500).json({ message: "Failed to submit score" });
    }
  });

  app.get("/api/games/:gameId/score-submissions", isAuthenticated, async (req: any, res) => {
    try {
      const { gameId } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Get the game to validate access
      const game = await storage.getGameById(gameId);
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }

      // Check if user has permission to view submissions (captain or commissioner)
      let isCommissioner = false;
      if (game.leagueId) {
        const league = await storage.getLeague(game.leagueId);
        isCommissioner = !!(league && league.commissionerId === userId);
      }
      
      // Check if user is captain of either team
      const homeTeam = await storage.getTeam(game.homeTeamId);
      const awayTeam = game.awayTeamId ? await storage.getTeam(game.awayTeamId) : null;
      const isHomeCaptain = homeTeam && homeTeam.captainId === userId;
      const isAwayCaptain = awayTeam && awayTeam.captainId === userId;
      
      const hasAccess = isCommissioner || isHomeCaptain || isAwayCaptain;

      if (!hasAccess) {
        return res.status(403).json({ 
          message: "Access denied. Only team captains and commissioners can view score submissions." 
        });
      }

      const submissions = await storage.getGameScoreSubmissions(gameId);
      res.json(submissions);
    } catch (error) {
      console.error("Error fetching score submissions:", error);
      res.status(500).json({ message: "Failed to fetch score submissions" });
    }
  });

  // Game Stars Routes
  app.post("/api/games/:gameId/submit-stars", isAuthenticated, async (req: any, res) => {
    try {
      const { gameId } = req.params;
      const { firstStarUserId, secondStarUserId, thirdStarUserId } = req.body;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Get the game to validate it exists
      const game = await storage.getGameById(gameId);
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }

      // Check if the game is completed
      if (!game.isCompleted || game.homeScore === null || game.awayScore === null) {
        return res.status(400).json({ message: "Stars can only be awarded after game is completed with a final score" });
      }

      // Check if stars have already been awarded
      const existingStars = await storage.getGameStars(gameId);
      if (existingStars) {
        return res.status(400).json({ message: "Stars have already been awarded for this game" });
      }

      // Determine the winning team
      let winningTeamId: string | null = null;
      if (game.homeScore > game.awayScore) {
        winningTeamId = game.homeTeamId;
      } else if (game.awayScore > game.homeScore) {
        winningTeamId = game.awayTeamId;
      } else {
        return res.status(400).json({ message: "Stars cannot be awarded for tied games" });
      }

      // Check if user is captain of the winning team
      const winningTeam = await storage.getTeam(winningTeamId);
      if (!winningTeam || winningTeam.captainId !== userId) {
        return res.status(403).json({ 
          message: "Only the winning team captain can award the stars" 
        });
      }

      // Validate star selections
      if (!firstStarUserId || !secondStarUserId || !thirdStarUserId) {
        return res.status(400).json({ message: "All three stars must be selected" });
      }

      // Check for duplicate star selections
      if (firstStarUserId === secondStarUserId || 
          firstStarUserId === thirdStarUserId || 
          secondStarUserId === thirdStarUserId) {
        return res.status(400).json({ message: "Each star must be a different player" });
      }

      // Validate that the selected players participated in the game
      const homeTeamMembers = await storage.getTeamMembers(game.homeTeamId);
      const awayTeamMembers = game.awayTeamId ? await storage.getTeamMembers(game.awayTeamId) : [];
      const allParticipants = [...homeTeamMembers, ...awayTeamMembers];
      const participantUserIds = new Set(allParticipants.map(m => m.userId));

      const invalidStars = [];
      if (!participantUserIds.has(firstStarUserId)) invalidStars.push('first star');
      if (!participantUserIds.has(secondStarUserId)) invalidStars.push('second star');
      if (!participantUserIds.has(thirdStarUserId)) invalidStars.push('third star');

      if (invalidStars.length > 0) {
        return res.status(400).json({ 
          message: `The selected ${invalidStars.join(', ')} must be a player who participated in this game` 
        });
      }

      // Submit the stars
      const stars = await storage.submitGameStars({
        gameId,
        firstStarUserId,
        secondStarUserId,
        thirdStarUserId,
        awardedBy: userId,
      });

      res.json({ 
        stars,
        message: "Stars awarded successfully" 
      });
    } catch (error) {
      console.error("Error submitting game stars:", error);
      res.status(500).json({ message: "Failed to submit stars" });
    }
  });

  app.get("/api/games/:gameId/stars", async (req: any, res) => {
    try {
      const { gameId } = req.params;

      // Get the game to validate it exists
      const game = await storage.getGameById(gameId);
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }

      const stars = await storage.getGameStars(gameId);
      
      if (!stars) {
        return res.json(null);
      }

      res.json(stars);
    } catch (error) {
      console.error("Error fetching game stars:", error);
      res.status(500).json({ message: "Failed to fetch stars" });
    }
  });

  app.get("/api/leagues/:leagueId/star-leaderboard", async (req: any, res) => {
    try {
      const { leagueId } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

      // Verify league exists
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const leaderboard = await storage.getLeagueStarLeaderboard(leagueId, limit);
      res.json(leaderboard);
    } catch (error) {
      console.error("Error fetching star leaderboard:", error);
      res.status(500).json({ message: "Failed to fetch leaderboard" });
    }
  });

  // Get games needing star awards for a user (winning captain, not yet awarded)
  app.get("/api/user/games-needing-stars", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { leagueId } = req.query;

      // Get all games where user is a team captain
      const allGames = await storage.getAllUserGames(userId);
      
      // Filter down to completed games with scores, not tied, and optionally by league
      const completedGamesWithScores = allGames.filter((game: any) => {
        if (game.isScrimmage) return false;
        if (!game.isCompleted || game.homeScore === null || game.awayScore === null) return false;
        if (game.homeScore === game.awayScore) return false;
        if (leagueId && game.leagueId !== leagueId) return false;
        return true;
      });
      
      if (completedGamesWithScores.length === 0) {
        return res.json([]);
      }
      
      // Collect all unique winning team IDs and game IDs
      const winningTeamIds = new Set<string>();
      const gameIds: string[] = [];
      for (const game of completedGamesWithScores) {
        const winningTeamId = game.homeScore > game.awayScore ? game.homeTeamId : game.awayTeamId;
        winningTeamIds.add(winningTeamId);
        gameIds.push(game.id);
      }
      
      // Batch fetch all teams (optimization)
      const allTeams = winningTeamIds.size > 0 
        ? await db.select().from(teams).where(inArray(teams.id, Array.from(winningTeamIds)))
        : [];
      const teamMap = new Map<string, typeof allTeams[0]>();
      for (const team of allTeams) {
        teamMap.set(team.id, team);
      }
      
      // Batch fetch all game stars (optimization)
      const allStars = gameIds.length > 0 
        ? await db.select().from(gameStars).where(inArray(gameStars.gameId, gameIds))
        : [];
      const gamesWithStars = new Set<string>();
      for (const star of allStars) {
        gamesWithStars.add(star.gameId);
      }
      
      const gamesNeedingStars = [];
      
      for (const game of completedGamesWithScores) {
        const winningTeamId = game.homeScore > game.awayScore ? game.homeTeamId : game.awayTeamId;
        
        // Check if user is captain of winning team (using cached team data)
        const winningTeam = teamMap.get(winningTeamId);
        if (!winningTeam || winningTeam.captainId !== userId) {
          continue;
        }
        
        // Check if stars have already been awarded (using cached data)
        if (gamesWithStars.has(game.id)) {
          continue;
        }
        
        gamesNeedingStars.push(game);
      }

      res.json(gamesNeedingStars);
    } catch (error) {
      console.error("Error fetching games needing stars:", error);
      res.status(500).json({ message: "Failed to fetch games needing stars" });
    }
  });

  // Delete team
  app.delete("/api/teams/:teamId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const teamId = req.params.teamId;
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Verify that the team exists
      const team = await storage.getTeam(teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Check if user is the team captain or commissioner
      const isTeamCaptain = team.captainId === userId;
      const isCommissioner = user && (user.role === 'commissioner' || user.role === 'secondary_commissioner' || user.specialPermissions?.includes('admin'));
      
      if (!isTeamCaptain && !isCommissioner) {
        return res.status(403).json({ message: "Only team captains and commissioners can delete the team" });
      }

      await storage.deleteTeam(teamId);
      res.json({ message: "Team deleted successfully" });
    } catch (error) {
      console.error("Error deleting team:", error);
      res.status(500).json({ message: "Failed to delete team" });
    }
  });

  // Leave team
  app.post('/api/teams/:teamId/leave', isAuthenticated, async (req: any, res) => {
    try {
      const { teamId } = req.params;
      const userId = req.user.claims.sub;

      // Verify team exists
      const team = await storage.getTeam(teamId);
      if (!team) {
        return res.status(404).json({ message: 'Team not found' });
      }

      // Check if user is the team captain - prevent them from leaving their own team
      if (team.captainId === userId) {
        return res.status(403).json({ message: 'Team captains cannot leave their team. Please transfer captain role first.' });
      }

      // Leave the team (this will clean up memberships, RSVPs, and beverage duty)
      await storage.leaveTeam(userId, teamId);

      res.json({ success: true, message: 'Successfully left the team' });
    } catch (error: any) {
      console.error('Error leaving team:', error);
      if (error.message === 'TEAM_NOT_FOUND') {
        return res.status(404).json({ message: 'Team not found' });
      }
      if (error.message === 'TEAM_MEMBERSHIP_NOT_FOUND') {
        return res.status(404).json({ message: 'You are not a member of this team' });
      }
      res.status(500).json({ message: 'Failed to leave team' });
    }
  });

  // Remove player from team (captain/commissioner action)
  app.delete('/api/teams/:teamId/members/:memberId', isAuthenticated, async (req: any, res) => {
    try {
      const { teamId, memberId } = req.params;
      const userId = req.user.claims.sub;

      // Verify team exists
      const team = await storage.getTeam(teamId);
      if (!team) {
        return res.status(404).json({ message: 'Team not found' });
      }

      // Check if user is the team captain, creator, or commissioner
      const user = await storage.getUser(userId);
      const isTeamCaptainOrCreator = team.captainId === userId || team.creatorId === userId;
      const isCommissioner = user && (user.role === 'commissioner' || user.role === 'secondary_commissioner' || user.specialPermissions?.includes('admin'));

      if (!isTeamCaptainOrCreator && !isCommissioner) {
        return res.status(403).json({ message: 'Only team captain, creator, or commissioners can remove players' });
      }

      // Prevent removing the captain
      if (team.captainId === memberId) {
        return res.status(403).json({ message: 'Cannot remove the team captain. Please transfer captain role first.' });
      }

      // Remove the player from the team
      await storage.leaveTeam(memberId, teamId);

      res.json({ success: true, message: 'Player removed successfully' });
    } catch (error: any) {
      console.error('Error removing player from team:', error);
      if (error.message === 'TEAM_NOT_FOUND') {
        return res.status(404).json({ message: 'Team not found' });
      }
      if (error.message === 'TEAM_MEMBERSHIP_NOT_FOUND') {
        return res.status(404).json({ message: 'Player is not a member of this team' });
      }
      res.status(500).json({ message: 'Failed to remove player from team' });
    }
  });

  // Standalone team routes
  app.post('/api/teams/standalone', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamName, photoUrl, facilityId } = req.body;

      if (!teamName || typeof teamName !== 'string' || teamName.trim().length === 0) {
        return res.status(400).json({ message: 'Team name is required' });
      }

      const team = await storage.createStandaloneTeam(
        teamName.trim(), 
        userId, 
        photoUrl || null, 
        facilityId || null
      );
      res.json(team);
    } catch (error) {
      console.error('Error creating standalone team:', error);
      res.status(500).json({ message: 'Failed to create standalone team' });
    }
  });

  app.get('/api/teams/search', async (req, res) => {
    try {
      const { search } = req.query;
      const teams = await storage.searchTeams(search as string);
      
      // Map to ensure uniqueTeamId is in camelCase
      const mappedTeams = teams.map(team => ({
        ...team,
        uniqueTeamId: team.uniqueTeamId || (team as any).unique_team_id
      }));
      
      res.json(mappedTeams);
    } catch (error) {
      console.error('Error searching teams:', error);
      res.status(500).json({ message: 'Failed to search teams' });
    }
  });

  app.get('/api/teams/by-code/:uniqueTeamId', async (req, res) => {
    try {
      const { uniqueTeamId } = req.params;
      const team = await storage.getTeamByUniqueId(uniqueTeamId.toUpperCase());
      
      if (!team) {
        return res.status(404).json({ message: 'Team not found' });
      }
      
      res.json(team);
    } catch (error) {
      console.error('Error fetching team by unique ID:', error);
      res.status(500).json({ message: 'Failed to fetch team' });
    }
  });

  app.post('/api/teams/:teamId/players/import', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;
      const { csvData } = req.body;

      // Verify team exists and user is the creator/captain/commissioner
      const team = await storage.getTeam(teamId);
      if (!team) {
        return res.status(404).json({ message: 'Team not found' });
      }

      const user = await storage.getUser(userId);
      const isTeamCaptainOrCreator = team.captainId === userId || team.creatorId === userId;
      const isCommissioner = user && (user.role === 'commissioner' || user.role === 'secondary_commissioner' || user.specialPermissions?.includes('admin'));

      if (!isTeamCaptainOrCreator && !isCommissioner) {
        return res.status(403).json({ message: 'Only team captain, creator, or commissioners can import players' });
      }

      if (!Array.isArray(csvData) || csvData.length === 0) {
        return res.status(400).json({ message: 'CSV data is required' });
      }

      const result = await storage.importTeamPlayers(teamId, csvData);
      res.json(result);
    } catch (error) {
      console.error('Error importing team players:', error);
      res.status(500).json({ message: 'Failed to import players' });
    }
  });

  app.post('/api/teams/:teamId/players/manual', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;
      const { firstName, lastName, email, jerseyNumber, position } = req.body;

      // Verify team exists and user is the creator/captain/commissioner
      const team = await storage.getTeam(teamId);
      if (!team) {
        return res.status(404).json({ message: 'Team not found' });
      }

      const user = await storage.getUser(userId);
      const isTeamCaptainOrCreator = team.captainId === userId || team.creatorId === userId;
      const isCommissioner = user && (user.role === 'commissioner' || user.role === 'secondary_commissioner' || user.specialPermissions?.includes('admin'));

      if (!isTeamCaptainOrCreator && !isCommissioner) {
        return res.status(403).json({ message: 'Only team captain, creator, or commissioners can add players' });
      }

      if (!firstName || !lastName) {
        return res.status(400).json({ message: 'First name and last name are required' });
      }

      const membership = await storage.addManualPlayer(
        teamId, 
        firstName, 
        lastName, 
        email, 
        jerseyNumber, 
        position
      );
      res.json(membership);
    } catch (error) {
      console.error('Error adding manual player:', error);
      res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to add player' });
    }
  });

  app.post('/api/teams/:teamId/join-league', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;
      const { leagueId, message } = req.body;

      // Validate message length if provided
      if (message && typeof message === 'string' && message.length > 500) {
        return res.status(400).json({ message: 'Message cannot exceed 500 characters' });
      }

      // Verify team exists and user is the creator
      const team = await storage.getTeam(teamId);
      if (!team) {
        return res.status(404).json({ message: 'Team not found' });
      }

      if (team.creatorId !== userId) {
        return res.status(403).json({ message: 'Only team creator can request to join a league' });
      }

      // Check if team already has a league
      if (team.leagueId) {
        return res.status(400).json({ message: 'Team is already part of a league' });
      }

      // Verify league exists
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      const request = await storage.requestTeamJoinLeague(teamId, leagueId, userId, message);
      
      // Send push notification to league commissioner (fire and forget)
      if (league.commissionerId) {
        import('./oneSignalNotifications').then(({ sendJoinRequestPushNotification }) => {
          sendJoinRequestPushNotification(
            league.commissionerId,
            team.name || 'A team',
            'team',
            league.name,
            request.id
          ).catch(err => console.error('[Notifications] Failed to send team join request notification:', err));
        }).catch(console.error);
      }
      
      res.json(request);
    } catch (error) {
      console.error('Error requesting team join league:', error);
      res.status(500).json({ message: 'Failed to request team join league' });
    }
  });

  app.get('/api/teams/:teamId/league-requests', isAuthenticated, async (req: any, res) => {
    try {
      const { teamId } = req.params;
      const requests = await storage.getTeamLeagueRequests({ teamId });
      res.json(requests);
    } catch (error) {
      console.error('Error fetching team league requests:', error);
      res.status(500).json({ message: 'Failed to fetch team league requests' });
    }
  });

  app.get('/api/leagues/:leagueId/team-requests', isAuthenticated, async (req: any, res) => {
    try {
      const { leagueId } = req.params;
      const { status } = req.query;
      
      const requests = await storage.getTeamLeagueRequests({ 
        leagueId, 
        status: status as string 
      });
      
      res.json(requests);
    } catch (error) {
      console.error('Error fetching league team requests:', error);
      res.status(500).json({ message: 'Failed to fetch league team requests' });
    }
  });

  // Alias route for frontend compatibility
  app.get('/api/leagues/:leagueId/team-join-requests', isAuthenticated, async (req: any, res) => {
    try {
      const { leagueId } = req.params;
      const userId = req.user.claims.sub;
      
      // Verify user is a commissioner of the league
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      const user = await storage.getUser(userId);
      const isCommissioner = user && (
        user.role === 'commissioner' || 
        user.role === 'secondary_commissioner' || 
        user.specialPermissions?.includes('admin')
      );

      if (!isCommissioner && league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Only league commissioners can view team requests' });
      }

      // Get pending team join requests
      const requests = await storage.getTeamLeagueRequests({ 
        leagueId, 
        status: 'pending'
      });
      
      res.json(requests);
    } catch (error) {
      console.error('Error fetching league team join requests:', error);
      res.status(500).json({ message: 'Failed to fetch league team join requests' });
    }
  });

  app.post('/api/team-league-requests/:requestId/approve', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { requestId } = req.params;

      // Get the request to verify the league
      const [request] = await storage.getTeamLeagueRequests({ });
      const targetRequest = request ? await storage.getTeamLeagueRequests({}) : null;
      
      if (!targetRequest || targetRequest.length === 0) {
        return res.status(404).json({ message: 'Request not found' });
      }

      const theRequest = targetRequest.find((r: any) => r.id === requestId);
      if (!theRequest) {
        return res.status(404).json({ message: 'Request not found' });
      }

      // Verify user is a commissioner of the league
      const league = await storage.getLeague(theRequest.leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      const user = await storage.getUser(userId);
      const isCommissioner = user && (
        user.role === 'commissioner' || 
        user.role === 'secondary_commissioner' || 
        user.specialPermissions?.includes('admin')
      );

      if (!isCommissioner && league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Only league commissioners can approve team requests' });
      }

      const approvedRequest = await storage.approveTeamJoinLeague(requestId, userId);
      res.json(approvedRequest);
    } catch (error) {
      console.error('Error approving team league request:', error);
      res.status(500).json({ message: 'Failed to approve team league request' });
    }
  });

  app.post('/api/team-league-requests/:requestId/reject', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { requestId } = req.params;

      // Get the request to verify the league
      const allRequests = await storage.getTeamLeagueRequests({});
      const theRequest = allRequests.find((r: any) => r.id === requestId);
      
      if (!theRequest) {
        return res.status(404).json({ message: 'Request not found' });
      }

      // Verify user is a commissioner of the league
      const league = await storage.getLeague(theRequest.leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      const user = await storage.getUser(userId);
      const isCommissioner = user && (
        user.role === 'commissioner' || 
        user.role === 'secondary_commissioner' || 
        user.specialPermissions?.includes('admin')
      );

      if (!isCommissioner && league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Only league commissioners can reject team requests' });
      }

      const rejectedRequest = await storage.rejectTeamJoinLeague(requestId, userId);
      res.json(rejectedRequest);
    } catch (error) {
      console.error('Error rejecting team league request:', error);
      res.status(500).json({ message: 'Failed to reject team league request' });
    }
  });

  // Alias routes for frontend compatibility
  app.post('/api/league-requests/:requestId/approve', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { requestId } = req.params;

      // Get the request to verify the league
      const allRequests = await storage.getTeamLeagueRequests({});
      const theRequest = allRequests.find((r: any) => r.id === requestId);
      
      if (!theRequest) {
        return res.status(404).json({ message: 'Request not found' });
      }

      // Verify user is a commissioner of the league
      const league = await storage.getLeague(theRequest.leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      const user = await storage.getUser(userId);
      const isCommissioner = user && (
        user.role === 'commissioner' || 
        user.role === 'secondary_commissioner' || 
        user.specialPermissions?.includes('admin')
      );

      if (!isCommissioner && league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Only league commissioners can approve team requests' });
      }

      const approvedRequest = await storage.approveTeamJoinLeague(requestId, userId);
      res.json(approvedRequest);
    } catch (error) {
      console.error('Error approving team league request:', error);
      res.status(500).json({ message: 'Failed to approve team league request' });
    }
  });

  app.post('/api/league-requests/:requestId/reject', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { requestId } = req.params;

      // Get the request to verify the league
      const allRequests = await storage.getTeamLeagueRequests({});
      const theRequest = allRequests.find((r: any) => r.id === requestId);
      
      if (!theRequest) {
        return res.status(404).json({ message: 'Request not found' });
      }

      // Verify user is a commissioner of the league
      const league = await storage.getLeague(theRequest.leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      const user = await storage.getUser(userId);
      const isCommissioner = user && (
        user.role === 'commissioner' || 
        user.role === 'secondary_commissioner' || 
        user.specialPermissions?.includes('admin')
      );

      if (!isCommissioner && league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Only league commissioners can reject team requests' });
      }

      const rejectedRequest = await storage.rejectTeamJoinLeague(requestId, userId);
      res.json(rejectedRequest);
    } catch (error) {
      console.error('Error rejecting team league request:', error);
      res.status(500).json({ message: 'Failed to reject team league request' });
    }
  });

  // Beverage duty routes
  app.post('/api/games/:gameId/beverage-duty', isAuthenticated, async (req: any, res) => {
    try {
      const gameId = req.params.gameId;
      const userId = req.user.claims.sub;
      const { teamId } = req.body;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      if (!teamId) {
        return res.status(400).json({ message: 'Team ID is required' });
      }

      const updatedGame = await storage.claimBeverageDuty(gameId, userId, teamId);
      res.json(updatedGame);
    } catch (error) {
      console.error('Error claiming beverage duty:', error);
      res.status(500).json({ message: 'Failed to claim beverage duty' });
    }
  });


  // Get specific game details
  app.get('/api/games/:gameId', isAuthenticated, async (req: any, res) => {
    try {
      const gameId = req.params.gameId;
      
      // First try to get from regular games
      let game = await storage.getGameById(gameId);
      
      // If not found, check if it's a tournament match
      if (!game) {
        const tournamentMatch = await storage.getTournamentMatchAsGame(gameId);
        if (tournamentMatch) {
          const formattedGame = formatGameForResponse(tournamentMatch);
          return res.json(formattedGame);
        }
        return res.status(404).json({ message: 'Game not found' });
      }
      
      const formattedGame = formatGameForResponse(game);
      res.json(formattedGame);
    } catch (error) {
      console.error('Error fetching game details:', error);
      res.status(500).json({ message: 'Failed to fetch game details' });
    }
  });

  // Get consolidated game details (game + league + team members + score submissions) in one request
  app.get('/api/games/:gameId/full', isAuthenticated, async (req: any, res) => {
    try {
      const gameId = req.params.gameId;
      const userId = req.user.claims.sub;
      
      // First try regular games
      let game = await storage.getGameById(gameId);
      let isTournamentMatch = false;
      
      // If not found, check if it's a tournament match
      if (!game) {
        const tournamentMatch = await storage.getTournamentMatchAsGame(gameId);
        if (!tournamentMatch) {
          return res.status(404).json({ message: 'Game not found' });
        }
        game = tournamentMatch;
        isTournamentMatch = true;
      }
      
      const formattedGame = formatGameForResponse(game);
      
      // Fetch all related data in parallel
      // For tournament matches, use linked team IDs if available, otherwise empty arrays
      let homeTeamId = game.homeTeamId;
      let awayTeamId = game.awayTeamId;
      
      // For tournament matches, resolve tournament team IDs to linked regular team IDs
      let linkedHomeTeamId: string | null = null;
      let linkedAwayTeamId: string | null = null;
      if (isTournamentMatch) {
        // Check if homeTeamId is a tournament team and get linked regular team
        const [homeTournamentTeam] = await db
          .select()
          .from(tournamentTeams)
          .where(eq(tournamentTeams.id, homeTeamId));
        if (homeTournamentTeam?.teamId) {
          linkedHomeTeamId = homeTournamentTeam.teamId;
        }
        
        // Check if awayTeamId is a tournament team and get linked regular team
        if (awayTeamId) {
          const [awayTournamentTeam] = await db
            .select()
            .from(tournamentTeams)
            .where(eq(tournamentTeams.id, awayTeamId));
          if (awayTournamentTeam?.teamId) {
            linkedAwayTeamId = awayTournamentTeam.teamId;
          }
        }
      }
      
      // Use linked team IDs for fetching team members if available
      const effectiveHomeTeamId = linkedHomeTeamId || homeTeamId;
      const effectiveAwayTeamId = linkedAwayTeamId || awayTeamId;
      
      const [homeTeamMembers, awayTeamMembers, scoreSubmissions, userTeams, homeTeamForLeague] = await Promise.all([
        // Only fetch team members if we have a valid team ID (not 'tbd' or tournament team ID)
        effectiveHomeTeamId && effectiveHomeTeamId !== 'tbd' ? storage.getTeamMembers(effectiveHomeTeamId).catch(() => []) : Promise.resolve([]),
        effectiveAwayTeamId && effectiveAwayTeamId !== 'tbd' ? storage.getTeamMembers(effectiveAwayTeamId).catch(() => []) : Promise.resolve([]),
        isTournamentMatch ? Promise.resolve([]) : storage.getGameScoreSubmissions(gameId),
        storage.getUserTeams(userId),
        // Fetch home team to derive leagueId if the game itself doesn't have one
        !game.leagueId && effectiveHomeTeamId && effectiveHomeTeamId !== 'tbd' ? storage.getTeam(effectiveHomeTeamId).catch(() => null) : Promise.resolve(null)
      ]);
      
      // Determine the effective leagueId: prefer the game's own, fall back to home team's
      const effectiveLeagueId = game.leagueId || (homeTeamForLeague as any)?.leagueId || null;
      const league = effectiveLeagueId ? await storage.getLeague(effectiveLeagueId) : null;
      
      // Get captain status for user's teams in this game
      // For tournament matches, include both the tournament team IDs and linked regular team IDs
      const allTeamIds = [homeTeamId, awayTeamId, linkedHomeTeamId, linkedAwayTeamId]
        .filter((id): id is string => !!id && id !== 'tbd');
      const uniqueTeamIds = [...new Set(allTeamIds)];
      const userTeamMemberships = uniqueTeamIds.length > 0 
        ? await storage.getUserTeamMemberships(userId, uniqueTeamIds).catch(() => [])
        : [];
      
      // For tournament matches, if user is captain of linked regular team, also mark them as captain for tournament team
      if (isTournamentMatch) {
        if (linkedHomeTeamId) {
          const isLinkedHomeCaptain = userTeamMemberships.some(m => m.teamId === linkedHomeTeamId && m.isCaptain);
          if (isLinkedHomeCaptain && !userTeamMemberships.some(m => m.teamId === homeTeamId)) {
            userTeamMemberships.push({ teamId: homeTeamId, isCaptain: true });
          }
        }
        if (linkedAwayTeamId && awayTeamId) {
          const isLinkedAwayCaptain = userTeamMemberships.some(m => m.teamId === linkedAwayTeamId && m.isCaptain);
          if (isLinkedAwayCaptain && !userTeamMemberships.some(m => m.teamId === awayTeamId)) {
            userTeamMemberships.push({ teamId: awayTeamId, isCaptain: true });
          }
        }
      }
      
      // Check if the current user is an approved substitute for this game
      const [approvedSubRow] = await db
        .select({ requestingTeamId: substituteRequests.requestingTeamId })
        .from(substituteRequests)
        .where(and(
          eq(substituteRequests.gameId, gameId),
          eq(substituteRequests.substitutePlayerId, userId),
          eq(substituteRequests.status, 'approved')
        ))
        .limit(1);
      const approvedSubstitute = approvedSubRow ? { teamId: approvedSubRow.requestingTeamId } : null;

      res.json({
        game: formattedGame,
        league,
        homeTeamMembers,
        awayTeamMembers,
        scoreSubmissions,
        userTeams,
        userTeamMemberships,
        isTournamentMatch,
        linkedHomeTeamId,
        linkedAwayTeamId,
        approvedSubstitute,
      });
    } catch (error) {
      console.error('Error fetching full game details:', error);
      res.status(500).json({ message: 'Failed to fetch game details' });
    }
  });

  // Get game participants (all players from home and away teams)
  app.get('/api/games/:gameId/participants', isAuthenticated, async (req: any, res) => {
    try {
      const gameId = req.params.gameId;
      const userId = req.user.claims.sub;
      
      // Get game details first
      const game = await storage.getGameById(gameId);
      if (!game) {
        return res.status(404).json({ message: 'Game not found' });
      }

      // Verify user has access to this game (league member, team member, or approved substitute)
      let hasAccess = false;
      if (game.leagueId) {
        const userMembership = await storage.getUserLeagueMembership(userId, game.leagueId);
        hasAccess = !!(userMembership && userMembership.status === 'approved');
      } else {
        // For standalone games, check if user is a member of either team
        const homeTeamMembers = await storage.getTeamMembers(game.homeTeamId);
        const awayTeamMembers = game.awayTeamId ? await storage.getTeamMembers(game.awayTeamId) : [];
        hasAccess = [...homeTeamMembers, ...awayTeamMembers].some(m => m.userId === userId);
      }
      
      // Also check if user is an approved substitute for this game
      if (!hasAccess) {
        const substituteGameIds = await storage.getUserSubstituteGameIds(userId);
        hasAccess = substituteGameIds.includes(gameId);
      }
      
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      // Get members from both home and away teams
      const homeTeamMembers = await storage.getTeamMembers(game.homeTeamId);
      const awayTeamMembers = game.awayTeamId ? await storage.getTeamMembers(game.awayTeamId) : [];
      
      // Get league memberships to access isGoalie field
      const allMembers = [...homeTeamMembers, ...awayTeamMembers];
      const leagueMembershipsMap = new Map();
      
      if (game.leagueId) {
        for (const member of allMembers) {
          const leagueMembership = await storage.getUserLeagueMembership(member.user.id, game.leagueId);
          if (leagueMembership) {
            leagueMembershipsMap.set(member.user.id, leagueMembership);
          }
        }
      }
      
      // Combine all participants and format for stats management
      const participants = allMembers.map(member => {
        const leagueMembership = leagueMembershipsMap.get(member.user.id);
        return {
          id: member.user.id,
          userId: member.user.id,
          // Use displayFirstName/displayLastName from league membership if set, otherwise fall back to user's names
          firstName: leagueMembership?.displayFirstName || member.user.firstName || '',
          lastName: leagueMembership?.displayLastName || member.user.lastName || '',
          email: member.user.email,
          isGoalie: leagueMembership?.isGoalie || false,
          teamName: member.teamId === game.homeTeamId ? game.homeTeam.name : game.awayTeam.name
        };
      });

      res.json(participants);
    } catch (error) {
      console.error('Error fetching game participants:', error);
      res.status(500).json({ message: 'Failed to fetch game participants' });
    }
  });

  // Release beverage duty
  app.post('/api/games/:gameId/release-beverage-duty', isAuthenticated, async (req: any, res) => {
    try {
      const gameId = req.params.gameId;
      const userId = req.user.claims.sub;
      const { teamId } = req.body;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      if (!teamId) {
        return res.status(400).json({ message: 'Team ID is required' });
      }

      const updatedGame = await storage.releaseBeverageDuty(gameId, userId, teamId);
      res.json(updatedGame);
    } catch (error) {
      console.error('Error releasing beverage duty:', error);
      res.status(500).json({ message: 'Failed to release beverage duty' });
    }
  });

  // Custom duty routes
  app.post('/api/teams/:teamId/duties', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const teamId = req.params.teamId;
      const { name, icon, scope } = req.body;
      
      if (!name || !icon || !scope) {
        return res.status(400).json({ message: 'Name, icon, and scope are required' });
      }

      const team = await storage.getTeam(teamId);
      const isCaptain = await storage.isTeamCaptain(teamId, userId);
      if (!team || !isCaptain) {
        return res.status(403).json({ message: 'Only team captains can create duties' });
      }

      const template = await storage.createDutyTemplate({
        teamId,
        name,
        icon,
        scope,
        isDefault: false,
        createdBy: userId,
      });
      
      res.json(template);
    } catch (error) {
      console.error('Error creating duty template:', error);
      res.status(500).json({ message: 'Failed to create duty template' });
    }
  });

  // Update duty template (captain only)
  app.put('/api/teams/:teamId/duties/:dutyTemplateId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId, dutyTemplateId } = req.params;
      const { name, icon, scope } = req.body;
      
      // Verify team captain (supports multiple captains)
      const team = await storage.getTeam(teamId);
      const isCaptain = await storage.isTeamCaptain(teamId, userId);
      if (!team || !isCaptain) {
        return res.status(403).json({ message: 'Only team captains can edit duties' });
      }

      // Verify template belongs to team
      const template = await storage.getDutyTemplateById(dutyTemplateId);
      if (!template || template.teamId !== teamId) {
        return res.status(404).json({ message: 'Duty template not found' });
      }

      // Build updates object
      const updates: Partial<Pick<DutyTemplate, 'name' | 'icon' | 'scope'>> = {};
      if (name) updates.name = name;
      if (icon) updates.icon = icon;
      if (scope) updates.scope = scope;

      const updated = await storage.updateDutyTemplate(dutyTemplateId, updates);
      res.json(updated);
    } catch (error) {
      console.error('Error updating duty template:', error);
      res.status(500).json({ message: 'Failed to update duty template' });
    }
  });

  // Delete duty from a specific game only (captain or commissioner)
  app.delete('/api/games/:gameId/duties/:dutyTemplateId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { gameId, dutyTemplateId } = req.params;
      
      // Verify template exists and get team
      const template = await storage.getDutyTemplateById(dutyTemplateId);
      if (!template) {
        return res.status(404).json({ message: 'Duty template not found' });
      }

      // Verify user is team captain or league commissioner (supports multiple captains)
      const team = await storage.getTeam(template.teamId);
      if (!team) {
        return res.status(404).json({ message: 'Team not found' });
      }
      
      const isCaptain = await storage.isTeamCaptain(template.teamId, userId);
      let isCommissioner = false;
      if (team.leagueId) {
        const league = await storage.getLeague(team.leagueId);
        isCommissioner = league?.commissionerId === userId;
      }
      
      if (!isCaptain && !isCommissioner) {
        return res.status(403).json({ message: 'Only team captains or commissioners can delete duty assignments' });
      }

      // Delete assignments for this specific game and template (and add exclusion)
      await storage.deleteDutyAssignmentsForGameAndTemplate(gameId, dutyTemplateId, template.teamId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting duty assignment:', error);
      res.status(500).json({ message: 'Failed to delete duty assignment' });
    }
  });

  app.get('/api/games/:gameId/teams/:teamId/duties', async (req: any, res) => {
    try {
      const { gameId, teamId } = req.params;
      
      // Resolve tournament team ID to linked regular team ID if applicable
      let effectiveTeamId = teamId;
      const [tournamentTeam] = await db
        .select()
        .from(tournamentTeams)
        .where(eq(tournamentTeams.id, teamId));
      
      if (tournamentTeam && tournamentTeam.teamId) {
        effectiveTeamId = tournamentTeam.teamId;
      }
      
      const templates = await storage.getDutyTemplatesForGame(effectiveTeamId, gameId);
      res.json(templates);
    } catch (error) {
      console.error('Error fetching duty templates for game:', error);
      res.status(500).json({ message: 'Failed to fetch duty templates' });
    }
  });

  app.delete('/api/duties/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const dutyId = req.params.id;
      
      const template = await storage.getDutyTemplateById(dutyId);
      if (!template) {
        return res.status(404).json({ message: 'Duty template not found' });
      }

      const team = await storage.getTeam(template.teamId);
      if (!team) {
        return res.status(404).json({ message: 'Team not found' });
      }
      
      const isCaptain = await storage.isTeamCaptain(template.teamId, userId);
      let isCommissioner = false;
      if (team.leagueId) {
        const league = await storage.getLeague(team.leagueId);
        isCommissioner = league?.commissionerId === userId;
      }
      
      if (!isCaptain && !isCommissioner) {
        return res.status(403).json({ message: 'Only team captains or commissioners can delete duties' });
      }

      await storage.deleteDutyTemplate(dutyId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting duty template:', error);
      res.status(500).json({ message: 'Failed to delete duty template' });
    }
  });

  app.post('/api/games/:gameId/duties/:dutyTemplateId/claim', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { gameId, dutyTemplateId } = req.params;
      const { teamId } = req.body;
      
      
      if (!teamId) {
        return res.status(400).json({ message: 'Team ID is required' });
      }

      // Verify user is a member of the team and resolve tournament team to linked regular team
      let isMember = false;
      let effectiveTeamId = teamId; // The team ID to use for the duty (may be different for tournament teams)
      
      // First check regular team membership
      const teamMembers = await storage.getTeamMembers(teamId);
      isMember = teamMembers.some(member => member.userId === userId);
      
      // If not found in regular teams, check if this is a tournament team
      if (!isMember) {
        const [tournamentTeam] = await db
          .select()
          .from(tournamentTeams)
          .where(eq(tournamentTeams.id, teamId));
        
        if (tournamentTeam) {
          // Check if user is a participant of this tournament team
          const [participant] = await db
            .select()
            .from(tournamentParticipants)
            .where(and(
              eq(tournamentParticipants.tournamentTeamId, teamId),
              eq(tournamentParticipants.userId, userId),
              eq(tournamentParticipants.status, 'approved')
            ));
          isMember = !!participant;
          
          // Also check if the tournament team is linked to a regular team the user is on
          if (tournamentTeam.teamId) {
            const linkedTeamMembers = await storage.getTeamMembers(tournamentTeam.teamId);
            if (linkedTeamMembers.some(member => member.userId === userId)) {
              isMember = true;
            }
            // Use the linked regular team ID for duty operations
            effectiveTeamId = tournamentTeam.teamId;
          }
        }
      }
      
      // Also allow approved substitutes to claim duties
      if (!isMember) {
        const game = await storage.getGameById(gameId);
        if (game) {
          const [subRow] = await db
            .select({ id: substituteRequests.id })
            .from(substituteRequests)
            .where(and(
              eq(substituteRequests.gameId, gameId),
              eq(substituteRequests.substitutePlayerId, userId),
              eq(substituteRequests.requestingTeamId, teamId),
              eq(substituteRequests.status, 'approved')
            ))
            .limit(1);
          if (subRow) isMember = true;
        }
      }

      if (!isMember) {
        return res.status(403).json({ message: 'You are not a member of this team' });
      }

      // Attempt to claim the duty using the effective team ID (linked regular team for tournament teams)
      try {
        const assignment = await storage.claimDuty({
          dutyTemplateId,
          gameId,
          userId,
          teamId: effectiveTeamId,
        });
        
        res.json(assignment);
      } catch (error: any) {
        // Handle unique constraint violations (duty already claimed)
        if (error.code === '23505' || error.message?.includes('unique')) {
          return res.status(409).json({ message: 'This duty has already been claimed' });
        }
        throw error;
      }
    } catch (error) {
      console.error('Error claiming duty:', error);
      res.status(500).json({ message: 'Failed to claim duty' });
    }
  });

  app.post('/api/games/:gameId/duties/:dutyTemplateId/release', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { gameId, dutyTemplateId } = req.params;
      const { teamId } = req.body;
      
      if (!teamId) {
        return res.status(400).json({ message: 'Team ID is required' });
      }

      // Verify user is a member of the team and resolve tournament team to linked regular team
      let isMember = false;
      let effectiveTeamId = teamId; // The team ID to use for the duty (may be different for tournament teams)
      
      // First check regular team membership
      const teamMembers = await storage.getTeamMembers(teamId);
      isMember = teamMembers.some(member => member.userId === userId);
      
      // If not found in regular teams, check if this is a tournament team
      if (!isMember) {
        const [tournamentTeam] = await db
          .select()
          .from(tournamentTeams)
          .where(eq(tournamentTeams.id, teamId));
        
        if (tournamentTeam) {
          // Check if user is a participant of this tournament team
          const [participant] = await db
            .select()
            .from(tournamentParticipants)
            .where(and(
              eq(tournamentParticipants.tournamentTeamId, teamId),
              eq(tournamentParticipants.userId, userId),
              eq(tournamentParticipants.status, 'approved')
            ));
          isMember = !!participant;
          
          // Also check if the tournament team is linked to a regular team the user is on
          if (tournamentTeam.teamId) {
            const linkedTeamMembers = await storage.getTeamMembers(tournamentTeam.teamId);
            if (linkedTeamMembers.some(member => member.userId === userId)) {
              isMember = true;
            }
            // Use the linked regular team ID for duty operations
            effectiveTeamId = tournamentTeam.teamId;
          }
        }
      }

      // Also allow approved substitutes to release duties
      if (!isMember) {
        const game = await storage.getGameById(gameId);
        if (game) {
          const [subRow] = await db
            .select({ id: substituteRequests.id })
            .from(substituteRequests)
            .where(and(
              eq(substituteRequests.gameId, gameId),
              eq(substituteRequests.substitutePlayerId, userId),
              eq(substituteRequests.requestingTeamId, teamId),
              eq(substituteRequests.status, 'approved')
            ))
            .limit(1);
          if (subRow) isMember = true;
        }
      }
      
      if (!isMember) {
        return res.status(403).json({ message: 'You are not a member of this team' });
      }

      await storage.releaseDuty(dutyTemplateId, gameId, effectiveTeamId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error releasing duty:', error);
      res.status(500).json({ message: 'Failed to release duty' });
    }
  });

  app.get('/api/games/:gameId/duties', async (req: any, res) => {
    try {
      const gameId = req.params.gameId;
      const assignments = await storage.getDutyAssignmentsByGame(gameId);
      res.json(assignments);
    } catch (error) {
      console.error('Error fetching duty assignments:', error);
      res.status(500).json({ message: 'Failed to fetch duty assignments' });
    }
  });

  // Save notes for game
  app.post('/api/games/:gameId/notes', isAuthenticated, async (req: any, res) => {
    try {
      const gameId = req.params.gameId;
      const userId = req.user.claims.sub;
      const { teamId, notes } = req.body;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      if (!teamId) {
        return res.status(400).json({ message: 'Team ID is required' });
      }

      const savedNotes = await storage.saveGameNotes(gameId, userId, teamId, notes);
      res.json(savedNotes);
    } catch (error) {
      console.error('Error saving game notes:', error);
      res.status(500).json({ message: 'Failed to save notes' });
    }
  });

  // RSVP routes
  app.post('/api/games/:gameId/rsvp', isAuthenticated, async (req: any, res) => {
    try {
      const gameId = req.params.gameId;
      const userId = req.user.claims.sub;
      const { status, teamId } = req.body;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      if (!status || !['attending', 'not_attending'].includes(status)) {
        return res.status(400).json({ message: 'Valid status (attending/not_attending) is required' });
      }

      if (!teamId) {
        return res.status(400).json({ message: 'Team ID is required' });
      }

      // Verify the game exists - check regular games first, then tournament matches
      let game = await storage.getGameById(gameId);
      let isTournamentMatch = false;
      if (!game) {
        const tournamentMatch = await storage.getTournamentMatchAsGame(gameId);
        if (tournamentMatch) {
          game = tournamentMatch;
          isTournamentMatch = true;
        }
      }
      if (!game) {
        return res.status(404).json({ message: 'Game not found' });
      }

      // Verify the team is playing in this game
      if (game.homeTeamId !== teamId && game.awayTeamId !== teamId) {
        return res.status(403).json({ message: 'Team is not playing in this game' });
      }

      // Verify user is on the specified team
      // Check both direct team membership AND league membership with assigned team
      const teamMembers = await storage.getTeamMembers(teamId).catch(() => []);
      const hasDirectTeamMembership = teamMembers.some(member => member.userId === userId);
      
      // Also check if user has league membership with this team assigned (only for league games)
      let hasLeagueTeamAssignment = false;
      if (game.leagueId) {
        const leagueMembership = await storage.getUserLeagueMembership(userId, game.leagueId);
        hasLeagueTeamAssignment = !!(leagueMembership && leagueMembership.assignedTeamId === teamId);
      }
      
      // Also allow approved substitutes to RSVP
      let isApprovedSubstitute = false;
      if (!hasDirectTeamMembership && !hasLeagueTeamAssignment) {
        const [subRow] = await db
          .select({ id: substituteRequests.id })
          .from(substituteRequests)
          .where(and(
            eq(substituteRequests.gameId, gameId),
            eq(substituteRequests.substitutePlayerId, userId),
            eq(substituteRequests.requestingTeamId, teamId),
            eq(substituteRequests.status, 'approved')
          ))
          .limit(1);
        isApprovedSubstitute = !!subRow;
      }

      if (!hasDirectTeamMembership && !hasLeagueTeamAssignment && !isApprovedSubstitute) {
        return res.status(403).json({ message: 'You must be on this team to RSVP' });
      }

      let rsvp;
      if (isTournamentMatch) {
        // Use tournament match RSVP storage
        rsvp = await storage.createOrUpdateTournamentMatchRsvp({
          matchId: gameId,
          userId,
          teamId,
          status,
        });
      } else {
        const rsvpData = insertGameRsvpSchema.parse({
          gameId,
          userId,
          teamId,
          status,
        });
        rsvp = await storage.createOrUpdateRsvp(rsvpData);
      }
      
      // Send push notification to team captain (if user is not the captain themselves)
      try {
        const team = await storage.getTeam(teamId);
        if (team?.captainId && team.captainId !== userId) {
          const player = await storage.getUser(userId);
          const playerName = player?.firstName && player?.lastName 
            ? `${player.firstName} ${player.lastName}`
            : player?.firstName || 'A player';
          
          // Create a game title from opponent and date
          let gameTitle = 'upcoming game';
          if (game.scheduledAt) {
            const gameDate = new Date(game.scheduledAt);
            const dateStr = gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            
            // Get opposing team name
            const opposingTeamId = game.homeTeamId === teamId ? game.awayTeamId : game.homeTeamId;
            if (opposingTeamId) {
              const opposingTeam = await storage.getTeam(opposingTeamId);
              if (opposingTeam?.name) {
                gameTitle = `${dateStr} game against ${opposingTeam.name}`;
              } else {
                gameTitle = `${dateStr} game`;
              }
            } else {
              gameTitle = `${dateStr} game`;
            }
          }
          
          const { sendPlayerRsvpPushNotification } = await import('./oneSignalNotifications');
          sendPlayerRsvpPushNotification(
            team.captainId,
            playerName,
            status as 'attending' | 'not_attending',
            gameTitle,
            gameId,
            teamId
          ).catch(err => console.error('Failed to send RSVP push notification:', err));
        }
      } catch (notifError) {
        console.error('Error sending RSVP notification:', notifError);
        // Don't fail the RSVP if notification fails
      }
      
      res.json(rsvp);
    } catch (error) {
      console.error('Error updating RSVP:', error);
      res.status(500).json({ message: 'Failed to update RSVP' });
    }
  });

  app.get('/api/games/:gameId/rsvp-summary', isAuthenticated, async (req: any, res) => {
    try {
      const gameId = req.params.gameId;
      const userId = req.user.claims.sub;
      const { teamId } = req.query;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      // Verify the game exists - check regular games first, then tournament matches
      let game = await storage.getGameById(gameId);
      let isTournamentMatch = false;
      if (!game) {
        const tournamentMatch = await storage.getTournamentMatchAsGame(gameId);
        if (tournamentMatch) {
          game = tournamentMatch;
          isTournamentMatch = true;
        }
      }
      if (!game) {
        return res.status(404).json({ message: 'Game not found' });
      }

      // Check if user is captain or commissioner
      const user = await storage.getUser(userId);
      let isCommissioner = false;
      if (game.leagueId) {
        const league = await storage.getLeague(game.leagueId);
        isCommissioner = !!(league && league.commissionerId === userId);
      }
      
      // Check if user is captain of either team
      const homeTeam = game.homeTeamId ? await storage.getTeam(game.homeTeamId).catch(() => null) : null;
      const awayTeam = game.awayTeamId ? await storage.getTeam(game.awayTeamId).catch(() => null) : null;
      const isHomeCaptain = homeTeam && homeTeam.captainId === userId;
      const isAwayCaptain = awayTeam && awayTeam.captainId === userId;
      
      // For team-specific access
      if (teamId) {
        // Verify user is on the requested team, captain, or commissioner
        const requestedTeam = await storage.getTeam(teamId as string).catch(() => null);
        const isCaptainOfRequestedTeam = requestedTeam && requestedTeam.captainId === userId;
        
        // Check if user is a member of this team
        const teamMembers = await storage.getTeamMembers(teamId as string).catch(() => []);
        const isMemberOfTeam = teamMembers.some(member => member.userId === userId);
        
        // Also check league membership assignment (only for league games)
        let hasLeagueTeamAssignment = false;
        let leagueMembership = null;
        if (game.leagueId) {
          leagueMembership = await storage.getUserLeagueMembership(userId, game.leagueId);
          hasLeagueTeamAssignment = !!(leagueMembership && leagueMembership.assignedTeamId === teamId);
        }
        
        // Also check if user is an approved substitute for this game
        const substituteGameIds = await storage.getUserSubstituteGameIds(userId);
        const isApprovedSubstitute = substituteGameIds.includes(gameId);
        
        if (!isCommissioner && !isCaptainOfRequestedTeam && !isMemberOfTeam && !hasLeagueTeamAssignment && !isApprovedSubstitute) {
          return res.status(403).json({ message: 'You must be on this team, a captain, or commissioner to view attendance' });
        }
        
        // Use tournament match RSVP summary if this is a tournament match
        if (isTournamentMatch) {
          const summary = await storage.getTournamentMatchRsvpSummary(gameId, teamId as string);
          res.json(summary);
        } else {
          const summary = await storage.getTeamRsvpSummary(gameId, teamId as string);
          res.json(summary);
        }
        return;
      } else {
        // General access - require being on either team, captain, or commissioner
        const homeTeamMembers = game.homeTeamId ? await storage.getTeamMembers(game.homeTeamId).catch(() => []) : [];
        const awayTeamMembers = game.awayTeamId ? await storage.getTeamMembers(game.awayTeamId).catch(() => []) : [];
        const isOnHomeTeam = homeTeamMembers.some(member => member.userId === userId);
        const isOnAwayTeam = awayTeamMembers.some(member => member.userId === userId);
        
        // Check league membership assignments (only for league games)
        let hasHomeTeamAssignment = false;
        let hasAwayTeamAssignment = false;
        if (game.leagueId) {
          const leagueMembership = await storage.getUserLeagueMembership(userId, game.leagueId);
          hasHomeTeamAssignment = !!(leagueMembership && leagueMembership.assignedTeamId === game.homeTeamId);
          hasAwayTeamAssignment = !!(leagueMembership && leagueMembership.assignedTeamId === game.awayTeamId);
        }
        
        // Also check if user is an approved substitute for this game
        const substituteGameIds = await storage.getUserSubstituteGameIds(userId);
        const isApprovedSubstitute = substituteGameIds.includes(gameId);
        
        if (!isCommissioner && !isHomeCaptain && !isAwayCaptain && !isOnHomeTeam && !isOnAwayTeam && !hasHomeTeamAssignment && !hasAwayTeamAssignment && !isApprovedSubstitute) {
          return res.status(403).json({ message: 'You must be on a team, captain, or commissioner to view attendance' });
        }

        const summary = await storage.getGameRsvpSummaryByTeams(gameId);
        
        // Merge both teams' data into a flat structure for the frontend
        const mergedSummary = {
          attending: [...summary.homeTeam.attending, ...summary.awayTeam.attending],
          notAttending: [...summary.homeTeam.notAttending, ...summary.awayTeam.notAttending],
          noResponse: [...summary.homeTeam.noResponse, ...summary.awayTeam.noResponse]
        };
        
        res.json(mergedSummary);
      }
    } catch (error) {
      console.error('Error fetching RSVP summary:', error);
      res.status(500).json({ message: 'Failed to fetch RSVP summary' });
    }
  });

  // Get approved substitutes for a game
  app.get('/api/games/:gameId/substitutes', isAuthenticated, async (req: any, res) => {
    try {
      const gameId = req.params.gameId;
      const userId = req.user.claims.sub;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      const game = await storage.getGameById(gameId);
      if (!game) {
        return res.status(404).json({ message: 'Game not found' });
      }

      const substitutes = await storage.getApprovedSubstitutesForGame(gameId);
      res.json(substitutes);
    } catch (error) {
      console.error('Error fetching game substitutes:', error);
      res.status(500).json({ message: 'Failed to fetch game substitutes' });
    }
  });

  // Revoke an approved substitute (captain/commissioner only)
  app.delete('/api/games/:gameId/substitutes/:requestId', isAuthenticated, async (req: any, res) => {
    try {
      const { gameId, requestId } = req.params;
      const userId = req.user.claims.sub;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      const game = await storage.getGameById(gameId);
      if (!game) {
        return res.status(404).json({ message: 'Game not found' });
      }

      // Verify the substitute request exists and belongs to this game
      const request = await storage.getSubstituteRequest(requestId);
      if (!request || request.gameId !== gameId) {
        return res.status(404).json({ message: 'Substitute request not found for this game' });
      }

      // Check if user is captain of requesting team, opposing team, or commissioner
      const homeTeam = await storage.getTeam(game.homeTeamId);
      const awayTeam = game.awayTeamId ? await storage.getTeam(game.awayTeamId) : null;
      const isHomeCaptain = homeTeam && homeTeam.captainId === userId;
      const isAwayCaptain = awayTeam && awayTeam.captainId === userId;
      
      let isCommissioner = false;
      if (game.leagueId) {
        const league = await storage.getLeague(game.leagueId);
        isCommissioner = !!(league && league.commissionerId === userId);
      }

      if (!isHomeCaptain && !isAwayCaptain && !isCommissioner) {
        return res.status(403).json({ message: 'Only team captains or commissioners can revoke substitutes' });
      }

      await storage.revokeSubstituteApproval(requestId);
      res.json({ message: 'Substitute revoked successfully' });
    } catch (error) {
      console.error('Error revoking substitute:', error);
      res.status(500).json({ message: 'Failed to revoke substitute' });
    }
  });

  app.get('/api/games/:gameId/rsvp', isAuthenticated, async (req: any, res) => {
    try {
      const gameId = req.params.gameId;
      const userId = req.user.claims.sub;
      const { teamId } = req.query;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      if (teamId) {
        // Get RSVP for specific team
        const rsvp = await storage.getUserTeamRsvp(gameId, userId, teamId as string);
        if (!rsvp) {
          return res.status(404).json({ message: 'RSVP not found' });
        }
        res.json(rsvp);
      } else {
        // Get all RSVPs for user in this game (they might be on multiple teams)
        const rsvps = await storage.getUserGameRsvps(gameId, userId);
        res.json(rsvps);
      }
    } catch (error) {
      console.error('Error fetching user RSVP:', error);
      res.status(500).json({ message: 'Failed to fetch RSVP' });
    }
  });

  // Scorekeeper Dashboard Routes - Game Goals
  app.get('/api/games/:gameId/goals', isAuthenticated, async (req: any, res) => {
    try {
      const { gameId } = req.params;
      const goals = await storage.getGameGoals(gameId);
      res.json(goals);
    } catch (error) {
      console.error('Error fetching game goals:', error);
      res.status(500).json({ message: 'Failed to fetch game goals' });
    }
  });

  app.post('/api/games/:gameId/goals', isAuthenticated, async (req: any, res) => {
    try {
      const { gameId } = req.params;
      const userId = req.user.claims.sub;
      
      // Verify game exists
      const game = await storage.getGameById(gameId);
      if (!game) {
        return res.status(404).json({ message: 'Game not found' });
      }

      // Check if user has scorekeeper permission
      const hasPermission = await checkScorekeeperPermission(userId, game);
      if (!hasPermission) {
        return res.status(403).json({ message: 'Access denied. You must be a commissioner or have stat_manager permission.' });
      }

      const { teamId, scorerId, primaryAssistId, secondaryAssistId, period, timestamp } = req.body;
      
      // Get the current goal count for this game to set the goal number
      const existingGoals = await storage.getGameGoals(gameId);
      const goalNumber = existingGoals.length + 1;

      const goal = await storage.createGameGoal({
        gameId,
        teamId,
        scorerId,
        primaryAssistId: primaryAssistId || null,
        secondaryAssistId: secondaryAssistId || null,
        goalNumber,
        period: period || 1,
        timestamp: timestamp || null,
      });

      res.json(goal);
    } catch (error) {
      console.error('Error creating game goal:', error);
      res.status(500).json({ message: 'Failed to create game goal' });
    }
  });

  app.patch('/api/games/:gameId/goals/:goalId', isAuthenticated, async (req: any, res) => {
    try {
      const { gameId, goalId } = req.params;
      const userId = req.user.claims.sub;
      
      // Verify game exists
      const game = await storage.getGameById(gameId);
      if (!game) {
        return res.status(404).json({ message: 'Game not found' });
      }

      // Check if user has scorekeeper permission
      const hasPermission = await checkScorekeeperPermission(userId, game);
      if (!hasPermission) {
        return res.status(403).json({ message: 'Access denied. You must be a commissioner or have stat_manager permission.' });
      }

      const updates = req.body;
      const goal = await storage.updateGameGoal(goalId, updates);
      res.json(goal);
    } catch (error) {
      console.error('Error updating game goal:', error);
      res.status(500).json({ message: 'Failed to update game goal' });
    }
  });

  app.delete('/api/games/:gameId/goals/:goalId', isAuthenticated, async (req: any, res) => {
    try {
      const { gameId, goalId } = req.params;
      const userId = req.user.claims.sub;
      
      // Verify game exists
      const game = await storage.getGameById(gameId);
      if (!game) {
        return res.status(404).json({ message: 'Game not found' });
      }

      // Check if user has scorekeeper permission
      const hasPermission = await checkScorekeeperPermission(userId, game);
      if (!hasPermission) {
        return res.status(403).json({ message: 'Access denied. You must be a commissioner or have stat_manager permission.' });
      }

      await storage.deleteGameGoal(goalId);
      res.json({ message: 'Goal deleted successfully' });
    } catch (error) {
      console.error('Error deleting game goal:', error);
      res.status(500).json({ message: 'Failed to delete game goal' });
    }
  });

  // Scorekeeper Dashboard Routes - Game Penalties
  app.get('/api/games/:gameId/penalties', isAuthenticated, async (req: any, res) => {
    try {
      const { gameId } = req.params;
      const penalties = await storage.getGamePenalties(gameId);
      res.json(penalties);
    } catch (error) {
      console.error('Error fetching game penalties:', error);
      res.status(500).json({ message: 'Failed to fetch game penalties' });
    }
  });

  app.post('/api/games/:gameId/penalties', isAuthenticated, async (req: any, res) => {
    try {
      const { gameId } = req.params;
      const userId = req.user.claims.sub;
      
      // Verify game exists
      const game = await storage.getGameById(gameId);
      if (!game) {
        return res.status(404).json({ message: 'Game not found' });
      }

      // Check if user has scorekeeper permission
      const hasPermission = await checkScorekeeperPermission(userId, game);
      if (!hasPermission) {
        return res.status(403).json({ message: 'Access denied. You must be a commissioner or have stat_manager permission.' });
      }

      const { teamId, playerId, minutes, penaltyType, period, timestamp } = req.body;
      
      // Get the current penalty count for this game to set the penalty number
      const existingPenalties = await storage.getGamePenalties(gameId);
      const penaltyNumber = existingPenalties.length + 1;

      const penalty = await storage.createGamePenalty({
        gameId,
        teamId,
        playerId,
        penaltyNumber,
        minutes: minutes || 2,
        penaltyType: penaltyType || null,
        period: period || 1,
        timestamp: timestamp || null,
      });

      res.json(penalty);
    } catch (error) {
      console.error('Error creating game penalty:', error);
      res.status(500).json({ message: 'Failed to create game penalty' });
    }
  });

  app.patch('/api/games/:gameId/penalties/:penaltyId', isAuthenticated, async (req: any, res) => {
    try {
      const { gameId, penaltyId } = req.params;
      const userId = req.user.claims.sub;
      
      // Verify game exists
      const game = await storage.getGameById(gameId);
      if (!game) {
        return res.status(404).json({ message: 'Game not found' });
      }

      // Check if user has scorekeeper permission
      const hasPermission = await checkScorekeeperPermission(userId, game);
      if (!hasPermission) {
        return res.status(403).json({ message: 'Access denied. You must be a commissioner or have stat_manager permission.' });
      }

      const updates = req.body;
      const penalty = await storage.updateGamePenalty(penaltyId, updates);
      res.json(penalty);
    } catch (error) {
      console.error('Error updating game penalty:', error);
      res.status(500).json({ message: 'Failed to update game penalty' });
    }
  });

  app.delete('/api/games/:gameId/penalties/:penaltyId', isAuthenticated, async (req: any, res) => {
    try {
      const { gameId, penaltyId } = req.params;
      const userId = req.user.claims.sub;
      
      // Verify game exists
      const game = await storage.getGameById(gameId);
      if (!game) {
        return res.status(404).json({ message: 'Game not found' });
      }

      // Check if user has scorekeeper permission
      const hasPermission = await checkScorekeeperPermission(userId, game);
      if (!hasPermission) {
        return res.status(403).json({ message: 'Access denied. You must be a commissioner or have stat_manager permission.' });
      }

      await storage.deleteGamePenalty(penaltyId);
      res.json({ message: 'Penalty deleted successfully' });
    } catch (error) {
      console.error('Error deleting game penalty:', error);
      res.status(500).json({ message: 'Failed to delete game penalty' });
    }
  });

  // Scorekeeper Dashboard - Finalize game and update stats
  app.post('/api/games/:gameId/finalize', isAuthenticated, async (req: any, res) => {
    try {
      const { gameId } = req.params;
      const userId = req.user.claims.sub;
      
      // Verify game exists
      const game = await storage.getGameById(gameId);
      if (!game) {
        return res.status(404).json({ message: 'Game not found' });
      }

      // Check if user has scorekeeper permission
      const hasPermission = await checkScorekeeperPermission(userId, game);
      if (!hasPermission) {
        return res.status(403).json({ message: 'Access denied. You must be a commissioner or have stat_manager permission.' });
      }

      // Submit all goals and penalties
      await storage.submitGameGoals(gameId);
      await storage.submitGamePenalties(gameId);

      // Get all goals and penalties for this game
      const goals = await storage.getGameGoals(gameId);
      const penalties = await storage.getGamePenalties(gameId);

      // Update player stats if this is a league game (not a scrimmage)
      // Scrimmages don't count towards player stats
      if (game.leagueId && !game.isScrimmage) {
        // Build stats updates from goals
        const statsMap = new Map<string, { goals: number; assists: number; penaltyMinutes: number }>();

        for (const goal of goals) {
          // Update scorer
          const scorerStats = statsMap.get(goal.scorerId) || { goals: 0, assists: 0, penaltyMinutes: 0 };
          scorerStats.goals += 1;
          statsMap.set(goal.scorerId, scorerStats);

          // Update primary assist
          if (goal.primaryAssistId) {
            const assistStats = statsMap.get(goal.primaryAssistId) || { goals: 0, assists: 0, penaltyMinutes: 0 };
            assistStats.assists += 1;
            statsMap.set(goal.primaryAssistId, assistStats);
          }

          // Update secondary assist
          if (goal.secondaryAssistId) {
            const assistStats = statsMap.get(goal.secondaryAssistId) || { goals: 0, assists: 0, penaltyMinutes: 0 };
            assistStats.assists += 1;
            statsMap.set(goal.secondaryAssistId, assistStats);
          }
        }

        // Add penalty minutes
        for (const penalty of penalties) {
          const playerStats = statsMap.get(penalty.playerId) || { goals: 0, assists: 0, penaltyMinutes: 0 };
          playerStats.penaltyMinutes += penalty.minutes || 0;
          statsMap.set(penalty.playerId, playerStats);
        }

        // Update player stats in bulk
        const statsUpdates = Array.from(statsMap.entries()).map(([playerId, stats]) => ({
          userId: playerId,
          updates: stats
        }));

        if (statsUpdates.length > 0) {
          // Pass the game's seasonId to ensure stats are associated with the correct season
          await storage.bulkUpdatePlayerStats(game.leagueId, statsUpdates, 'increment', game.seasonId || undefined);
        }
      }

      // Finalize the game
      const updatedGame = await storage.finalizeGame(gameId);
      
      res.json({ 
        message: 'Game finalized successfully', 
        game: updatedGame,
        goalsCount: goals.length,
        penaltiesCount: penalties.length
      });
    } catch (error) {
      console.error('Error finalizing game:', error);
      res.status(500).json({ message: 'Failed to finalize game' });
    }
  });

  // Scorekeeper Dashboard - Update game scores live
  app.patch('/api/games/:gameId/scores', isAuthenticated, async (req: any, res) => {
    try {
      const { gameId } = req.params;
      const userId = req.user.claims.sub;
      const { homeScore, awayScore } = req.body;
      
      // Verify game exists
      const game = await storage.getGameById(gameId);
      if (!game) {
        return res.status(404).json({ message: 'Game not found' });
      }

      // Check if user has scorekeeper permission
      const hasPermission = await checkScorekeeperPermission(userId, game);
      if (!hasPermission) {
        return res.status(403).json({ message: 'Access denied. You must be a commissioner or have stat_manager permission.' });
      }

      const updatedGame = await storage.updateGameScores(gameId, homeScore, awayScore);
      res.json(updatedGame);
    } catch (error) {
      console.error('Error updating game scores:', error);
      res.status(500).json({ message: 'Failed to update game scores' });
    }
  });

  // Scorekeeper Dashboard - Get available options (leagues and tournaments)
  app.get('/api/scorekeeper/options', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const hasGlobalStatManager = user?.specialPermissions?.includes('stat_manager') || false;

      // Get leagues where user is commissioner
      const commissionerLeagues = await storage.getLeaguesByCommissioner(userId);
      const commissionerLeagueIds = commissionerLeagues.map(l => l.id);
      
      // Get leagues where user has league-specific stat_manager permission
      const allLeagues = await storage.getLeagues();
      const leaguesWithStatManagerAccess: typeof allLeagues = [];
      for (const league of allLeagues) {
        if (commissionerLeagueIds.includes(league.id)) continue; // Already have as commissioner
        const permissions = await storage.getUserLeaguePermissions(userId, league.id);
        if (permissions?.leagueSpecialPermissions?.includes('stat_manager')) {
          leaguesWithStatManagerAccess.push(league);
        }
      }
      
      // Combine all leagues with access
      let leaguesWithAccess = [...commissionerLeagues, ...leaguesWithStatManagerAccess];
      if (hasGlobalStatManager) {
        leaguesWithAccess = allLeagues;
      }

      // Fetch active seasons for each league
      const leagueIds = leaguesWithAccess.map(l => l.id);
      let seasonMap: Record<string, string | null> = {};
      if (leagueIds.length > 0) {
        const activeSeasons = await db
          .select({ leagueId: seasons.leagueId, name: seasons.name })
          .from(seasons)
          .where(and(
            inArray(seasons.leagueId, leagueIds),
            eq(seasons.isActive, true)
          ));
        activeSeasons.forEach(s => {
          seasonMap[s.leagueId] = s.name;
        });
      }

      // Format leagues with season info
      const leagueOptions = leaguesWithAccess.map(league => ({
        id: league.id,
        name: league.name,
        type: 'league' as const,
        seasonName: seasonMap[league.id] || null
      }));

      // Get accessible league IDs for tournament filtering
      const accessibleLeagueIds = leaguesWithAccess.map(l => l.id);

      // Build tournament query conditions
      let tournamentConditions: any[] = [eq(tournaments.createdBy, userId)];
      if (accessibleLeagueIds.length > 0) {
        tournamentConditions.push(inArray(tournaments.leagueId, accessibleLeagueIds));
      }

      // Get tournaments where user is creator or has access via leagues
      let userTournaments = await db
        .select({
          id: tournaments.id,
          name: tournaments.name,
          leagueId: tournaments.leagueId,
          leagueName: leagues.name,
          createdBy: tournaments.createdBy,
          status: tournaments.status,
          paymentStatus: tournaments.paymentStatus
        })
        .from(tournaments)
        .leftJoin(leagues, eq(tournaments.leagueId, leagues.id))
        .where(or(...tournamentConditions))
        .orderBy(sql`${tournaments.createdAt} DESC`);

      // If user has global stat_manager, get all tournaments
      if (hasGlobalStatManager) {
        userTournaments = await db
          .select({
            id: tournaments.id,
            name: tournaments.name,
            leagueId: tournaments.leagueId,
            leagueName: leagues.name,
            createdBy: tournaments.createdBy,
            status: tournaments.status,
            paymentStatus: tournaments.paymentStatus
          })
          .from(tournaments)
          .leftJoin(leagues, eq(tournaments.leagueId, leagues.id))
          .orderBy(sql`${tournaments.createdAt} DESC`);
      }

      // Format tournaments
      const tournamentOptions = userTournaments.map(t => ({
        id: t.id,
        name: t.name,
        type: 'tournament' as const,
        leagueName: t.leagueName,
        status: t.status,
        paymentStatus: t.paymentStatus
      }));

      res.json({ leagues: leagueOptions, tournaments: tournamentOptions });
    } catch (error) {
      console.error('Error fetching scorekeeper options:', error);
      res.status(500).json({ message: 'Failed to fetch scorekeeper options' });
    }
  });

  // Scorekeeper Dashboard - Get games for scorekeeper (league or tournament)
  app.get('/api/scorekeeper/games', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { leagueId, tournamentId } = req.query;
      
      // Handle tournament games
      if (tournamentId) {
        const [tournament] = await db
          .select()
          .from(tournaments)
          .where(eq(tournaments.id, tournamentId as string));

        if (!tournament) {
          return res.status(404).json({ message: 'Tournament not found' });
        }

        const user = await storage.getUser(userId);
        const isCreator = tournament.createdBy === userId;
        const hasGlobalStatManager = user?.specialPermissions?.includes('stat_manager') || false;
        
        // Check if commissioner/co-commissioner of the league or has league-specific stat_manager
        let isLeagueCommissioner = false;
        let hasLeagueStatManager = false;
        if (tournament.leagueId && user) {
          const { canManageLeagueSpecific } = await import('./permissionMiddleware');
          isLeagueCommissioner = await canManageLeagueSpecific(user as any, tournament.leagueId);
          const leaguePermissions = await storage.getUserLeaguePermissions(userId, tournament.leagueId);
          hasLeagueStatManager = leaguePermissions?.leagueSpecialPermissions?.includes('stat_manager') || false;
        }

        if (!isCreator && !isLeagueCommissioner && !hasGlobalStatManager && !hasLeagueStatManager) {
          return res.status(403).json({ message: 'Access denied. You must be a tournament creator, league commissioner, or have stat_manager permission.' });
        }

        // Get tournament matches with team names
        const matches = await db
          .select({
            id: tournamentMatches.id,
            scheduledAt: tournamentMatches.scheduledTime,
            status: tournamentMatches.status,
            homeScore: tournamentMatches.team1Score,
            awayScore: tournamentMatches.team2Score,
            round: tournamentMatches.round,
            matchNumber: tournamentMatches.matchNumber,
            team1Id: tournamentMatches.team1Id,
            team2Id: tournamentMatches.team2Id
          })
          .from(tournamentMatches)
          .where(eq(tournamentMatches.tournamentId, tournamentId as string))
          .orderBy(tournamentMatches.matchNumber);

        // Get team names for all matches
        const teamIds = [...new Set([
          ...matches.map(m => m.team1Id).filter(Boolean),
          ...matches.map(m => m.team2Id).filter(Boolean)
        ])] as string[];

        let teamMap: Record<string, { id: string; name: string }> = {};
        if (teamIds.length > 0) {
          const teams = await db
            .select({
              id: tournamentTeams.id,
              teamName: tournamentTeams.teamName
            })
            .from(tournamentTeams)
            .where(inArray(tournamentTeams.id, teamIds));
          
          teams.forEach(t => {
            teamMap[t.id] = { id: t.id, name: t.teamName };
          });
        }

        // Format matches like games
        const formattedMatches = matches.map(match => ({
          id: match.id,
          scheduledAt: formatDateAsLocalString(match.scheduledAt),
          homeTeam: match.team1Id ? teamMap[match.team1Id] || { id: match.team1Id, name: 'TBD' } : { id: '', name: 'TBD' },
          awayTeam: match.team2Id ? teamMap[match.team2Id] || { id: match.team2Id, name: 'TBD' } : { id: '', name: 'TBD' },
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          status: match.status === 'completed' ? 'completed' : null,
          leagueId: null,
          tournamentId: tournamentId,
          round: match.round,
          matchNumber: match.matchNumber
        }));

        return res.json(formattedMatches);
      }
      
      // Handle league games (original logic)
      if (!leagueId) {
        return res.status(400).json({ message: 'League ID or Tournament ID is required' });
      }

      // Check if user has scorekeeper permission for this league
      const league = await storage.getLeague(leagueId as string);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      const user = await storage.getUser(userId);
      const isCommissioner = league.commissionerId === userId;
      const hasStatManager = user?.specialPermissions?.includes('stat_manager') || false;
      
      // Also check league-specific permissions
      const leaguePermissions = await storage.getUserLeaguePermissions(userId, leagueId as string);
      const hasLeagueStatManager = leaguePermissions?.leagueSpecialPermissions?.includes('stat_manager') || false;

      if (!isCommissioner && !hasStatManager && !hasLeagueStatManager) {
        return res.status(403).json({ message: 'Access denied. You must be a commissioner or have stat_manager permission.' });
      }

      const games = await storage.getGamesByLeague(leagueId as string);
      
      const tournamentLinkedGames = await db
        .select({ gameId: tournamentMatches.gameId })
        .from(tournamentMatches)
        .where(isNotNull(tournamentMatches.gameId));
      const tournamentGameIds = new Set(tournamentLinkedGames.map(t => t.gameId).filter(Boolean));
      const filteredGames = games.filter((game: any) => !tournamentGameIds.has(game.id));
      
      // Fetch season names for all games that have a seasonId
      const seasonIds = [...new Set(filteredGames.map((g: any) => g.seasonId).filter(Boolean))] as string[];
      let seasonMap: Record<string, string> = {};
      if (seasonIds.length > 0) {
        const seasonsData = await db
          .select({ id: seasons.id, name: seasons.name })
          .from(seasons)
          .where(inArray(seasons.id, seasonIds));
        seasonsData.forEach(s => {
          seasonMap[s.id] = s.name;
        });
      }
      
      // Attach season name to each game
      const gamesWithSeasons = filteredGames.map((game: any) => ({
        ...game,
        seasonName: game.seasonId ? seasonMap[game.seasonId] : null
      }));
      
      res.json(gamesWithSeasons);
    } catch (error) {
      console.error('Error fetching scorekeeper games:', error);
      res.status(500).json({ message: 'Failed to fetch games' });
    }
  });

  // Scorekeeper Dashboard - Get tournament team players
  app.get('/api/scorekeeper/tournament-team/:tournamentTeamId/players', isAuthenticated, async (req: any, res) => {
    try {
      const { tournamentTeamId } = req.params;
      const userId = req.user.claims.sub;

      // Get tournament team to find tournamentId
      const [tournamentTeam] = await db
        .select()
        .from(tournamentTeams)
        .where(eq(tournamentTeams.id, tournamentTeamId));

      if (!tournamentTeam) {
        return res.status(404).json({ message: 'Tournament team not found' });
      }

      // Get participants for this tournament team
      const participants = await db
        .select({
          id: tournamentParticipants.id,
          odId: tournamentParticipants.userId,
          odIdAsUserId: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          profileImageUrl: users.profileImageUrl
        })
        .from(tournamentParticipants)
        .leftJoin(users, eq(tournamentParticipants.userId, users.id))
        .where(and(
          eq(tournamentParticipants.tournamentTeamId, tournamentTeamId),
          eq(tournamentParticipants.status, 'approved')
        ));

      // If no participants, try to get from regular team if linked
      if (participants.length === 0 && tournamentTeam.teamId) {
        const members = await storage.getTeamMembers(tournamentTeam.teamId);
        const formattedMembers = members.map(m => ({
          userId: m.user.id,
          user: {
            id: m.user.id,
            firstName: m.user.firstName,
            lastName: m.user.lastName,
            email: m.user.email
          }
        }));
        return res.json(formattedMembers);
      }

      // Format as TeamMember-like structure
      const formattedParticipants = participants.map(p => ({
        odId: p.odIdAsUserId || p.odId,
        user: {
          id: p.odIdAsUserId || p.odId,
          firstName: p.firstName || 'Unknown',
          lastName: p.lastName || '',
          email: p.email
        }
      }));

      res.json(formattedParticipants);
    } catch (error) {
      console.error('Error fetching tournament team players:', error);
      res.status(500).json({ message: 'Failed to fetch tournament team players' });
    }
  });

  app.get('/api/players/available/:date', isAuthenticated, async (req: any, res) => {
    try {
      const { date } = req.params;
      const { leagueId } = req.query;
      const userId = req.user.claims.sub;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      if (!leagueId) {
        return res.status(400).json({ message: 'League ID is required' });
      }

      // Check if user is captain or commissioner
      const user = await storage.getUser(userId);
      const league = await storage.getLeague(leagueId as string);
      const isCommissioner = league && league.commissionerId === userId;
      
      // For captain check, we need to verify they're captain of a team in this league
      const userTeams = await storage.getUserTeams(userId);
      const userTeamsInLeague = userTeams.filter(team => team.leagueId === leagueId);
      const isTeamCaptain = userTeamsInLeague.some(team => team.captainId === userId);
      
      if (!isCommissioner && !isTeamCaptain) {
        return res.status(403).json({ message: 'Captain or Commissioner access required' });
      }

      const availablePlayers = await storage.getAvailablePlayers(new Date(date), leagueId as string);
      res.json(availablePlayers);
    } catch (error) {
      console.error('Error fetching available players:', error);
      res.status(500).json({ message: 'Failed to fetch available players' });
    }
  });

  // Get all league players with availability status for substitute requests
  app.post('/api/substitute-requests/players-availability', isAuthenticated, async (req: any, res) => {
    try {
      const { date, leagueId } = req.body;
      const userId = req.user.claims.sub;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      if (!leagueId) {
        return res.status(400).json({ message: 'League ID is required' });
      }

      // Check if user is captain or commissioner
      const league = await storage.getLeague(leagueId as string);
      const isCommissioner = league && league.commissionerId === userId;
      
      // For captain check, verify they're captain of a team in this league
      const userTeams = await storage.getUserTeams(userId);
      const userTeamsInLeague = userTeams.filter(team => team.leagueId === leagueId);
      const isTeamCaptain = userTeamsInLeague.some(team => team.captainId === userId);
      
      if (!isCommissioner && !isTeamCaptain) {
        return res.status(403).json({ message: 'Captain or Commissioner access required' });
      }

      const allPlayers = await storage.getAllLeaguePlayersWithAvailability(new Date(date), leagueId as string);
      res.json(allPlayers);
    } catch (error) {
      console.error('Error fetching players availability:', error);
      res.status(500).json({ message: 'Failed to fetch players' });
    }
  });

  // Substitute request routes (Multi-level approval workflow)
  app.post('/api/substitute-requests', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      const validatedData = createSubstituteRequestSchema.parse(req.body);
      const { gameId, teamEventId, originalPlayerId, substitutePlayerId, reason, expiresAt } = validatedData;

      // ── TEAM EVENT PATH ──────────────────────────────────────────────────────
      if (teamEventId) {
        const [teamEvent] = await db.select().from(teamEvents).where(eq(teamEvents.id, teamEventId)).limit(1);
        if (!teamEvent) return res.status(404).json({ message: 'Team event not found' });

        const now = new Date();
        if (new Date(teamEvent.scheduledAt) <= now) {
          return res.status(409).json({ message: 'Cannot create substitute request for events that have already started' });
        }

        const team = await storage.getTeam(teamEvent.teamId);
        if (!team) return res.status(404).json({ message: 'Team not found' });

        const isCaptain = team.captainId === userId;
        const membership = await storage.getTeamMembership(userId, teamEvent.teamId);
        if (!isCaptain && !membership?.isCaptain) {
          return res.status(403).json({ message: 'Captain access required' });
        }

        const requestingTeamId = teamEvent.teamId;
        const teamMembers = await storage.getTeamMembers(requestingTeamId);

        const originalPlayerOnTeam = teamMembers.some(m => m.userId === originalPlayerId);
        if (!originalPlayerOnTeam) {
          return res.status(403).json({ message: 'Original player must be on your team' });
        }

        if (substitutePlayerId === originalPlayerId) {
          return res.status(400).json({ message: 'Substitute player cannot be the same as original player' });
        }

        const requestData = insertSubstituteRequestSchema.parse({
          teamEventId,
          originalPlayerId,
          substitutePlayerId,
          requestedBy: userId,
          requestingTeamId,
          reason,
          status: 'approved',
          expiresAt: expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });

        const request = await storage.createSubstituteRequest(requestData);

        try {
          if (substitutePlayerId) {
            const originalPlayer = await storage.getUser(originalPlayerId);
            await storage.createNotification({
              userId: substitutePlayerId,
              type: 'general',
              title: 'You\'ve Been Requested as a Substitute!',
              message: `${team.name} is requesting you to substitute for ${originalPlayer?.firstName || ''} ${originalPlayer?.lastName || ''}.`,
              actionUrl: `/team-event/${teamEventId}`,
              actionText: 'View Event',
            });
            broadcastNotificationUpdate(substitutePlayerId);
          }
        } catch (notifyError) {
          console.error('Error notifying substitute player:', notifyError);
        }

        return res.json(request);
      }

      // ── GAME PATH ────────────────────────────────────────────────────────────
      // Try regular game first, then fall back to tournament match (stored in a separate table)
      let game: any = await storage.getGameById(gameId!);
      if (!game) {
        game = await storage.getTournamentMatchAsGame(gameId!);
      }
      if (!game) {
        return res.status(404).json({ message: 'Game not found' });
      }

      // Look up league only if this game is league-linked (league games, playoffs, league tournaments)
      // Standalone tournament games (no leagueId) are still allowed but skip league member checks
      const league = game.leagueId ? await storage.getLeague(game.leagueId) : null;

      const now = new Date();
      if (game.scheduledAt && game.scheduledAt <= now) {
        return res.status(409).json({ message: 'Cannot create substitute request for games that have already started or finished' });
      }

      const homeTeam = await storage.getTeam(game.homeTeamId);
      const awayTeam = game.awayTeamId ? await storage.getTeam(game.awayTeamId) : null;
      const isHomeCaptain = homeTeam && homeTeam.captainId === userId;
      const isAwayCaptain = awayTeam && awayTeam.captainId === userId;
      
      if (!isHomeCaptain && !isAwayCaptain) {
        return res.status(403).json({ message: 'Captain access required' });
      }

      const requestingTeamId = isHomeCaptain ? game.homeTeamId : game.awayTeamId;
      
      const existingRequests = await storage.getSubstituteRequests({ gameId: gameId! });
      const duplicateRequest = existingRequests.find(req => 
        ['pending_opponent_approval', 'pending_commissioner_approval', 'pending_substitute_approval'].includes(req.status) &&
        req.originalPlayerId === originalPlayerId && 
        req.requestingTeamId === requestingTeamId
      );
      if (duplicateRequest) {
        return res.status(409).json({ message: 'An active substitute request already exists for this player in this game' });
      }

      const requestingTeamMembers = await storage.getTeamMembers(requestingTeamId);
      const requestingLeagueMembers = league ? await storage.getLeagueMembers(game.leagueId) : [];
      const originalPlayerOnTeam = requestingTeamMembers.some(m => m.userId === originalPlayerId) ||
        requestingLeagueMembers.some(m => m.userId === originalPlayerId && m.assignedTeamId === requestingTeamId);
      
      if (!originalPlayerOnTeam) {
        return res.status(403).json({ message: 'Original player must be on your team' });
      }
      
      if (substitutePlayerId) {
        const substitutePlayer = await storage.getUser(substitutePlayerId);
        if (!substitutePlayer) {
          return res.status(400).json({ message: 'Substitute player not found' });
        }

        // Only enforce league membership check for league-linked games
        if (league) {
          const substituteInLeague = requestingLeagueMembers.some(m => m.userId === substitutePlayerId);
          if (!substituteInLeague) {
            return res.status(403).json({ message: 'Substitute player must be a league member' });
          }
        }

        if (substitutePlayerId === originalPlayerId) {
          return res.status(400).json({ message: 'Substitute player cannot be the same as original player' });
        }

        const homeTeamMembers = await storage.getTeamMembers(game.homeTeamId);
        const awayTeamMembers = game.awayTeamId ? await storage.getTeamMembers(game.awayTeamId) : [];
        const substituteOnHomeTeam = homeTeamMembers.some(m => m.userId === substitutePlayerId);
        const substituteOnAwayTeam = awayTeamMembers.some(m => m.userId === substitutePlayerId);
        
        if (substituteOnHomeTeam || substituteOnAwayTeam) {
          return res.status(400).json({ message: 'Substitute player is already on one of the teams for this game' });
        }
      }

      const hasOpposingTeam = game.awayTeamId && game.awayTeamId !== 'opponent' && game.awayTeamId.length > 0;
      const initialStatus = hasOpposingTeam ? 'pending_substitute_approval' : 'approved';

      const requestData = insertSubstituteRequestSchema.parse({
        gameId: gameId!,
        originalPlayerId,
        substitutePlayerId,
        requestedBy: userId,
        requestingTeamId,
        reason,
        status: initialStatus,
        expiresAt: expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const request = await storage.createSubstituteRequest(requestData);
      
      try {
        if (substitutePlayerId) {
          const requestingTeam = await storage.getTeam(requestingTeamId);
          const originalPlayer = await storage.getUser(originalPlayerId);
          
          await storage.createNotification({
            userId: substitutePlayerId,
            type: 'general',
            title: 'You\'ve Been Requested as a Substitute!',
            message: `${requestingTeam?.name || 'A team'} is requesting you to substitute for ${originalPlayer?.firstName || ''} ${originalPlayer?.lastName || ''}. Check your To-Do section to confirm your availability.`,
            actionUrl: `/game/${gameId}`,
            actionText: 'View Game',
          });
          broadcastNotificationUpdate(substitutePlayerId);
          
          const gameInfo = `${homeTeam?.name || 'Home'} vs ${awayTeam?.name || 'Away'}`;
          import('./oneSignalNotifications').then(({ sendSubstitutionPushNotification }) => {
            sendSubstitutionPushNotification(
              substitutePlayerId,
              'Substitute Request',
              `${requestingTeam?.name || 'A team'} wants you to sub for ${gameInfo}`,
              gameId!,
              request.id
            ).catch(err => console.error('[Push] Failed to send substitution push:', err));
          }).catch(console.error);
        }
      } catch (notifyError) {
        console.error('Error notifying substitute player:', notifyError);
      }
      
      res.json(request);
    } catch (error) {
      console.error('Error creating substitute request:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid request data', errors: error.errors });
      }
      res.status(500).json({ message: 'Failed to create substitute request' });
    }
  });

  app.get('/api/substitute-requests', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      // Validate query parameters with Zod
      const queryData = getSubstituteRequestsQuerySchema.parse(req.query);
      const { status, gameId, requestingTeamId } = queryData;
      
      // Get user to check permissions
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }

      const isCommissioner = user.role === 'commissioner' || user.role === 'secondary_commissioner' || user.specialPermissions?.includes('admin');
      
      let options: any;
      
      if (isCommissioner) {
        // CRITICAL SECURITY FIX: Commissioners can only see requests from leagues they own
        const commissionerLeagues = await storage.getLeaguesByCommissioner(userId);
        const ownedLeagueIds = commissionerLeagues.map(league => league.id);
        
        if (ownedLeagueIds.length === 0) {
          return res.json([]); // No leagues owned, no requests to see
        }
        
        options = {
          status,
          gameId,
          requestingTeamId,
          leagueIds: ownedLeagueIds, // Restrict to owned leagues only
        };
      } else {
        // Non-commissioners can only see requests they're involved with
        options = {
          status,
          gameId,
          userId, // This will filter for requests where user is involved
        };
      }

      const requests = await storage.getSubstituteRequests(options);
      res.json(requests);
    } catch (error) {
      console.error('Error fetching substitute requests:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid query parameters', errors: error.errors });
      }
      res.status(500).json({ message: 'Failed to fetch substitute requests' });
    }
  });

  // Get pending substitute approvals - supports both league-specific (Dashboard) and user-wide (other components) requests
  app.get('/api/substitute-requests/pending-approvals', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { leagueId, approverType } = req.query;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      // If leagueId is provided, use league-specific method (Dashboard needs attention system)
      if (leagueId) {
        // Verify user has access to this league (either as member or commissioner)
        const user = await storage.getUser(userId);
        if (!user) {
          return res.status(401).json({ message: 'User not found' });
        }

        const league = await storage.getLeague(leagueId as string);
        if (!league) {
          return res.status(404).json({ message: 'League not found' });
        }

        // Check if user is league member or commissioner
        const leagueMembers = await storage.getLeagueMembers(leagueId as string);
        const isMember = leagueMembers.some(m => m.userId === userId);
        const isCommissioner = league.commissionerId === userId;

        if (!isMember && !isCommissioner) {
          return res.status(403).json({ message: 'Access denied - not a league member or commissioner' });
        }

        const pendingApprovals = await storage.getPendingSubstituteApprovalsForUser(userId, leagueId as string);
        res.json(pendingApprovals);
      } else {
        // If no leagueId, use user-wide method (other components)
        const validApproverTypes = ['opposing_captain', 'commissioner', 'substitute_player'];
        const approverTypeParam = approverType && validApproverTypes.includes(approverType) ? approverType as any : undefined;
        
        const pendingApprovals = await storage.getUserPendingApprovals(userId, approverTypeParam);
        res.json(pendingApprovals);
      }
    } catch (error) {
      console.error('Error fetching pending substitute approvals:', error);
      res.status(500).json({ message: 'Failed to fetch pending approvals' });
    }
  });

  // Get single substitute request with full details
  app.get('/api/substitute-requests/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const requestId = req.params.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      const request = await storage.getSubstituteRequest(requestId);
      if (!request) {
        return res.status(404).json({ message: 'Substitute request not found' });
      }

      // Check if user has permission to view this request
      const user = await storage.getUser(userId);
      const isInvolved = request.requestedBy === userId ||
                       request.originalPlayerId === userId ||
                       request.substitutePlayerId === userId;
      
      // Check if user is captain of involved teams
      const homeTeam = await storage.getTeam(request.game.homeTeamId);
      const awayTeam = request.game.awayTeamId ? await storage.getTeam(request.game.awayTeamId) : null;
      const isCaptain = (homeTeam && homeTeam.captainId === userId) ||
                       (awayTeam && awayTeam.captainId === userId);
      
      // CRITICAL SECURITY FIX: Only the league's commissioner can access, not any commissioner
      let isLeagueCommissioner = false;
      if (request.game.leagueId) {
        const league = await storage.getLeague(request.game.leagueId);
        isLeagueCommissioner = !!(league && league.commissionerId === userId);
      }

      if (!isLeagueCommissioner && !isInvolved && !isCaptain) {
        return res.status(403).json({ message: 'Access denied' });
      }

      res.json(request);
    } catch (error) {
      console.error('Error fetching substitute request:', error);
      res.status(500).json({ message: 'Failed to fetch substitute request' });
    }
  });

  // Process approval (opposing captain → commissioner → substitute player workflow)
  app.post('/api/substitute-requests/:id/approve', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const requestId = req.params.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      // Validate input with Zod schema
      const validatedData = approveSubstituteRequestSchema.parse(req.body);
      const { approverType, status, comments } = validatedData;

      const result = await storage.processApproval(
        requestId,
        userId,
        approverType,
        status,
        comments
      );
      
      res.json(result);
    } catch (error) {
      console.error('Error processing approval:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid request data', errors: error.errors });
      }
      res.status(500).json({ 
        message: 'Failed to process approval',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });


  // Update non-status fields (reason, expiry, substitute player)
  app.patch('/api/substitute-requests/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const requestId = req.params.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      // Validate input with Zod schema
      const validatedUpdates = updateSubstituteRequestSchema.parse(req.body);
      
      if (Object.keys(validatedUpdates).length === 0) {
        return res.status(400).json({ message: 'No valid updates provided' });
      }

      // Get the request to check permissions
      const request = await storage.getSubstituteRequest(requestId);
      if (!request) {
        return res.status(404).json({ message: 'Substitute request not found' });
      }

      // CRITICAL SECURITY FIX: Only the requester or the league's commissioner can update
      const user = await storage.getUser(userId);
      let isLeagueCommissioner = false;
      if (request.game.leagueId) {
        const league = await storage.getLeague(request.game.leagueId);
        isLeagueCommissioner = !!(league && league.commissionerId === userId);
      }
      const isRequester = request.requestedBy === userId;

      if (!isLeagueCommissioner && !isRequester) {
        return res.status(403).json({ message: 'Permission denied' });
      }
      
      // SECURITY: If substitute player is being updated, validate they exist and are league members
      if (validatedUpdates.substitutePlayerId && request.game.leagueId) {
        const substitutePlayer = await storage.getUser(validatedUpdates.substitutePlayerId);
        if (!substitutePlayer) {
          return res.status(400).json({ message: 'Substitute player not found' });
        }
        
        const leagueMembers = await storage.getLeagueMembers(request.game.leagueId);
        const substituteInLeague = leagueMembers.some(m => m.userId === validatedUpdates.substitutePlayerId);
        if (!substituteInLeague) {
          return res.status(403).json({ message: 'Substitute player must be a league member' });
        }
      }

      const updatedRequest = await storage.updateSubstituteRequestNonStatusFields(requestId, validatedUpdates);
      res.json(updatedRequest);
    } catch (error) {
      console.error('Error updating substitute request:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid update data', errors: error.errors });
      }
      res.status(500).json({ message: 'Failed to update substitute request' });
    }
  });


  // Expire old substitute requests
  app.post('/api/substitute-requests/expire', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      // Only commissioners can manually trigger expiration
      const user = await storage.getUser(userId);
      if (!user || !(user.role === 'commissioner' || user.role === 'secondary_commissioner' || user.specialPermissions?.includes('admin'))) {
        return res.status(403).json({ message: 'Commissioner access required' });
      }

      // CRITICAL SECURITY FIX: Commissioners can only expire requests from leagues they own
      const commissionerLeagues = await storage.getLeaguesByCommissioner(userId);
      const ownedLeagueIds = commissionerLeagues.map(league => league.id);
      
      if (ownedLeagueIds.length === 0) {
        return res.json({ 
          message: 'No requests to expire - no leagues owned',
          expiredRequests: [] 
        });
      }

      const expiredRequests = await storage.expireSubstituteRequests(ownedLeagueIds);
      res.json({ 
        message: `Expired ${expiredRequests.length} requests from your leagues`,
        expiredRequests 
      });
    } catch (error) {
      console.error('Error expiring substitute requests:', error);
      res.status(500).json({ message: 'Failed to expire substitute requests' });
    }
  });

  // Get approved substitute requests for current user
  app.get('/api/substitute-requests/my-substitutions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Fetch all approved substitute requests where the user is the substitute player
      const approvedRequests = await storage.getSubstituteRequests({ 
        status: 'approved',
        userId 
      });
      
      // Filter to only include requests where the user is the substitute player
      const mySubstitutions = approvedRequests.filter(
        req => req.substitutePlayerId === userId
      );
      
      res.json(mySubstitutions);
    } catch (error) {
      console.error('Error fetching user substitutions:', error);
      res.status(500).json({ message: 'Failed to fetch substitutions' });
    }
  });

  // Message routes (Player Plus feature)
  app.get("/api/teams/:id/messages", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const messages = await storage.getTeamMessages(req.params.id);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching team messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post("/api/teams/:id/messages", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const messageData = insertMessageSchema.parse(req.body);
      const message = await storage.sendMessage({
        ...messageData,
        senderId: req.user.claims.sub,
      });
      res.json(message);
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });



  // Configure multer for file uploads
  const upload = multer({ 
    dest: 'temp/', 
    fileFilter: (req, file, cb) => {
      const allowedMimeTypes = [
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ];
      if (allowedMimeTypes.includes(file.mimetype) || file.originalname.endsWith('.csv')) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only CSV and Excel files are allowed.'));
      }
    },
    limits: {
      fileSize: 5 * 1024 * 1024 // 5MB limit
    }
  });

  // Bulk Player Import Routes with error handler wrapper
  app.post('/api/leagues/:leagueId/players/import', isAuthenticated, (req: any, res, next) => {
    
    upload.single('playerFile')(req, res, (err) => {
      if (err) {
        console.error('Multer error:', err);
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: 'File size exceeds 5MB limit' });
          }
          return res.status(400).json({ message: err.message });
        }
        return res.status(400).json({ message: err.message || 'File upload error' });
      }
      next();
    });
  }, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const userId = req.user.claims.sub;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      // Check if user has commissioner access to this league
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Only commissioners can import players' });
      }

      // Read and parse the CSV file
      let fileContent = fs.readFileSync(file.path, 'utf8');
      
      // Skip the first 3 instruction lines if they exist
      // Lines 1-3: Instructions, Line 4: Headers, Line 5+: Data
      const lines = fileContent.split('\n');
      if (lines.length > 3 && lines[0].toUpperCase().includes('INSTRUCTION')) {
        // Skip first 3 instruction lines
        fileContent = lines.slice(3).join('\n');
      }
      
      const parseResults = Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => {
          // Normalize header names for enhanced template format
          const normalized = header.toLowerCase().trim().replace(/\*/g, ''); // Remove asterisks from required field markers
          const mapping: Record<string, string> = {
            // New template format
            'player full name': 'fullName',
            'full name': 'fullName',
            'name': 'fullName',
            'player': 'fullName',
            'player name': 'fullName',
            'team': 'teamName',
            'team name': 'teamName',
            'skill level': 'skillLevel',
            'skill rating': 'skillLevel',
            'rating': 'skillLevel',
            'email': 'email',
            'jersey #': 'jerseyNumber',
            'jersey number': 'jerseyNumber',
            'jersey': 'jerseyNumber',
            'player type': 'playerType',
            'type': 'playerType',
            'role': 'playerType',
            // Legacy support for old format
            'first name': 'firstName',
            'firstname': 'firstName',
            'last name': 'lastName', 
            'lastname': 'lastName',
            'phone': 'phoneNumber',
            'phone number': 'phoneNumber',
            'position': 'position',
            'notes': 'notes'
          };
          return mapping[normalized] || header;
        }
      });

      if (parseResults.errors.length > 0) {
        return res.status(400).json({ 
          message: 'Error parsing CSV file', 
          errors: parseResults.errors 
        });
      }

      // Get existing teams in the league for team matching
      const existingTeams = await storage.getTeamsByLeague(leagueId);
      const teamLookup = new Map<string, string>(); // teamName -> teamId
      
      existingTeams.forEach(team => {
        // Create case-insensitive lookup
        teamLookup.set(team.name.toLowerCase().trim(), team.id);
      });

      // Process the parsed data
      const validPlayers: any[] = [];
      const errors: string[] = [];
      const teamsToCreate: Set<string> = new Set();

      // Log what headers we received to help with debugging
      const receivedHeaders = parseResults.meta?.fields || Object.keys(parseResults.data[0] || {});
      
      // Helper function for email validation
      const isValidEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
      };

      // Helper function for enhanced name parsing
      const parseFullName = (fullName: string): { firstName: string; lastName: string } => {
        const trimmed = fullName.trim();
        
        // Handle "Last, First" format
        if (trimmed.includes(',')) {
          const parts = trimmed.split(',').map(p => p.trim());
          return {
            lastName: parts[0] || '',
            firstName: parts.slice(1).join(' ') || ''
          };
        }
        
        // Handle "First Middle Last" format
        const nameParts = trimmed.split(/\s+/);
        if (nameParts.length === 0) {
          return { firstName: '', lastName: '' };
        } else if (nameParts.length === 1) {
          return { firstName: nameParts[0], lastName: '' };
        } else {
          // Last word is last name, everything else is first name
          const lastName = nameParts[nameParts.length - 1];
          const firstName = nameParts.slice(0, -1).join(' ');
          return { firstName, lastName };
        }
      };

      // Helper function to normalize player type
      const normalizePlayerType = (type: string | null | undefined): boolean => {
        if (!type) return false;
        const normalized = type.toLowerCase().trim();
        return normalized === 'goalie' || normalized === 'g';
      };

      parseResults.data.forEach((row: any, index: number) => {
        // Skip rows that look like instructions or are empty
        if (!row.fullName?.trim()) {
          return;
        }

        // Enhanced name parsing
        let firstName = '';
        let lastName = '';
        
        if (row.fullName) {
          // New template format: "Player Full Name"
          const parsed = parseFullName(row.fullName);
          firstName = parsed.firstName;
          lastName = parsed.lastName;
        } else if (row.firstName && row.lastName) {
          // Legacy format
          firstName = row.firstName.trim();
          lastName = row.lastName.trim();
        }
        
        if (!firstName) {
          errors.push(`Row ${index + 1}: Player Full Name is required but missing`);
          return;
        }

        // Email validation
        const email = row.email?.trim() || null;
        if (email && !isValidEmail(email)) {
          errors.push(`Row ${index + 1}: Invalid email format '${email}' - must be a valid email address`);
          return;
        }

        // Parse jersey number
        let jerseyNumber = null;
        if (row.jerseyNumber) {
          const parsed = parseInt(row.jerseyNumber.toString().trim());
          if (!isNaN(parsed)) {
            jerseyNumber = parsed;
          }
        }

        // Normalize player type (Skater or Goalie)
        const isGoalie = normalizePlayerType(row.playerType);

        const player = {
          firstName: firstName,
          lastName: lastName,
          email: email,
          phoneNumber: row.phoneNumber?.trim() || null,
          position: row.position?.trim() || null,
          jerseyNumber: jerseyNumber,
          skillLevel: row.skillLevel?.trim() || null,
          teamName: row.teamName?.trim() || null,
          teamId: null as string | null,
          notes: row.notes?.trim() || null,
          isGoalie: isGoalie
        };

        // Try to match team name to existing team
        if (player.teamName) {
          const matchedTeamId = teamLookup.get(player.teamName.toLowerCase());
          if (matchedTeamId) {
            player.teamId = matchedTeamId;
          } else {
            // Track teams that don't exist yet
            teamsToCreate.add(player.teamName);
          }
        }

        validPlayers.push(player);
      });

      // Auto-create missing teams if they were referenced in the import
      const createdTeams = new Map<string, string>(); // teamName -> teamId
      for (const teamName of Array.from(teamsToCreate)) {
        try {
          const newTeam = await storage.createTeam({
            name: teamName,
            leagueId: leagueId,
            captainId: null, // Will be assigned later when players join
          });
          createdTeams.set(teamName, newTeam.id);
        } catch (error) {
          console.error(`Failed to create team ${teamName}:`, error);
          errors.push(`Failed to create team: ${teamName}`);
        }
      }

      // Update player records with newly created team IDs
      validPlayers.forEach(player => {
        if (player.teamName && !player.teamId) {
          const createdTeamId = createdTeams.get(player.teamName);
          if (createdTeamId) {
            player.teamId = createdTeamId;
          }
        }
      });

      // Track actual successes and failures during user creation
      let actualSuccessCount = 0;
      const createdPlayerIds: string[] = [];

      // Create imported player records with team assignments and user accounts
      if (validPlayers.length > 0) {
        // First, create the imported player records
        const importRecord = await storage.createPlayerImport({
          leagueId,
          importedBy: userId,
          fileName: file.originalname,
          totalRecords: parseResults.data.length,
          successfulRecords: 0, // Will update after actual creation
          failedRecords: errors.length
        });

        await storage.createImportedPlayersWithTeams(importRecord.id, leagueId, validPlayers);
        
        // Get all existing league memberships to check for duplicates and potential matches
        const existingMemberships = await db.query.leagueMemberships.findMany({
          where: eq(leagueMemberships.leagueId, leagueId),
          with: {
            user: true
          }
        });

        // Track teams that need chat syncing (both old and new assignments)
        const teamsToSyncAfterImport = new Set<string>();

        // Create placeholder user accounts and league memberships for imported players
        for (const player of validPlayers) {
          try {
            // Check if player already exists in the league (by name or email)
            const existingMember = existingMemberships.find(m => {
              const nameMatch = m.user.firstName?.toLowerCase() === player.firstName.toLowerCase() &&
                                m.user.lastName?.toLowerCase() === player.lastName.toLowerCase();
              const emailMatch = player.email && m.user.email?.toLowerCase() === player.email.toLowerCase();
              return nameMatch || emailMatch;
            });

            if (existingMember) {
              // Update existing player with new data (only if CSV has values)
              const updateData: any = {};
              if (player.teamId) updateData.assignedTeamId = player.teamId;
              if (player.skillLevel) updateData.skillLevel = player.skillLevel;
              if (player.position) updateData.position = player.position;
              if (player.jerseyNumber !== null) updateData.jerseyNumber = player.jerseyNumber;
              if (player.notes) updateData.notes = player.notes;
              updateData.isGoalie = player.isGoalie;

              // Track team assignment changes for chat syncing
              const oldTeamId = existingMember.assignedTeamId;
              const newTeamId = player.teamId;
              
              // Always sync existing member's current team (catches stale participants)
              if (oldTeamId) teamsToSyncAfterImport.add(oldTeamId);
              // If changing teams, also sync the new team
              if (newTeamId && newTeamId !== oldTeamId) {
                teamsToSyncAfterImport.add(newTeamId);
              }

              if (Object.keys(updateData).length > 0) {
                await db.update(leagueMemberships)
                  .set(updateData)
                  .where(eq(leagueMemberships.id, existingMember.id));
              }
              
              actualSuccessCount++;
            } else {
              // Create new user and membership
              let newUserId: string;
              let isNewUser = false; // Track if we're creating a brand new user
              
              if (player.email) {
                // Email provided: auto-assign to league/team
                // Check if user already exists locally
                let existingLocalUser = await storage.getUserByEmail(player.email);
                
                if (existingLocalUser) {
                  // User already exists in Roster, just use their ID
                  newUserId = existingLocalUser.id;
                } else {
                  // User doesn't exist locally, check Supabase Auth or create
                  let authUser;
                  let authUserExists = false;
                  try {
                    const { data: existingUsers } = await supabase.auth.admin.listUsers();
                    const existingAuthUser = existingUsers?.users.find(u => u.email?.toLowerCase() === player.email.toLowerCase());
                    
                    if (existingAuthUser) {
                      // User exists in Supabase Auth but not in Roster - add them to Roster
                      authUser = existingAuthUser;
                      authUserExists = true;
                    } else {
                      // Create new auth user
                      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
                        email: player.email,
                        password: Math.random().toString(36).slice(-16), // Temporary password
                        user_metadata: {
                          first_name: player.firstName,
                          last_name: player.lastName,
                          phone: player.phoneNumber || undefined,
                        }
                      });
                      
                      if (createError) {
                        throw new Error(`Failed to create user: ${createError.message}`);
                      }
                      
                      authUser = newUser;
                      isNewUser = true; // Brand new user created
                    }
                  } catch (error) {
                    console.error('Error managing auth user during CSV import:', error);
                    throw error;
                  }

                  // Add user to local Roster database using upsert
                  newUserId = authUser.id;
                  await storage.upsertUser({
                    id: authUser.id,
                    email: player.email,
                    firstName: player.firstName,
                    lastName: player.lastName,
                    displayName: `${player.firstName} ${player.lastName}`,
                  });
                }
              } else {
                // No email provided: create with placeholder email for later matching
                const uniqueEmail = `${player.firstName.toLowerCase()}.${player.lastName.toLowerCase()}.${Date.now()}@placeholder.roster`;
                const placeholderUser = await storage.upsertUser({
                  email: uniqueEmail,
                  firstName: player.firstName,
                  lastName: player.lastName,
                  profileImageUrl: null,
                });
                newUserId = placeholderUser.id;
              }
              
              // Create league membership for this user
              await db.insert(leagueMemberships).values({
                userId: newUserId,
                leagueId: leagueId,
                assignedTeamId: player.teamId,
                status: 'approved',
                skillLevel: player.skillLevel,
                position: player.position,
                jerseyNumber: player.jerseyNumber,
                notes: player.notes,
                isGoalie: player.isGoalie,
                approvedAt: new Date(),
              });

              // Add the newly created member to the in-memory list so that subsequent
              // players in the same CSV batch don't create duplicate records for the
              // same person (e.g. if the same name without email appears more than once).
              existingMemberships.push({
                userId: newUserId,
                leagueId: leagueId,
                assignedTeamId: player.teamId ?? null,
                user: {
                  id: newUserId,
                  email: player.email ?? null,
                  firstName: player.firstName,
                  lastName: player.lastName,
                },
              } as any);

              // Send welcome email when a player is newly added to the league (only if email provided)
              // This notifies them that they've been added to a team/league
              if (player.email) {
                console.log(`[CSVImport] Sending welcome email to newly added player: ${player.email}`);
                try {
                  const teamName = player.teamId ? (await storage.getTeam(player.teamId))?.name : undefined;
                  console.log(`[CSVImport] Team name: ${teamName || 'none'}, League: ${league.name}`);
                  await sendWelcomeEmail(player.email, {
                    playerName: `${player.firstName} ${player.lastName}`,
                    leagueName: league.name,
                    teamName: teamName,
                  });
                  console.log(`[CSVImport] Welcome email sent successfully to ${player.email}`);
                } catch (emailError) {
                  console.error(`[CSVImport] Failed to send welcome email to ${player.email}:`, emailError);
                  // Don't fail the import if email fails
                }
              }

              // Track new player's team for chat syncing
              if (player.teamId) {
                teamsToSyncAfterImport.add(player.teamId);
              }
              
              actualSuccessCount++;
              createdPlayerIds.push(newUserId);
            }
            
          } catch (error) {
            console.error(`Failed to create/update user and membership for ${player.firstName} ${player.lastName}:`, error);
            // Add error to response so we can debug
            errors.push(`Failed to create/update user for ${player.firstName} ${player.lastName}: ${(error as Error).message}`);
          }
        }

        // Update the import record with actual success count
        await storage.updatePlayerImport(importRecord.id, {
          successfulRecords: actualSuccessCount,
          failedRecords: parseResults.data.length - actualSuccessCount
        });

        // Sync team chat participants for all teams that had players added or changed
        for (const teamId of teamsToSyncAfterImport) {
          try {
            await messagingService.syncTeamChatParticipants(teamId, leagueId);
          } catch (error) {
            console.error(`Error syncing team chat for team ${teamId} after import:`, error);
          }
        }

        // Clean up uploaded file
        fs.unlinkSync(file.path);

        // Return helpful format information if all failed
        const formatHelp = errors.length === parseResults.data.length && errors.length > 0
          ? {
              expectedFormat: "CSV should have a 'Name' or 'Player' column (or 'First Name' and 'Last Name' columns). Optional: 'Team Name', 'Email', 'Phone Number', 'Position', 'Jersey Number', 'Skill Level', 'Notes'",
              receivedHeaders: receivedHeaders.join(', ')
            }
          : null;

        res.json({
          importId: importRecord.id,
          totalRecords: parseResults.data.length,
          successfulRecords: actualSuccessCount,
          failedRecords: parseResults.data.length - actualSuccessCount,
          teamsCreated: createdTeams.size,
          errors: errors.slice(0, 10), // Limit errors to first 10 to avoid huge response
          totalErrors: errors.length,
          formatHelp
        });
      } else {
        // No valid players found - create import record with all failed
        const importRecord = await storage.createPlayerImport({
          leagueId,
          importedBy: userId,
          fileName: file.originalname,
          totalRecords: parseResults.data.length,
          successfulRecords: 0,
          failedRecords: parseResults.data.length
        });

        // Clean up uploaded file
        fs.unlinkSync(file.path);

        res.json({
          importId: importRecord.id,
          totalRecords: parseResults.data.length,
          successfulRecords: 0,
          failedRecords: parseResults.data.length,
          teamsCreated: 0,
          errors: errors.slice(0, 10), // Limit errors to first 10
          totalErrors: errors.length,
          formatHelp: {
            expectedFormat: "CSV should have a 'Name' column (or 'First Name' and 'Last Name' columns). Optional: 'Team Name', 'Email', 'Phone Number', 'Position', 'Jersey Number', 'Skill Level', 'Notes'",
            receivedHeaders: receivedHeaders.join(', ')
          }
        });
      }

    } catch (error) {
      console.error('Error importing players:', error);
      
      // Clean up file if it exists
      if (req.file?.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          console.error('Error cleaning up file:', cleanupError);
        }
      }
      
      res.status(500).json({ message: 'Failed to import players' });
    }
  });

  // Manual player addition endpoint
  app.post('/api/leagues/:leagueId/members/manual-add', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const userId = req.user.claims.sub;
      const { firstName, lastName, email, phoneNumber, assignedTeamId } = req.body;

      // Validate required fields
      if (!firstName || !lastName || !email) {
        return res.status(400).json({ message: 'First name, last name, and email are required' });
      }

      // Check if user has commissioner access to this league
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Only commissioners can add players' });
      }

      // Check if team exists (if provided)
      if (assignedTeamId) {
        const team = await storage.getTeam(assignedTeamId);
        if (!team || team.leagueId !== leagueId) {
          return res.status(400).json({ message: 'Invalid team' });
        }
      }

      // Check if user already exists locally
      let existingLocalUser = await storage.getUserByEmail(email);
      let newUserId: string;
      let isNewUser = false; // Track if we're creating a brand new user

      if (existingLocalUser) {
        // User already exists in Roster, just use their ID
        newUserId = existingLocalUser.id;
      } else {
        // User doesn't exist locally, check Supabase Auth or create
        let authUser;
        let authUserExists = false;
        try {
          const { data: existingUsers } = await supabase.auth.admin.listUsers();
          const existingAuthUser = existingUsers?.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
          
          if (existingAuthUser) {
            // User exists in Supabase Auth but not in Roster - add them to Roster
            authUser = existingAuthUser;
            authUserExists = true;
          } else {
            // Create new auth user
            const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
              email,
              password: Math.random().toString(36).slice(-16), // Temporary password
              user_metadata: {
                first_name: firstName,
                last_name: lastName,
                phone: phoneNumber || undefined,
              }
            });
            
            if (createError) {
              return res.status(400).json({ message: `Failed to create user: ${createError.message}` });
            }
            
            authUser = newUser;
            isNewUser = true; // Brand new user created
          }
        } catch (error) {
          console.error('Error managing auth user:', error);
          return res.status(500).json({ message: 'Failed to process user' });
        }

        // Add user to local Roster database using upsert
        newUserId = authUser.id;
        await storage.upsertUser({
          id: authUser.id,
          email,
          firstName,
          lastName,
          displayName: `${firstName} ${lastName}`,
        });
      }

      // Create league membership
      const newMembership = await storage.requestLeagueMembership({
        leagueId,
        userId: newUserId,
        displayFirstName: firstName,
        displayLastName: lastName,
        assignedTeamId: assignedTeamId || undefined,
      });

      // Auto-approve the membership since it was manually added by commissioner
      const approvedMembership = await storage.approveLeagueMembership(newMembership.id, userId);

      // Send welcome email when a player is newly added to the league (regardless of whether they're a new system user)
      // This notifies them that they've been added to a team/league
      console.log(`[ManualAdd] Sending welcome email to newly added player: ${email}`);
      try {
        const teamName = assignedTeamId ? (await storage.getTeam(assignedTeamId))?.name : undefined;
        console.log(`[ManualAdd] Team name: ${teamName || 'none'}, League: ${league.name}`);
        await sendWelcomeEmail(email, {
          playerName: `${firstName} ${lastName}`,
          leagueName: league.name,
          teamName: teamName,
        });
        console.log(`[ManualAdd] Welcome email sent successfully to ${email}`);
      } catch (emailError) {
        console.error(`[ManualAdd] Failed to send welcome email to ${email}:`, emailError);
        // Don't fail the operation if email fails
      }

      return res.status(201).json({
        id: approvedMembership.id,
        userId: newUserId,
        leagueId,
        displayFirstName: firstName,
        displayLastName: lastName,
        assignedTeamId: assignedTeamId || undefined,
        status: approvedMembership.status,
      });

    } catch (error) {
      console.error('Error adding player:', error);
      res.status(500).json({ message: 'Failed to add player' });
    }
  });

  // Get import history for a league
  app.get('/api/leagues/:leagueId/players/imports', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const userId = req.user.claims.sub;

      // Check if user has commissioner access
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const imports = await storage.getPlayerImports(leagueId);
      res.json(imports);
    } catch (error) {
      console.error('Error fetching import history:', error);
      res.status(500).json({ message: 'Failed to fetch import history' });
    }
  });

  // Get merge requests for a league
  app.get('/api/leagues/:leagueId/players/merge-requests', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const userId = req.user.claims.sub;

      // Check if user has commissioner access
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const mergeRequests = await storage.getPlayerMergeRequests(leagueId);
      res.json(mergeRequests);
    } catch (error) {
      console.error('Error fetching merge requests:', error);
      res.status(500).json({ message: 'Failed to fetch merge requests' });
    }
  });

  // Approve/reject merge requests
  app.patch('/api/leagues/:leagueId/merge-requests/:requestId', isAuthenticated, async (req: any, res) => {
    try {
      const { leagueId, requestId } = req.params;
      const { status } = req.body; // 'approved' or 'rejected'
      const userId = req.user.claims.sub;

      // Check if user has commissioner access
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }

      const mergeRequest = await storage.updateMergeRequestStatus(requestId, status, userId);
      
      if (status === 'approved') {
        // TODO: Implement actual account merging logic
        // This would involve linking the imported player to the real user account
        // and potentially creating a league membership for the user
      }

      res.json(mergeRequest);
    } catch (error) {
      console.error('Error updating merge request:', error);
      res.status(500).json({ message: 'Failed to update merge request' });
    }
  });

  // Bulk delete routes for league management
  // Delete all players/members in a league
  app.delete('/api/leagues/:leagueId/members/all', isAuthenticated, async (req: any, res) => {
    try {
      const { leagueId } = req.params;
      const userId = req.user.claims.sub;

      // Check if user has commissioner access
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Only commissioners can delete all players' });
      }

      // Find placeholder users in this league before deleting memberships
      const placeholderMembers = await db
        .select({ userId: leagueMemberships.userId })
        .from(leagueMemberships)
        .innerJoin(users, eq(users.id, leagueMemberships.userId))
        .where(
          and(
            eq(leagueMemberships.leagueId, leagueId),
            ilike(users.email, '%@placeholder.roster')
          )
        );

      // Delete all league memberships for this league
      await db.delete(leagueMemberships).where(eq(leagueMemberships.leagueId, leagueId));

      // Delete placeholder user records that have no remaining memberships in other leagues
      for (const pm of placeholderMembers) {
        const remaining = await db.select({ id: leagueMemberships.id })
          .from(leagueMemberships)
          .where(eq(leagueMemberships.userId, pm.userId));
        if (remaining.length === 0) {
          await db.delete(users).where(eq(users.id, pm.userId));
        }
      }

      res.json({ message: 'All players deleted successfully' });
    } catch (error) {
      console.error('Error deleting all players:', error);
      res.status(500).json({ message: 'Failed to delete all players' });
    }
  });

  // Delete all teams in a league
  app.delete('/api/leagues/:leagueId/teams/all', isAuthenticated, async (req: any, res) => {
    try {
      const { leagueId } = req.params;
      const userId = req.user.claims.sub;

      // Check if user has commissioner access
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Only commissioners can delete all teams' });
      }

      // Delete all related data first to avoid foreign key constraint violations
      // 1. Unassign team references in imported_players
      await db.execute(sql`
        UPDATE imported_players 
        SET team_id = NULL 
        WHERE league_id = ${leagueId}
      `);

      // 2. Unassign teams from league memberships
      await db.execute(sql`
        UPDATE league_memberships 
        SET assigned_team_id = NULL 
        WHERE league_id = ${leagueId}
      `);

      // 3. Nullify team references in imported_schedules
      await db.execute(sql`
        UPDATE imported_schedules 
        SET home_team_id = NULL, away_team_id = NULL 
        WHERE league_id = ${leagueId}
      `);

      // 4. Delete related records that require teams
      await db.execute(sql`DELETE FROM line_combinations WHERE team_id IN (SELECT id FROM teams WHERE league_id = ${leagueId})`);
      await db.execute(sql`DELETE FROM team_memberships WHERE team_id IN (SELECT id FROM teams WHERE league_id = ${leagueId})`);
      await db.execute(sql`DELETE FROM draft_picks WHERE team_id IN (SELECT id FROM teams WHERE league_id = ${leagueId})`);
      await db.execute(sql`DELETE FROM games WHERE league_id = ${leagueId}`);

      // 5. Finally, delete all teams for this league
      await db.delete(teams).where(eq(teams.leagueId, leagueId));

      res.json({ message: 'All teams deleted successfully' });
    } catch (error) {
      console.error('Error deleting all teams:', error);
      res.status(500).json({ message: 'Failed to delete all teams' });
    }
  });

  // Delete all games in a league
  app.delete('/api/leagues/:leagueId/games/all', isAuthenticated, async (req: any, res) => {
    try {
      const { leagueId } = req.params;
      const userId = req.user.claims.sub;

      // Check if user has commissioner access
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Only commissioners can delete all games' });
      }

      // Delete all games for this league
      const result = await db.execute(sql`
        DELETE FROM games WHERE league_id = ${leagueId}
      `);

      res.json({ message: 'All games deleted successfully' });
    } catch (error) {
      console.error('Error deleting all games:', error);
      res.status(500).json({ message: 'Failed to delete all games' });
    }
  });

  // Bulk schedule upload with error handler wrapper
  app.post('/api/leagues/:leagueId/schedules/import', isAuthenticated, (req: any, res, next) => {
    upload.single('scheduleFile')(req, res, (err) => {
      if (err) {
        console.error('Multer error:', err);
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: 'File size exceeds 5MB limit' });
          }
          return res.status(400).json({ message: err.message });
        }
        return res.status(400).json({ message: err.message || 'File upload error' });
      }
      next();
    });
  }, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const userId = req.user.claims.sub;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      // Check if user has commissioner access to this league
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Only commissioners can import schedules' });
      }

      // Read and parse the CSV file
      const fileContent = fs.readFileSync(file.path, 'utf8');
      const parseResults = Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => {
          // Normalize header names - remove asterisks, lowercase, and trim
          const normalized = header.toLowerCase().trim().replace(/\*/g, '');
          const mapping: Record<string, string> = {
            'date': 'date',
            'time': 'time',
            'home team': 'homeTeam',
            'home': 'homeTeam',
            'away team': 'awayTeam',
            'away': 'awayTeam',
            'home team locker room': 'homeTeamLockerRoom',
            'home locker room': 'homeTeamLockerRoom',
            'away team locker room': 'awayTeamLockerRoom',
            'away locker room': 'awayTeamLockerRoom',
            'locker room': 'lockerRoom',
            'venue': 'venue'
          };
          return mapping[normalized] || header;
        }
      });

      if (parseResults.errors.length > 0) {
        return res.status(400).json({ 
          message: 'Error parsing CSV file', 
          errors: parseResults.errors 
        });
      }

      // Get existing teams in the league for team matching
      const existingTeams = await storage.getTeamsByLeague(leagueId);
      const teamLookup = new Map<string, string>(); // teamName -> teamId
      
      existingTeams.forEach(team => {
        // Create case-insensitive lookup
        teamLookup.set(team.name.toLowerCase().trim(), team.id);
      });

      // Process the parsed data
      const validSchedules: any[] = [];
      const errors: string[] = [];
      const teamsToCreate: Set<string> = new Set();

      parseResults.data.forEach((row: any, index: number) => {
        // Required fields validation
        if (!row.date) {
          errors.push(`Row ${index + 1}: Date is required`);
          return;
        }
        if (!row.time) {
          errors.push(`Row ${index + 1}: Time is required`);
          return;
        }
        if (!row.homeTeam) {
          errors.push(`Row ${index + 1}: Home Team is required`);
          return;
        }
        if (!row.awayTeam) {
          errors.push(`Row ${index + 1}: Away Team is required`);
          return;
        }

        // Parse date and time - treat all dates as local time (no timezone conversion)
        let gameDate: Date;
        try {
          const dateStr = row.date.trim();
          
          // Parse date manually to avoid timezone issues
          // Supports formats: YYYY-MM-DD, MM/DD/YYYY, M/D/YYYY
          let year: number, month: number, day: number;
          
          if (dateStr.includes('-')) {
            // YYYY-MM-DD format
            const parts = dateStr.split('-');
            year = parseInt(parts[0], 10);
            month = parseInt(parts[1], 10) - 1; // JavaScript months are 0-indexed
            day = parseInt(parts[2], 10);
          } else if (dateStr.includes('/')) {
            // MM/DD/YYYY format
            const parts = dateStr.split('/');
            month = parseInt(parts[0], 10) - 1;
            day = parseInt(parts[1], 10);
            year = parseInt(parts[2], 10);
          } else {
            errors.push(`Row ${index + 1}: Unrecognized date format: ${dateStr}. Use YYYY-MM-DD or MM/DD/YYYY`);
            return;
          }
          
          // Create date using local time (not UTC) by specifying year, month, day
          gameDate = new Date(year, month, day, 0, 0, 0, 0);
          
          if (isNaN(gameDate.getTime())) {
            errors.push(`Row ${index + 1}: Invalid date: ${dateStr}`);
            return;
          }
        } catch {
          errors.push(`Row ${index + 1}: Invalid date format`);
          return;
        }

        const schedule = {
          gameDate: gameDate,
          gameTime: row.time?.trim() || null,
          homeTeamName: row.homeTeam?.trim() || null,
          awayTeamName: row.awayTeam?.trim() || null,
          homeTeamId: null as string | null,
          awayTeamId: null as string | null,
          homeTeamLockerRoom: row.homeTeamLockerRoom?.trim() || null,
          awayTeamLockerRoom: row.awayTeamLockerRoom?.trim() || null,
        };

        // Try to match team names to existing teams
        if (schedule.homeTeamName) {
          const matchedHomeTeamId = teamLookup.get(schedule.homeTeamName.toLowerCase());
          if (matchedHomeTeamId) {
            schedule.homeTeamId = matchedHomeTeamId;
          } else {
            teamsToCreate.add(schedule.homeTeamName);
          }
        }

        if (schedule.awayTeamName) {
          const matchedAwayTeamId = teamLookup.get(schedule.awayTeamName.toLowerCase());
          if (matchedAwayTeamId) {
            schedule.awayTeamId = matchedAwayTeamId;
          } else {
            teamsToCreate.add(schedule.awayTeamName);
          }
        }

        validSchedules.push(schedule);
      });

      // Create missing teams
      const createdTeams = new Map<string, string>();
      for (const teamName of Array.from(teamsToCreate)) {
        try {
          const newTeam = await storage.createTeam({
            name: teamName,
            leagueId: leagueId,
            captainId: null, // Will be assigned later when players join
          });
          createdTeams.set(teamName, newTeam.id);
        } catch (error) {
          console.error(`Failed to create team ${teamName}:`, error);
          errors.push(`Failed to create team: ${teamName}`);
        }
      }

      // Update schedule team IDs with newly created teams
      validSchedules.forEach(schedule => {
        if (schedule.homeTeamName && !schedule.homeTeamId) {
          const createdTeamId = createdTeams.get(schedule.homeTeamName);
          if (createdTeamId) {
            schedule.homeTeamId = createdTeamId;
          }
        }
        if (schedule.awayTeamName && !schedule.awayTeamId) {
          const createdTeamId = createdTeams.get(schedule.awayTeamName);
          if (createdTeamId) {
            schedule.awayTeamId = createdTeamId;
          }
        }
      });

      // Create import record and imported schedules
      const importRecord = await storage.createScheduleImport({
        leagueId,
        importedBy: userId,
        fileName: file.originalname,
        totalRecords: parseResults.data.length,
        successfulRecords: validSchedules.length,
        failedRecords: errors.length
      });

      // Create imported schedule records
      let gamesCreated = 0;
      let gamesSkipped = 0;
      
      if (validSchedules.length > 0) {
        await storage.createImportedSchedules(importRecord.id, leagueId, validSchedules);
        
        // Create actual game records for valid schedules, but skip duplicates
        
        for (const schedule of validSchedules) {
          try {
            if (schedule.homeTeamId && schedule.awayTeamId) {
              // Ensure we have a valid Date object
              let scheduledAt: Date;
              if (schedule.gameDate instanceof Date) {
                scheduledAt = new Date(schedule.gameDate.getTime());
              } else {
                scheduledAt = new Date(schedule.gameDate);
              }
              
              // Validate the date
              if (isNaN(scheduledAt.getTime())) {
                console.error(`Invalid date for game ${schedule.homeTeamName} vs ${schedule.awayTeamName}:`, schedule.gameDate);
                errors.push(`Invalid date for game: ${schedule.homeTeamName} vs ${schedule.awayTeamName}`);
                continue;
              }
              
              // Parse and add time if provided
              if (schedule.gameTime) {
                const timeMatch = schedule.gameTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i);
                if (timeMatch) {
                  let hours = parseInt(timeMatch[1], 10);
                  const minutes = parseInt(timeMatch[2], 10);
                  const ampm = timeMatch[4];
                  
                  // Handle 12-hour format
                  if (ampm) {
                    if (ampm.toUpperCase() === 'PM' && hours !== 12) {
                      hours += 12;
                    } else if (ampm.toUpperCase() === 'AM' && hours === 12) {
                      hours = 0;
                    }
                  }
                  
                  if (!isNaN(hours) && !isNaN(minutes) && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
                    scheduledAt.setHours(hours, minutes, 0, 0);
                  }
                }
              }

              // Check for existing game before creating
              const existingGame = await storage.findExistingGame(
                leagueId,
                schedule.homeTeamId,
                schedule.awayTeamId,
                scheduledAt
              );

              if (existingGame) {
                gamesSkipped++;
                continue;
              }

              await storage.createGame({
                leagueId: leagueId,
                homeTeamId: schedule.homeTeamId,
                awayTeamId: schedule.awayTeamId,
                scheduledAt: scheduledAt,
                venue: null,
                homeTeamLockerRoom: schedule.homeTeamLockerRoom,
                awayTeamLockerRoom: schedule.awayTeamLockerRoom,
              });
              
              gamesCreated++;
            }
          } catch (error) {
            console.error(`Failed to create game for ${schedule.homeTeamName} vs ${schedule.awayTeamName}:`, error);
            errors.push(`Failed to create game: ${schedule.homeTeamName} vs ${schedule.awayTeamName}`);
          }
        }
      }

      // Clean up uploaded file
      fs.unlinkSync(file.path);

      res.json({
        importId: importRecord.id,
        totalRecords: parseResults.data.length,
        successfulRecords: validSchedules.length,
        failedRecords: errors.length,
        teamsCreated: createdTeams.size,
        gamesCreated: gamesCreated || 0,
        gamesSkipped: gamesSkipped || 0,
        errors
      });

    } catch (error) {
      console.error('Error importing schedules:', error);
      
      // Clean up file if it exists
      if (req.file?.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          console.error('Error cleaning up file:', cleanupError);
        }
      }
      
      res.status(500).json({ message: 'Failed to import schedules' });
    }
  });

  // Get schedule import history for a league
  app.get('/api/leagues/:leagueId/schedules/imports', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const userId = req.user.claims.sub;

      // Check if user has commissioner access
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      if (league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const imports = await storage.getScheduleImports(leagueId);
      res.json(imports);
    } catch (error) {
      console.error('Error fetching schedule import history:', error);
      res.status(500).json({ message: 'Failed to fetch schedule import history' });
    }
  });

  // Find potential merge matches for a player
  app.get('/api/leagues/:leagueId/imported-players/matches', isAuthenticated, async (req: any, res) => {
    try {
      const { leagueId } = req.params;
      const { firstName, lastName } = req.query;
      
      if (!firstName || !lastName) {
        return res.json([]);
      }
      
      const matches = await storage.findPotentialMatches(leagueId, firstName as string, lastName as string);
      res.json(matches);
    } catch (error) {
      console.error('Error finding potential matches:', error);
      res.status(500).json({ message: 'Failed to find matches' });
    }
  });

  // Search league members by name for merge functionality
  app.get('/api/leagues/:leagueId/members/search', isAuthenticated, async (req: any, res) => {
    try {
      const { leagueId } = req.params;
      const { query, excludeUserId } = req.query;
      const userId = req.user.claims.sub;

      // Check commissioner access
      const league = await storage.getLeague(leagueId);
      if (!league || league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Commissioner access required' });
      }

      // Get all league members
      const members = await storage.getLeagueMembersWithDetails(leagueId);
      
      if (!query || (query as string).trim().length === 0) {
        // Return all members (excluding the source user if specified)
        const filteredMembers = excludeUserId 
          ? members.filter(m => m.userId !== excludeUserId)
          : members;
        return res.json(filteredMembers.slice(0, 50));
      }

      const searchQuery = (query as string).toLowerCase().trim();
      
      // Filter and score members by name similarity
      const scoredMembers = members
        .filter(m => m.userId !== excludeUserId)
        .map(member => {
          const firstName = (member.displayFirstName || member.user.firstName || '').toLowerCase();
          const lastName = (member.displayLastName || member.user.lastName || '').toLowerCase();
          const fullName = `${firstName} ${lastName}`.trim();
          const email = (member.user.email || '').toLowerCase();
          
          let score = 0;
          
          // Exact match scores highest
          if (fullName === searchQuery) score = 100;
          else if (firstName === searchQuery || lastName === searchQuery) score = 90;
          // Starts with query
          else if (fullName.startsWith(searchQuery)) score = 80;
          else if (firstName.startsWith(searchQuery) || lastName.startsWith(searchQuery)) score = 70;
          // Contains query
          else if (fullName.includes(searchQuery)) score = 60;
          else if (firstName.includes(searchQuery) || lastName.includes(searchQuery)) score = 50;
          // Email contains query
          else if (email.includes(searchQuery)) score = 40;
          
          return { ...member, score };
        })
        .filter(m => m.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);

      res.json(scoredMembers);
    } catch (error) {
      console.error('Error searching league members:', error);
      res.status(500).json({ message: 'Failed to search members' });
    }
  });

  // Merge two user accounts in a league (e.g., placeholder with real user)
  app.post('/api/leagues/:leagueId/merge-player', isAuthenticated, async (req: any, res) => {
    try {
      const { leagueId } = req.params;
      const { fromUserId, toUserId, preserveName = true } = req.body;
      const userId = req.user.claims.sub;

      // Validate request body
      const mergeRequestSchema = z.object({
        fromUserId: z.string().min(1, 'From user ID is required'),
        toUserId: z.string().min(1, 'To user ID is required'),
        preserveName: z.boolean().optional().default(true),
      });

      const validatedData = mergeRequestSchema.parse({ fromUserId, toUserId, preserveName });

      if (validatedData.fromUserId === validatedData.toUserId) {
        return res.status(400).json({ message: 'Cannot merge user with themselves' });
      }

      // Check commissioner access
      const league = await storage.getLeague(leagueId);
      if (!league || league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Commissioner access required' });
      }

      // Verify both users exist and are in the league
      const [fromUser, toUser] = await Promise.all([
        storage.getUser(validatedData.fromUserId),
        storage.getUser(validatedData.toUserId)
      ]);

      if (!fromUser) {
        return res.status(404).json({ message: 'Source user not found' });
      }

      if (!toUser) {
        return res.status(404).json({ message: 'Target user not found' });
      }

      const [fromMembership, toMembership] = await Promise.all([
        storage.getUserLeagueMembership(validatedData.fromUserId, leagueId),
        storage.getUserLeagueMembership(validatedData.toUserId, leagueId)
      ]);

      if (!fromMembership) {
        return res.status(404).json({ message: 'Source user is not a member of this league' });
      }

      // Perform the merge
      const mergedMembership = await storage.mergeUsersInLeague(
        leagueId,
        validatedData.fromUserId,
        validatedData.toUserId,
        validatedData.preserveName
      );

      res.json({
        message: 'Users merged successfully',
        membership: mergedMembership,
        preservedName: validatedData.preserveName
      });

    } catch (error) {
      console.error('Failed to merge users:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: 'Invalid request data', 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: 'Failed to merge users' });
    }
  });

  // Replace a placeholder player with a registered user (keeps team assignment and transfers stats)
  app.post('/api/leagues/:leagueId/replace-player', isAuthenticated, async (req: any, res) => {
    try {
      const { leagueId } = req.params;
      const { placeholderUserId, newUserId, preserveDisplayName = true, pendingMembershipIdToDelete } = req.body;
      const userId = req.user.claims.sub;

      // Validate request body
      const replaceRequestSchema = z.object({
        placeholderUserId: z.string().min(1, 'Placeholder user ID is required'),
        newUserId: z.string().min(1, 'New user ID is required'),
        preserveDisplayName: z.boolean().optional().default(true),
        pendingMembershipIdToDelete: z.string().optional(),
      });

      const validatedData = replaceRequestSchema.parse({ placeholderUserId, newUserId, preserveDisplayName, pendingMembershipIdToDelete });

      if (validatedData.placeholderUserId === validatedData.newUserId) {
        return res.status(400).json({ message: 'Cannot replace user with themselves' });
      }

      // Check commissioner access
      const league = await storage.getLeague(leagueId);
      if (!league || league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Commissioner access required' });
      }

      // Verify new user exists
      const newUser = await storage.getUser(validatedData.newUserId);
      if (!newUser) {
        return res.status(404).json({ message: 'Target user not found' });
      }

      // Get the placeholder's membership
      const placeholderMembership = await storage.getUserLeagueMembership(validatedData.placeholderUserId, leagueId);
      if (!placeholderMembership) {
        return res.status(404).json({ message: 'Placeholder user is not a member of this league' });
      }

      // Get the placeholder user's info for response
      const placeholderUser = await storage.getUser(validatedData.placeholderUserId);
      const isPlaceholder = placeholderUser?.email?.includes('@placeholder.roster') || false;

      // Check placeholder stats for response
      const placeholderStats = await db
        .select()
        .from(playerStats)
        .where(and(
          eq(playerStats.userId, validatedData.placeholderUserId),
          eq(playerStats.leagueId, leagueId)
        ));
      
      const hasStats = placeholderStats.length > 0 && placeholderStats.some(s => 
        (s.gamesPlayed || 0) > 0 || (s.goals || 0) > 0 || (s.assists || 0) > 0
      );

      // Delete pending membership first if specified (before merge creates issues)
      // Important: Only delete a membership that belongs to the NEW user, never the placeholder
      if (validatedData.pendingMembershipIdToDelete) {
        // Verify the membership to delete belongs to the new user (not the placeholder)
        const membershipToDelete = await storage.getLeagueMembership(validatedData.pendingMembershipIdToDelete);
        if (membershipToDelete && 
            membershipToDelete.userId === validatedData.newUserId &&
            membershipToDelete.id !== placeholderMembership.id) {
          await db
            .delete(leagueMemberships)
            .where(eq(leagueMemberships.id, validatedData.pendingMembershipIdToDelete));
        }
      }

      // Use mergeUsersInLeague to properly transfer all stats, goals, assists, etc.
      const mergedMembership = await storage.mergeUsersInLeague(
        leagueId,
        validatedData.placeholderUserId, // from (placeholder)
        validatedData.newUserId, // to (real user)
        validatedData.preserveDisplayName
      );

      res.json({
        message: 'Player replaced successfully',
        membership: mergedMembership,
        preservedDisplayName: validatedData.preserveDisplayName,
        placeholderUserId: validatedData.placeholderUserId,
        placeholderName: placeholderUser ? `${placeholderUser.firstName || ''} ${placeholderUser.lastName || ''}`.trim() : null,
        isPlaceholder: isPlaceholder,
        hadStats: hasStats,
        statsTransferred: hasStats
      });

    } catch (error: any) {
      console.error('Failed to replace player:', error);
      console.error('Replace player error details:', {
        message: error?.message,
        stack: error?.stack,
        code: error?.code
      });
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: 'Invalid request data', 
          errors: error.errors 
        });
      }
      // Return more specific error message
      const errorMessage = error?.message || 'Failed to replace player';
      res.status(500).json({ message: errorMessage });
    }
  });

  // Merge an imported player with a real user account
  app.post('/api/leagues/:leagueId/players/merge', isAuthenticated, async (req: any, res) => {
    try {
      const { leagueId } = req.params;
      const { membershipId, importedPlayerId } = req.body;
      const userId = req.user.claims.sub;

      // Validate required fields
      if (!membershipId || !importedPlayerId) {
        return res.status(400).json({ message: 'Missing required fields: membershipId and importedPlayerId are required' });
      }

      // Check commissioner access
      const league = await storage.getLeague(leagueId);
      if (!league || league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Get the imported player details
      const importedPlayer = await db.select()
        .from(importedPlayers)
        .where(eq(importedPlayers.id, importedPlayerId))
        .limit(1);

      if (!importedPlayer.length) {
        return res.status(404).json({ message: 'Imported player not found' });
      }

      const player = importedPlayer[0];

      // Get the membership first to verify it exists
      const membershipCheck = await db.select().from(leagueMemberships).where(eq(leagueMemberships.id, membershipId)).limit(1);
      if (!membershipCheck.length) {
        return res.status(404).json({ message: 'Membership not found' });
      }

      const realUserId = membershipCheck[0].userId;

      // Approve the membership and assign to team if available
      await storage.approveLeagueMembership(membershipId, userId);

      // If imported player has team info, assign the user to that team
      if (player.teamName) {
        // Find or create the team
        let team = await db.select()
          .from(teams)
          .where(and(eq(teams.leagueId, leagueId), eq(teams.name, player.teamName)))
          .limit(1);

        if (!team.length) {
          // Create team if it doesn't exist
          const newTeam = await storage.createTeam({
            name: player.teamName,
            leagueId: leagueId,
          });
          team = [newTeam];
        }

        // Assign the user to the team
        await db.update(leagueMemberships)
          .set({ assignedTeamId: team[0].id })
          .where(eq(leagueMemberships.id, membershipId));

        // Sync team chat participants after team assignment
        try {
          await messagingService.syncTeamChatParticipants(team[0].id, leagueId);
        } catch (error) {
          console.error('Error syncing team chat after merge team assignment:', error);
        }
      }

      // Find and delete the placeholder user's league membership
      // Placeholder users have emails ending with @placeholder.roster
      // Only attempt to find placeholder if we have both first and last name
      if (player.firstName && player.lastName) {
        const placeholderMemberships = await db.select()
          .from(leagueMemberships)
          .innerJoin(users, eq(leagueMemberships.userId, users.id))
          .where(
            and(
              eq(leagueMemberships.leagueId, leagueId),
              ilike(users.email, '%@placeholder.roster'),
              ilike(users.firstName, player.firstName),
              ilike(users.lastName, player.lastName)
            )
          );
        
        // Delete placeholder memberships
        for (const pm of placeholderMemberships) {
          const placeholderUserId = pm.league_memberships.userId;
          
          // Only delete if it's not the real user
          if (placeholderUserId !== realUserId) {
            await db.delete(leagueMemberships)
              .where(eq(leagueMemberships.id, pm.league_memberships.id));
            
            // Optionally delete the placeholder user if they have no other memberships
            const otherMemberships = await db.select()
              .from(leagueMemberships)
              .where(eq(leagueMemberships.userId, placeholderUserId));
            
            if (otherMemberships.length === 0) {
              await db.delete(users).where(eq(users.id, placeholderUserId));
            }
          }
        }
      }
      
      // Mark the imported player as merged
      await db.update(importedPlayers)
        .set({ 
          mergedWithUserId: realUserId,
          mergedAt: new Date()
        })
        .where(eq(importedPlayers.id, importedPlayerId));

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error merging player:', error);
      console.error('Error stack:', error?.stack);
      res.status(500).json({ message: 'Failed to merge player', error: error?.message });
    }
  });

  // Leave a league (reverse of player merge)
  app.post('/api/leagues/:leagueId/leave', isAuthenticated, async (req: any, res) => {
    try {
      const { leagueId } = req.params;
      const userId = req.user.claims.sub;

      // Check if user is actually a member of this league
      const membership = await storage.getUserLeagueMembership(userId, leagueId);
      if (!membership) {
        return res.status(404).json({ message: 'You are not a member of this league' });
      }

      // Check if user is the commissioner - prevent them from leaving their own league
      const league = await storage.getLeague(leagueId);
      if (league && league.commissionerId === userId) {
        return res.status(403).json({ message: 'Commissioners cannot leave their own league. Please transfer commissioner role first.' });
      }

      // Leave the league (this will detach from imported player and clean up memberships)
      await storage.leaveLeague(userId, leagueId);

      res.json({ success: true, message: 'Successfully left the league' });
    } catch (error: any) {
      console.error('Error leaving league:', error);
      
      // Map internal error codes to user-friendly messages
      if (error.message === 'MEMBERSHIP_NOT_FOUND') {
        return res.status(404).json({ message: 'You are not a member of this league' });
      }
      
      // Generic error for unexpected issues
      res.status(500).json({ message: 'Unable to leave league. Please try again.' });
    }
  });


  // Announcement routes

  // Get unread announcements count for a league
  app.get('/api/leagues/:leagueId/announcements/unread-count', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const userId = req.user.claims.sub;

      // Check if user is member of the league
      const membership = await storage.getUserLeagueMembership(userId, leagueId);
      if (!membership || membership.status !== 'approved') {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Get actual unread count using proper read tracking
      const unreadCount = await storage.getUnreadAnnouncementCount(leagueId, userId);
      
      res.json({ count: unreadCount });
    } catch (error) {
      console.error('Error getting unread announcement count:', error);
      res.status(500).json({ message: 'Failed to get unread count' });
    }
  });

  // Mark announcements as read for a league
  app.post('/api/leagues/:leagueId/announcements/mark-read', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const userId = req.user.claims.sub;

      // Check if user is member of the league
      const membership = await storage.getUserLeagueMembership(userId, leagueId);
      if (!membership || membership.status !== 'approved') {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Mark ALL visible announcements in the league as read for this user using bulk insert
      // Only mark announcements that the user can actually see (respecting visibility rules)
      const result = await db.execute(sql`
        INSERT INTO announcement_read_status (id, announcement_id, user_id, read_at)
        SELECT gen_random_uuid(), a.id, ${userId}, NOW()
        FROM announcements a 
        WHERE a.league_id = ${leagueId}
        AND (
          NOT EXISTS (
            SELECT 1 FROM announcement_visibility av 
            WHERE av.announcement_id = a.id
          )
          OR 
          EXISTS (
            SELECT 1 FROM announcement_visibility av 
            WHERE av.announcement_id = a.id AND av.user_id = ${userId}
          )
        )
        ON CONFLICT (announcement_id, user_id) DO NOTHING
      `);

      res.json({ success: true });
    } catch (error) {
      console.error('Error marking announcements as read:', error);
      res.status(500).json({ message: 'Failed to mark as read' });
    }
  });
  
  // Get announcements for a league
  app.get('/api/leagues/:leagueId/announcements', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const userId = req.user.claims.sub;

      // Check if user is member of the league
      const membership = await storage.getUserLeagueMembership(userId, leagueId);
      if (!membership || membership.status !== 'approved') {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Parse and validate query parameters
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20)); // Default 20, max 50
      const orderBy = req.query.orderBy === 'createdAt' ? 'createdAt' : 'createdAt'; // Only support createdAt for now
      const orderDirection = req.query.orderDirection === 'asc' ? 'asc' : 'desc'; // Default desc (newest first)
      const offset = (page - 1) * limit;

      // Get announcements with visibility filtering handled at SQL level
      const result = await storage.getLeagueAnnouncements(leagueId, {
        limit,
        offset,
        orderBy,
        orderDirection,
      }, userId);

      // Convert attachment URLs to signed URLs (like messages do)
      const { SupabaseStorageService } = await import('./supabaseStorage');
      const supabaseStorageService = new SupabaseStorageService();
      
      const announcementsWithSignedUrls = await Promise.all(
        result.announcements.map(async (announcement: any) => {
          const commentCount = await storage.getAnnouncementCommentCount(announcement.id);
          let enriched = { ...announcement, commentCount };
          if (announcement.attachments && announcement.attachments.length > 0) {
            const attachmentsWithSignedUrls = await Promise.all(
              announcement.attachments.map(async (attachment: any) => {
                if (attachment.url && attachment.url.startsWith('/announcement-media/')) {
                  const signedUrl = await supabaseStorageService.getAnnouncementMediaSignedUrl(attachment.url);
                  return {
                    ...attachment,
                    url: signedUrl || attachment.url
                  };
                }
                return attachment;
              })
            );
            enriched = { ...enriched, attachments: attachmentsWithSignedUrls };
          }
          return enriched;
        })
      );

      // Pagination is now accurate since visibility filtering happens in SQL
      // Add no-cache headers to ensure fresh data
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.json({
        announcements: announcementsWithSignedUrls,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
          hasNext: page * limit < result.total,
          hasPrev: page > 1,
        },
      });
    } catch (error) {
      console.error('Error fetching announcements:', error);
      res.status(500).json({ message: 'Failed to fetch announcements' });
    }
  });

  // Create announcement (commissioner or team captain)
  app.post('/api/leagues/:leagueId/announcements', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const userId = req.user.claims.sub;

      // Check if user has Player Pro or Commissioner tier
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      const postingUser = await storage.getUser(userId);
      if (!postingUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Verify user is a member of this league
      const membership = await storage.getUserLeagueMembership(userId, leagueId);
      if (!membership || membership.status !== 'approved') {
        return res.status(403).json({ message: 'You must be an approved league member to post' });
      }

      const isCommissioner = league.commissionerId === userId;
      const userRole = postingUser.role || 'free_tier';
      const roleHierarchy: Record<string, number> = { free_tier: 0, player_pro: 1, secondary_commissioner: 2, commissioner: 3 };
      const hasPlayerProOrHigher = (roleHierarchy[userRole] || 0) >= roleHierarchy['player_pro'];

      if (!hasPlayerProOrHigher) {
        return res.status(403).json({ message: 'Player Pro or Commissioner tier required to post' });
      }

      // Check if user is a team captain in this league
      const teams = await storage.getTeamsByLeague(leagueId);
      const captainTeam = teams.find(team => team.captainId === userId);
      const isTeamCaptain = !!captainTeam;

      const requestBody = req.body;
      const { targetUserIds, ...announcementData } = createAnnouncementRequestSchema.parse(requestBody);

      // Enforce commissioner-only pinning
      if (announcementData.isPinned && !isCommissioner) {
        announcementData.isPinned = false;
      }
      
      // Set teamId based on user role:
      // - Commissioner posts: teamId = null (visible to everyone in league)
      // - Team captain posts: teamId = their team's ID (visible only to their team)
      const teamId = isCommissioner ? null : (captainTeam?.id || null);
      
      let announcement;
      
      // Validate targetUserIds if provided - ensure they are league members
      if (targetUserIds && targetUserIds.length > 0) {
        const validUserIds = [];
        for (const targetUserId of targetUserIds) {
          const membership = await storage.getUserLeagueMembership(targetUserId, leagueId);
          if (membership && membership.status === 'approved') {
            validUserIds.push(targetUserId);
          }
        }
        
        if (validUserIds.length === 0) {
          return res.status(400).json({ message: 'None of the specified users are valid league members' });
        }
        
        // Create announcement
        announcement = await storage.createAnnouncement({
          ...announcementData,
          leagueId,
          authorId: userId,
          teamId,
        });
        
        // Create visibility records for targeted users + author
        const visibilityUserIds = Array.from(new Set([...validUserIds, userId])); // Include author and remove duplicates
        await storage.createAnnouncementVisibility(announcement.id, visibilityUserIds);
      } else {
        // Create regular announcement
        // Commissioner: visible to all league members (teamId = null)
        // Team Captain: visible only to their team (teamId = team's ID)
        announcement = await storage.createAnnouncement({
          ...announcementData,
          leagueId,
          authorId: userId,
          teamId,
        });
      }

      // Handle attachments if provided
      if (requestBody.attachments && Array.isArray(requestBody.attachments)) {
        for (const attachment of requestBody.attachments) {
          await storage.createAnnouncementAttachment({
            announcementId: announcement.id,
            type: attachment.type,
            url: attachment.url,
            filename: attachment.fileName,
          });
        }
      }

      // Handle poll if provided
      if (requestBody.poll && requestBody.poll.question) {
        await storage.createAnnouncementPoll({
          announcementId: announcement.id,
          question: requestBody.poll.question,
          options: requestBody.poll.options,
          allowMultiple: requestBody.poll.allowMultiple || false,
        });
      }

      // Return the full announcement with attachments and polls
      const fullAnnouncement = await storage.getAnnouncement(announcement.id);
      
      // Send push notifications to relevant users
      try {
        const author = await storage.getUser(userId);
        const authorName = author ? `${author.firstName || ''} ${author.lastName || ''}`.trim() || 'Someone' : 'Someone';
        
        let recipientUserIds: string[] = [];
        
        if (targetUserIds && targetUserIds.length > 0) {
          // Targeted announcement - send to targeted users (excluding author)
          recipientUserIds = targetUserIds.filter(id => id !== userId);
        } else if (teamId) {
          // Team announcement - send to team members
          const teamMembers = await storage.getTeamMembers(teamId);
          recipientUserIds = teamMembers
            .filter(m => m.user.id !== userId)
            .map(m => m.user.id);
        } else {
          // League-wide announcement - send to all approved league members
          const leagueMembers = await storage.getLeagueMemberships(leagueId);
          recipientUserIds = leagueMembers
            .filter(m => m.status === 'approved' && m.userId !== userId)
            .map(m => m.userId);
        }
        
        if (recipientUserIds.length > 0) {
          const { sendAnnouncementPushNotification } = await import('./oneSignalNotifications');
          const contentPreview = announcementData.content || '';
          let pushSuccessCount = 0;
          for (const recipientId of recipientUserIds) {
            try {
              const pushResult = await sendAnnouncementPushNotification(
                recipientId,
                authorName,
                contentPreview,
                league.name,
                announcement.id
              );
              if (pushResult) pushSuccessCount++;
              console.log(`[Push] Announcement push to ${recipientId}: ${pushResult ? 'sent' : 'skipped/failed'}`);
            } catch (pushError) {
              console.error(`[Push] Failed to send announcement push to ${recipientId}:`, pushError);
            }
          }
        }
      } catch (notificationError) {
        console.error('Failed to send announcement push notifications:', notificationError);
        // Don't fail the request if notifications fail
      }
      
      res.json(fullAnnouncement);
    } catch (error) {
      console.error('Error creating announcement:', error);
      res.status(500).json({ message: 'Failed to create announcement' });
    }
  });

  // Update announcement (commissioner or author)
  app.patch('/api/announcements/:id', isAuthenticated, async (req: any, res) => {
    try {
      const announcementId = req.params.id;
      const userId = req.user.claims.sub;

      // Get announcement to check permissions
      const announcement = await storage.getAnnouncement(announcementId);
      if (!announcement) {
        return res.status(404).json({ message: 'Announcement not found' });
      }

      // Check if user is commissioner of the league or the author of the announcement
      const league = await storage.getLeague(announcement.leagueId);
      const isCommissioner = league && league.commissionerId === userId;
      const isAuthor = announcement.authorId === userId;

      if (!isCommissioner && !isAuthor) {
        return res.status(403).json({ message: 'Only commissioners and announcement authors can edit announcements' });
      }

      const updates = updateAnnouncementRequestSchema.parse(req.body);

      // Enforce commissioner-only pinning on updates
      if (updates.isPinned !== undefined && updates.isPinned && !isCommissioner) {
        updates.isPinned = false;
      }

      const updatedAnnouncement = await storage.updateAnnouncement(announcementId, updates);
      res.json(updatedAnnouncement);
    } catch (error) {
      console.error('Error updating announcement:', error);
      res.status(500).json({ message: 'Failed to update announcement' });
    }
  });

  // Delete announcement (commissioner or author)
  app.delete('/api/announcements/:id', isAuthenticated, async (req: any, res) => {
    try {
      const announcementId = req.params.id;
      const userId = req.user.claims.sub;

      // Get announcement to check permissions
      const announcement = await storage.getAnnouncement(announcementId);
      if (!announcement) {
        return res.status(404).json({ message: 'Announcement not found' });
      }

      // Check if user is commissioner of the league or the author of the announcement
      const league = await storage.getLeague(announcement.leagueId);
      const isCommissioner = league && league.commissionerId === userId;
      const isAuthor = announcement.authorId === userId;

      if (!isCommissioner && !isAuthor) {
        return res.status(403).json({ message: 'Only commissioners and announcement authors can delete announcements' });
      }

      await storage.deleteAnnouncement(announcementId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting announcement:', error);
      res.status(500).json({ message: 'Failed to delete announcement' });
    }
  });

  // Add reaction to announcement
  app.post('/api/announcements/:id/reactions', isAuthenticated, async (req: any, res) => {
    try {
      const announcementId = req.params.id;
      const userId = req.user.claims.sub;
      const { emoji } = req.body;

      if (!emoji) {
        return res.status(400).json({ message: 'Emoji is required' });
      }

      // Check if announcement exists
      const announcement = await storage.getAnnouncement(announcementId);
      if (!announcement) {
        return res.status(404).json({ message: 'Announcement not found' });
      }

      // Verify user access (either league member or tournament participant)
      if (announcement.leagueId) {
        // League announcement - check league membership
        const membership = await storage.getUserLeagueMembership(userId, announcement.leagueId);
        if (!membership || membership.status !== 'approved') {
          return res.status(404).json({ message: 'Announcement not found' });
        }
      } else if (announcement.tournamentId) {
        // Tournament announcement - check tournament participation
        const [participant] = await db
          .select()
          .from(tournamentParticipants)
          .where(
            and(
              eq(tournamentParticipants.tournamentId, announcement.tournamentId),
              eq(tournamentParticipants.userId, userId),
              eq(tournamentParticipants.status, 'approved')
            )
          );
        
        if (!participant) {
          return res.status(404).json({ message: 'Announcement not found' });
        }
      }

      // Check visibility for targeted announcements
      const isVisible = await storage.isAnnouncementVisibleToUser(announcementId, userId);
      if (!isVisible) {
        return res.status(404).json({ message: 'Announcement not found' });
      }

      const reaction = await storage.addAnnouncementReaction({
        announcementId,
        userId,
        emoji,
      });

      res.json(reaction);
    } catch (error) {
      console.error('Error adding reaction:', error);
      res.status(500).json({ message: 'Failed to add reaction' });
    }
  });

  // Remove reaction from announcement
  app.delete('/api/announcements/:id/reactions', isAuthenticated, async (req: any, res) => {
    try {
      const announcementId = req.params.id;
      const userId = req.user.claims.sub;
      const { emoji } = req.body;

      if (!emoji) {
        return res.status(400).json({ message: 'Emoji is required' });
      }

      // Check if announcement exists and user has access (visibility check)
      const announcement = await storage.getAnnouncement(announcementId);
      if (!announcement) {
        return res.status(404).json({ message: 'Announcement not found' });
      }

      // Verify user access (either league member or tournament participant)
      if (announcement.leagueId) {
        // League announcement - check league membership
        const membership = await storage.getUserLeagueMembership(userId, announcement.leagueId);
        if (!membership || membership.status !== 'approved') {
          return res.status(403).json({ message: 'Access denied' });
        }
      } else if (announcement.tournamentId) {
        // Tournament announcement - check tournament participation
        const [participant] = await db
          .select()
          .from(tournamentParticipants)
          .where(
            and(
              eq(tournamentParticipants.tournamentId, announcement.tournamentId),
              eq(tournamentParticipants.userId, userId),
              eq(tournamentParticipants.status, 'approved')
            )
          );
        
        if (!participant) {
          return res.status(403).json({ message: 'Access denied' });
        }
      }

      // Check if announcement is visible to this user (targeted visibility)
      const isVisible = await storage.isAnnouncementVisibleToUser(announcementId, userId);
      if (!isVisible) {
        return res.status(404).json({ message: 'Announcement not found' }); // Return 404 to not reveal existence
      }

      await storage.removeAnnouncementReaction(announcementId, userId, emoji);
      res.json({ success: true });
    } catch (error) {
      console.error('Error removing reaction:', error);
      res.status(500).json({ message: 'Failed to remove reaction' });
    }
  });

  // Get comments for an announcement
  app.get('/api/announcements/:id/comments', isAuthenticated, async (req: any, res) => {
    try {
      const announcementId = req.params.id;
      const userId = req.user.claims.sub;

      const announcement = await storage.getAnnouncement(announcementId);
      if (!announcement) {
        return res.status(404).json({ message: 'Announcement not found' });
      }

      const isVisible = await storage.isAnnouncementVisibleToUser(announcementId, userId);
      if (!isVisible) {
        return res.status(404).json({ message: 'Announcement not found' });
      }

      const comments = await storage.getAnnouncementComments(announcementId);
      res.json(comments);
    } catch (error) {
      console.error('Error fetching comments:', error);
      res.status(500).json({ message: 'Failed to fetch comments' });
    }
  });

  // Create a comment on an announcement (Player Pro or Commissioner tier required)
  app.post('/api/announcements/:id/comments', isAuthenticated, async (req: any, res) => {
    try {
      const announcementId = req.params.id;
      const userId = req.user.claims.sub;
      const { content } = req.body;

      if (!content || !content.trim()) {
        return res.status(400).json({ message: 'Comment content is required' });
      }

      const announcement = await storage.getAnnouncement(announcementId);
      if (!announcement) {
        return res.status(404).json({ message: 'Announcement not found' });
      }

      const isVisible = await storage.isAnnouncementVisibleToUser(announcementId, userId);
      if (!isVisible) {
        return res.status(404).json({ message: 'Announcement not found' });
      }

      const commentUser = await storage.getUser(userId);
      if (!commentUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      const userRole = commentUser.role || 'free_tier';
      const roleHierarchy: Record<string, number> = { free_tier: 0, player_pro: 1, secondary_commissioner: 2, commissioner: 3 };
      const hasPlayerProOrHigher = (roleHierarchy[userRole] || 0) >= roleHierarchy['player_pro'];

      if (!hasPlayerProOrHigher) {
        return res.status(403).json({ message: 'Player Pro or Commissioner tier required to comment' });
      }

      const { parentId } = req.body;

      const commentData: any = {
        announcementId,
        authorId: userId,
        content: content.trim(),
      };
      if (parentId) {
        commentData.parentId = parentId;
      }

      const comment = await storage.createAnnouncementComment(commentData);

      // Send push notification for replies to comments
      if (parentId) {
        try {
          const parentComment = await storage.getAnnouncementComment(parentId);
          if (parentComment && parentComment.authorId !== userId) {
            const replier = await storage.getUser(userId);
            const replierName = replier ? `${replier.firstName || ''} ${replier.lastName || ''}`.trim() || 'Someone' : 'Someone';
            
            const league = announcement.leagueId ? await storage.getLeague(announcement.leagueId) : null;
            const leagueName = league?.name || 'League';
            
            const { sendWallReplyPushNotification } = await import('./oneSignalNotifications');
            await sendWallReplyPushNotification(
              parentComment.authorId,
              replierName,
              content.trim(),
              leagueName,
              announcementId
            );
          }
        } catch (notifError) {
          console.error('Failed to send wall reply push notification:', notifError);
        }
      }

      const comments = await storage.getAnnouncementComments(announcementId);
      const createdComment = comments.find(c => c.id === comment.id);
      res.json(createdComment || comment);
    } catch (error) {
      console.error('Error creating comment:', error);
      res.status(500).json({ message: 'Failed to create comment' });
    }
  });

  // Get comment count for an announcement
  app.get('/api/announcements/:id/comment-count', isAuthenticated, async (req: any, res) => {
    try {
      const announcementId = req.params.id;
      const count = await storage.getAnnouncementCommentCount(announcementId);
      res.json({ count });
    } catch (error) {
      console.error('Error fetching comment count:', error);
      res.status(500).json({ message: 'Failed to fetch comment count' });
    }
  });

  // Delete a comment (only by the comment author)
  app.delete('/api/announcements/comments/:commentId', isAuthenticated, async (req: any, res) => {
    try {
      const { commentId } = req.params;
      const userId = req.user.claims.sub;

      const comment = await storage.getAnnouncementComment(commentId);
      if (!comment) {
        return res.status(404).json({ message: 'Comment not found' });
      }

      if (comment.authorId !== userId) {
        return res.status(403).json({ message: 'You can only delete your own comments' });
      }

      await storage.deleteAnnouncementComment(commentId);
      res.json({ message: 'Comment deleted' });
    } catch (error) {
      console.error('Error deleting comment:', error);
      res.status(500).json({ message: 'Failed to delete comment' });
    }
  });

  // Create poll for announcement (commissioner only)
  app.post('/api/announcements/:id/polls', isAuthenticated, async (req: any, res) => {
    try {
      const announcementId = req.params.id;
      const userId = req.user.claims.sub;

      // Get announcement to check permissions
      const announcement = await storage.getAnnouncement(announcementId);
      if (!announcement) {
        return res.status(404).json({ message: 'Announcement not found' });
      }

      // Check if user is commissioner of the league
      const league = await storage.getLeague(announcement.leagueId);
      if (!league || league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Only commissioners can create polls' });
      }

      // Commissioners can create polls on all announcements in their leagues regardless of visibility

      const pollData = createAnnouncementPollRequestSchema.parse(req.body);
      const poll = await storage.createAnnouncementPoll({
        ...pollData,
        announcementId,
      });

      res.json(poll);
    } catch (error) {
      console.error('Error creating poll:', error);
      res.status(500).json({ message: 'Failed to create poll' });
    }
  });

  // Vote on poll
  app.post('/api/polls/:id/votes', isAuthenticated, async (req: any, res) => {
    try {
      const pollId = req.params.id;
      const userId = req.user.claims.sub;
      const { optionIndex } = req.body;

      if (optionIndex === undefined || optionIndex < 0) {
        return res.status(400).json({ message: 'Valid option index is required' });
      }

      // First get the poll to find the announcement it belongs to
      try {
        const polls = await db.select().from(announcementPolls).where(eq(announcementPolls.id, pollId));
        if (polls.length === 0) {
          return res.status(404).json({ message: 'Poll not found' });
        }
        
        const announcement = await storage.getAnnouncement(polls[0].announcementId);
        if (!announcement) {
          return res.status(404).json({ message: 'Announcement not found' });
        }

        const membership = await storage.getUserLeagueMembership(userId, announcement.leagueId);
        if (!membership || membership.status !== 'approved') {
          return res.status(403).json({ message: 'Access denied' });
        }

        // Check if announcement is visible to this user (targeted visibility)
        const isVisible = await storage.isAnnouncementVisibleToUser(announcement.id, userId);
        if (!isVisible) {
          return res.status(404).json({ message: 'Poll not found' }); // Return 404 to not reveal existence
        }
      } catch (error) {
        console.error('Error checking poll visibility:', error);
        return res.status(404).json({ message: 'Poll not found' });
      }

      const voteData = insertAnnouncementPollVoteSchema.parse({
        pollId,
        userId,
        optionIndex,
      });

      const vote = await storage.voteOnPoll(voteData);
      res.json(vote);
    } catch (error) {
      console.error('Error voting on poll:', error);
      res.status(500).json({ message: 'Failed to vote on poll' });
    }
  });

  // Get poll results
  app.get('/api/polls/:id/results', isAuthenticated, async (req: any, res) => {
    try {
      const pollId = req.params.id;
      const userId = req.user.claims.sub;

      // First get the poll to find the announcement it belongs to
      const polls = await db.select().from(announcementPolls).where(eq(announcementPolls.id, pollId));
      if (polls.length === 0) {
        return res.status(404).json({ message: 'Poll not found' });
      }
      
      const announcement = await storage.getAnnouncement(polls[0].announcementId);
      if (!announcement) {
        return res.status(404).json({ message: 'Announcement not found' });
      }

      const membership = await storage.getUserLeagueMembership(userId, announcement.leagueId);
      if (!membership || membership.status !== 'approved') {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Check if announcement is visible to this user (targeted visibility)
      const isVisible = await storage.isAnnouncementVisibleToUser(announcement.id, userId);
      if (!isVisible) {
        return res.status(404).json({ message: 'Poll not found' }); // Return 404 to not reveal existence
      }

      const results = await storage.getPollResults(pollId);
      res.json(results);
    } catch (error) {
      console.error('Error getting poll results:', error);
      res.status(500).json({ message: 'Failed to get poll results' });
    }
  });

  // Add attachment to announcement (commissioner only)
  app.post('/api/announcements/:id/attachments', isAuthenticated, async (req: any, res) => {
    try {
      const announcementId = req.params.id;
      const userId = req.user.claims.sub;

      // Get announcement to check permissions
      const announcement = await storage.getAnnouncement(announcementId);
      if (!announcement) {
        return res.status(404).json({ message: 'Announcement not found' });
      }

      // Check if user is commissioner of the league
      const league = await storage.getLeague(announcement.leagueId);
      if (!league || league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Only commissioners can add attachments' });
      }

      const attachmentData = insertAnnouncementAttachmentSchema.parse(req.body);
      const attachment = await storage.createAnnouncementAttachment({
        ...attachmentData,
        announcementId,
      });

      res.json(attachment);
    } catch (error) {
      console.error('Error adding attachment:', error);
      res.status(500).json({ message: 'Failed to add attachment' });
    }
  });

  // ========== TOURNAMENT ANNOUNCEMENT ROUTES ==========

  // Get unread tournament announcements count
  app.get('/api/tournaments/:tournamentId/announcements/unread-count', isAuthenticated, async (req: any, res) => {
    try {
      const tournamentId = req.params.tournamentId;
      const userId = req.user.claims.sub;

      // Check if user is tournament participant
      const [participant] = await db
        .select()
        .from(tournamentParticipants)
        .where(
          and(
            eq(tournamentParticipants.tournamentId, tournamentId),
            eq(tournamentParticipants.userId, userId),
            eq(tournamentParticipants.status, 'approved')
          )
        );

      if (!participant) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Get actual unread count using proper read tracking
      const unreadCount = await storage.getUnreadTournamentAnnouncementCount(tournamentId, userId);
      
      res.json({ count: unreadCount });
    } catch (error) {
      console.error('Error getting unread tournament announcement count:', error);
      res.status(500).json({ message: 'Failed to get unread count' });
    }
  });

  // Get announcements for a tournament
  app.get('/api/tournaments/:tournamentId/announcements', isAuthenticated, async (req: any, res) => {
    try {
      const tournamentId = req.params.tournamentId;
      const userId = req.user.claims.sub;

      // Check if user is tournament participant
      const [participant] = await db
        .select()
        .from(tournamentParticipants)
        .where(
          and(
            eq(tournamentParticipants.tournamentId, tournamentId),
            eq(tournamentParticipants.userId, userId),
            eq(tournamentParticipants.status, 'approved')
          )
        );

      if (!participant) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Parse and validate query parameters
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20)); // Default 20, max 50
      const orderBy = req.query.orderBy === 'createdAt' ? 'createdAt' : 'createdAt'; // Only support createdAt for now
      const orderDirection = req.query.orderDirection === 'asc' ? 'asc' : 'desc'; // Default desc (newest first)
      const offset = (page - 1) * limit;

      // Get announcements with visibility filtering handled at SQL level
      const result = await storage.getTournamentAnnouncements(tournamentId, {
        limit,
        offset,
        orderBy,
        orderDirection,
      }, userId);

      // Convert attachment URLs to signed URLs (like messages do)
      const { SupabaseStorageService } = await import('./supabaseStorage');
      const supabaseStorageService = new SupabaseStorageService();
      
      const announcementsWithSignedUrls = await Promise.all(
        result.announcements.map(async (announcement: any) => {
          const commentCount = await storage.getAnnouncementCommentCount(announcement.id);
          let enriched = { ...announcement, commentCount };
          if (announcement.attachments && announcement.attachments.length > 0) {
            const attachmentsWithSignedUrls = await Promise.all(
              announcement.attachments.map(async (attachment: any) => {
                if (attachment.url && attachment.url.startsWith('/announcement-media/')) {
                  const signedUrl = await supabaseStorageService.getAnnouncementMediaSignedUrl(attachment.url);
                  return {
                    ...attachment,
                    url: signedUrl || attachment.url
                  };
                }
                return attachment;
              })
            );
            enriched = { ...enriched, attachments: attachmentsWithSignedUrls };
          }
          return enriched;
        })
      );

      // Pagination is now accurate since visibility filtering happens in SQL
      res.json({
        announcements: announcementsWithSignedUrls,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
          hasNext: page * limit < result.total,
          hasPrev: page > 1,
        },
      });
    } catch (error) {
      console.error('Error fetching tournament announcements:', error);
      res.status(500).json({ message: 'Failed to fetch announcements' });
    }
  });

  // Create tournament announcement (commissioner only)
  app.post('/api/tournaments/:tournamentId/announcements', isAuthenticated, async (req: any, res) => {
    try {
      const tournamentId = req.params.tournamentId;
      const userId = req.user.claims.sub;

      // Check if user is tournament commissioner
      const [tournament] = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, tournamentId));

      if (!tournament) {
        return res.status(404).json({ message: 'Tournament not found' });
      }

      // Check if user has commissioner access - either tournament creator or league commissioner/co-commissioner
      let isCommissioner = tournament.createdBy === userId;
      
      if (!isCommissioner && tournament.leagueId) {
        const user = await storage.getUser(userId);
        if (user) {
          const { canManageLeagueSpecific } = await import('./permissionMiddleware');
          isCommissioner = await canManageLeagueSpecific(user as any, tournament.leagueId);
        }
      }

      if (!isCommissioner) {
        return res.status(403).json({ message: 'Only tournament commissioners can create announcements' });
      }

      const requestBody = req.body;
      
      const { targetUserIds, ...announcementData } = createAnnouncementRequestSchema.parse(requestBody);
      
      let announcement;
      
      // Validate targetUserIds if provided - ensure they are tournament participants
      if (targetUserIds && targetUserIds.length > 0) {
        const validUserIds = [];
        for (const targetUserId of targetUserIds) {
          const [participant] = await db
            .select()
            .from(tournamentParticipants)
            .where(
              and(
                eq(tournamentParticipants.tournamentId, tournamentId),
                eq(tournamentParticipants.userId, targetUserId),
                eq(tournamentParticipants.status, 'approved')
              )
            );
          
          if (participant) {
            validUserIds.push(targetUserId);
          } else {
            console.warn(`⚠️ User ${targetUserId} is not an approved participant of tournament ${tournamentId}, excluding from targets`);
          }
        }
        
        if (validUserIds.length === 0) {
          return res.status(400).json({ message: 'None of the specified users are valid tournament participants' });
        }
        
        // Create announcement
        announcement = await storage.createAnnouncement({
          ...announcementData,
          tournamentId,
          authorId: userId,
          teamId: null,
        });
        
        // Create visibility records for targeted users + author
        const visibilityUserIds = Array.from(new Set([...validUserIds, userId])); // Include author and remove duplicates
        await storage.createAnnouncementVisibility(announcement.id, visibilityUserIds);
        
      } else {
        // Create regular announcement visible to all tournament participants
        announcement = await storage.createAnnouncement({
          ...announcementData,
          tournamentId,
          authorId: userId,
          teamId: null,
        });
        
      }

      // Handle attachments if provided
      if (requestBody.attachments && Array.isArray(requestBody.attachments)) {
        for (const attachment of requestBody.attachments) {
          await storage.createAnnouncementAttachment({
            announcementId: announcement.id,
            type: attachment.type,
            url: attachment.url,
            filename: attachment.fileName,
          });
        }
      }

      // Handle poll if provided
      if (requestBody.poll && requestBody.poll.question) {
        await storage.createAnnouncementPoll({
          announcementId: announcement.id,
          question: requestBody.poll.question,
          options: requestBody.poll.options,
          allowMultiple: requestBody.poll.allowMultiple || false,
        });
      }

      // Return the full announcement with attachments and polls
      const fullAnnouncement = await storage.getAnnouncement(announcement.id);
      
      // Send push notifications to tournament participants
      try {
        const author = await storage.getUser(userId);
        const authorName = author ? `${author.firstName || ''} ${author.lastName || ''}`.trim() || 'Someone' : 'Someone';
        
        let recipientUserIds: string[] = [];
        
        if (targetUserIds && targetUserIds.length > 0) {
          // Targeted announcement - send to targeted users (excluding author)
          recipientUserIds = targetUserIds.filter(id => id !== userId);
        } else {
          // Tournament-wide announcement - send to all approved participants
          const participants = await db
            .select({ userId: tournamentParticipants.userId })
            .from(tournamentParticipants)
            .where(
              and(
                eq(tournamentParticipants.tournamentId, tournamentId),
                eq(tournamentParticipants.status, 'approved')
              )
            );
          recipientUserIds = participants
            .filter(p => p.userId !== userId)
            .map(p => p.userId);
        }
        
        if (recipientUserIds.length > 0) {
          const { sendAnnouncementPushNotification } = await import('./oneSignalNotifications');
          const contentPreview = announcementData.content || '';
          let pushSuccessCount = 0;
          for (const recipientId of recipientUserIds) {
            try {
              const pushResult = await sendAnnouncementPushNotification(
                recipientId,
                authorName,
                contentPreview,
                tournament.name,
                announcement.id
              );
              if (pushResult) pushSuccessCount++;
              console.log(`[Push] Tournament announcement push to ${recipientId}: ${pushResult ? 'sent' : 'skipped/failed'}`);
            } catch (pushError) {
              console.error(`[Push] Failed to send tournament announcement push to ${recipientId}:`, pushError);
            }
          }
        }
      } catch (notificationError) {
        console.error('Failed to send tournament announcement push notifications:', notificationError);
        // Don't fail the request if notifications fail
      }
      
      res.json(fullAnnouncement);
    } catch (error) {
      console.error('Error creating tournament announcement:', error);
      res.status(500).json({ message: 'Failed to create announcement' });
    }
  });

  // ========== SCRIMMAGE ROUTES ==========

  // Custom schema for API request - keeps datetime as strings
  // Drizzle uses { mode: 'string' } for league-local times
  const createScrimmageApiSchema = insertScrimmageSchema.extend({
    dateTime: z.string(),
    recurrenceEndDate: z.string().nullable().optional(),
  });

  // Create scrimmage (available to all users)
  app.post('/api/scrimmages', isAuthenticated, loadUserPermissions, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Validate input data with proper schema
      let scrimmageData;
      try {
        scrimmageData = createScrimmageApiSchema.parse({
          ...req.body,
          creatorId: userId,
        });
      } catch (validationError) {
        console.error('Validation error creating scrimmage:', validationError);
        return res.status(400).json({ message: "Invalid scrimmage data", errors: validationError instanceof Error ? validationError.message : 'Validation failed' });
      }

      // Business invariants validation
      if (scrimmageData.maxPlayers < 2) {
        return res.status(400).json({ message: "Maximum players must be at least 2" });
      }
      if (scrimmageData.maxPlayers > 50) {
        return res.status(400).json({ message: "Maximum players cannot exceed 50" });
      }
      
      // Verify league exists and user is a member
      const league = await storage.getLeague(scrimmageData.leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      // Ensure scrimmage is scheduled in the future
      // Use parseLeagueLocalDateTime to convert string to Date for comparison
      const now = new Date();
      const scrimmageDateTime = parseLeagueLocalDateTime(scrimmageData.dateTime, league.timezone);
      if (scrimmageDateTime <= now) {
        return res.status(400).json({ message: "Scrimmage must be scheduled for a future date" });
      }
      
      const membership = await storage.getUserLeagueMembership(userId, scrimmageData.leagueId);
      if (!membership || membership.status !== 'approved') {
        return res.status(403).json({ message: "Must be an approved league member to create scrimmages" });
      }

      // Create announcement first if there are selected members
      let announcementId = null;
      if (req.body.selectedMemberIds && req.body.selectedMemberIds.length > 0) {
        try {
          
          const invitationContent = `🏒 You're Invited! "${scrimmageData.title}" on ${formatFullDateTime(scrimmageData.dateTime, league.timezone)} at ${scrimmageData.location}. Click to RSVP!`;
          
          // Create announcement for the scrimmage invitation
          const announcement = await storage.createAnnouncement({
            content: invitationContent,
            leagueId: scrimmageData.leagueId,
            authorId: userId,
            isPinned: false,
          });
          
          announcementId = announcement.id;
          
          // Create visibility records for invited players
          await storage.createAnnouncementVisibility(announcement.id, req.body.selectedMemberIds);
          
        } catch (announcementError) {
          console.error('Error sending scrimmage invitations:', announcementError);
          // Continue with scrimmage creation even if announcement fails
        }
      }
      
      // Handle recurring events
      if (scrimmageData.isRecurring && scrimmageData.recurrenceType !== 'none') {
        // Generate all recurring dates
        // Use parseLeagueLocalDateTime to convert string to Date for date arithmetic
        const dates: Date[] = [];
        const startDate = parseLeagueLocalDateTime(scrimmageData.dateTime, league.timezone);
        const maxOccurrences = scrimmageData.recurrenceCount || 52; // Default max to prevent infinite loops
        const endDate = scrimmageData.recurrenceEndDate ? parseLeagueLocalDateTime(scrimmageData.recurrenceEndDate, league.timezone) : null;
        
        if (scrimmageData.recurrenceType === 'daily') {
          // Daily recurrence: simple iteration
          let currentDate = new Date(startDate);
          while (dates.length < maxOccurrences) {
            // Compare dates only (ignore time) for end date check
            if (endDate) {
              const currentDateOnly = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
              const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
              if (currentDateOnly > endDateOnly) break;
            }
            dates.push(new Date(currentDate));
            currentDate = addDays(currentDate, 1);
          }
        } else if (scrimmageData.recurrenceType === 'weekly') {
          // Weekly recurrence: iterate through weeks and selected days
          if (scrimmageData.recurrenceDays && scrimmageData.recurrenceDays.length > 0) {
            const sortedDays = [...scrimmageData.recurrenceDays].sort((a, b) => a - b);
            const startDay = startDate.getDay();
            const startHour = startDate.getHours();
            const startMinute = startDate.getMinutes();
            
            let weekOffset = 0;
            while (dates.length < maxOccurrences) {
              // For each selected day of the week
              for (const day of sortedDays) {
                // Calculate the date for this day in this week
                // Start from the beginning of the start week, then add week offset
                const daysFromStart = (day - startDay + (weekOffset * 7));
                const occurrenceDate = new Date(startDate);
                occurrenceDate.setDate(startDate.getDate() + daysFromStart);
                occurrenceDate.setHours(startHour, startMinute, 0, 0);
                
                // Only include dates that are >= start date
                if (occurrenceDate >= startDate) {
                  // Compare dates only (ignore time) for end date check
                  if (endDate) {
                    const occurrenceDateOnly = new Date(occurrenceDate.getFullYear(), occurrenceDate.getMonth(), occurrenceDate.getDate());
                    const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
                    if (occurrenceDateOnly > endDateOnly) break;
                  }
                  dates.push(new Date(occurrenceDate));
                  if (dates.length >= maxOccurrences) break;
                }
              }
              weekOffset++;
              // Check if we should continue to next week
              if (endDate) {
                const nextWeekStart = addWeeks(startDate, weekOffset);
                const nextWeekStartOnly = new Date(nextWeekStart.getFullYear(), nextWeekStart.getMonth(), nextWeekStart.getDate());
                const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
                if (nextWeekStartOnly > endDateOnly) break;
              }
            }
          } else {
            // No specific days, just repeat weekly
            let currentDate = new Date(startDate);
            while (dates.length < maxOccurrences) {
              // Compare dates only (ignore time) for end date check
              if (endDate) {
                const currentDateOnly = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
                const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
                if (currentDateOnly > endDateOnly) break;
              }
              dates.push(new Date(currentDate));
              currentDate = addWeeks(currentDate, 1);
            }
          }
        } else if (scrimmageData.recurrenceType === 'monthly') {
          // Monthly recurrence
          let currentDate = new Date(startDate);
          while (dates.length < maxOccurrences) {
            // Compare dates only (ignore time) for end date check
            if (endDate) {
              const currentDateOnly = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
              const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
              if (currentDateOnly > endDateOnly) break;
            }
            dates.push(new Date(currentDate));
            currentDate = addMonths(currentDate, 1);
          }
        }
        
        
        // Create parent scrimmage (first occurrence)
        const parentScrimmage = await storage.createScrimmage({
          ...scrimmageData,
          announcementId,
          dateTime: dates[0],
        });
        
        
        // Add co-hosts if provided
        if (req.body.coHostIds && Array.isArray(req.body.coHostIds) && req.body.coHostIds.length > 0) {
          for (const coHostId of req.body.coHostIds) {
            try {
              await storage.addScrimmageCoHost({
                scrimmageId: parentScrimmage.id,
                userId: coHostId,
                canApproveRequests: true,
                canSendReminders: true,
                canManagePayments: true,
                addedBy: userId,
              });
              // Notify co-host
              await storage.createNotification({
                userId: coHostId,
                type: 'scrimmage_cohost_added',
                title: `You're a co-host for ${scrimmageData.title}`,
                message: `You have been added as a co-host for "${scrimmageData.title}" on ${formatFullDateTime(scrimmageData.dateTime, league.timezone)}. You can now help manage players and payments.`,
                actionUrl: `/scrimmage/${parentScrimmage.id}`,
                scrimmageId: parentScrimmage.id,
              });
              broadcastNotificationUpdate(coHostId);
            } catch (coHostError) {
              console.error(`Failed to add co-host ${coHostId}:`, coHostError);
            }
          }
        }
        
        // Create child scrimmages for remaining dates
        for (let i = 1; i < dates.length; i++) {
          const childScrimmage = await storage.createScrimmage({
            ...scrimmageData,
            dateTime: dates[i],
            parentScrimmageId: parentScrimmage.id,
            announcementId: null, // Only first scrimmage has announcement
          });
          
          // Add co-hosts to child scrimmage as well
          if (req.body.coHostIds && Array.isArray(req.body.coHostIds) && req.body.coHostIds.length > 0) {
            for (const coHostId of req.body.coHostIds) {
              try {
                await storage.addScrimmageCoHost({
                  scrimmageId: childScrimmage.id,
                  userId: coHostId,
                  canApproveRequests: true,
                  canSendReminders: true,
                  canManagePayments: true,
                  addedBy: userId,
                });
              } catch (coHostError) {
                console.error(`Failed to add co-host ${coHostId} to child scrimmage ${childScrimmage.id}:`, coHostError);
              }
            }
          }
        }
        
        
        // ALWAYS send in-app notifications when members are invited
        if (req.body.selectedMemberIds && req.body.selectedMemberIds.length > 0) {
          const creator = await storage.getUser(userId);
          const organizerName = creator 
            ? `${creator.firstName || ''} ${creator.lastName || ''}`.trim() || 'Organizer'
            : 'Organizer';
          const scrimmageDateTime = formatScrimmageDateTime(scrimmageData.dateTime, league.timezone);
          const { date: inviteDate, time: inviteTime } = formatShortDayAndTime(scrimmageData.dateTime, league.timezone);
          
          for (const memberId of req.body.selectedMemberIds) {
            try {
              // ALWAYS create in-app notification for Alerts
              await storage.createNotificationIfNotExists({
                userId: memberId,
                type: 'scrimmage_invite',
                title: `You're Invited: ${scrimmageData.title}`,
                message: `Join us on ${inviteDate} at ${inviteTime} at ${scrimmageData.location}. Tap to RSVP!`,
                actionUrl: `/scrimmage/${parentScrimmage.id}`,
                scrimmageId: parentScrimmage.id,
              });

              
              // Only send push notification if sendInviteNow is enabled
              if (req.body.sendInviteNow) {
                const { sendScrimmageInvitePushNotification } = await import('./oneSignalNotifications');
                const pushResult = await sendScrimmageInvitePushNotification(
                  memberId,
                  organizerName,
                  scrimmageData.title,
                  scrimmageDateTime,
                  scrimmageData.location || 'TBD',
                  parentScrimmage.id
                );
                console.log(`[Push] Scrimmage invite push to ${memberId}: ${pushResult ? 'sent' : 'skipped/failed'}`);
              }
            } catch (notifError) {
              console.error(`Failed to create notification for user ${memberId}:`, notifError);
            }
          }

        }
        
        // Save email invites if provided
        if (req.body.selectedEmails && Array.isArray(req.body.selectedEmails) && req.body.selectedEmails.length > 0) {
          try {
            // Validate and normalize emails
            const emailSchema = z.string().email();
            const validEmails = req.body.selectedEmails
              .map((email: string) => email.toLowerCase().trim())
              .filter((email: string) => emailSchema.safeParse(email).success);
            
            // Deduplicate emails
            const uniqueEmails = Array.from(new Set(validEmails));
            
            if (uniqueEmails.length > 0) {
              await storage.createScrimmageInvites(parentScrimmage.id, uniqueEmails);
              
              // Send email notifications
              try {
                const creator = await storage.getUser(userId);
                const creatorName = creator ? `${creator.firstName} ${creator.lastName}` : 'A league member';
                
                const emailData = {
                  scrimmageId: parentScrimmage.id,
                  title: parentScrimmage.title,
                  dateTime: new Date(parentScrimmage.dateTime),
                  location: parentScrimmage.location,
                  creatorName,
                  skillLevel: parentScrimmage.skillLevel || undefined,
                  costPerPlayer: parentScrimmage.costPerPlayer || undefined,
                  notes: parentScrimmage.notes || undefined,
                  maxPlayers: parentScrimmage.maxPlayers,
                };
                
                const emailResults = await sendBulkScrimmageInvites(uniqueEmails, emailData);

              } catch (emailSendError) {
                console.error('Error sending email notifications:', emailSendError);
                // Continue even if email notifications fail
              }
            }
          } catch (emailError) {
            console.error('Error creating email invites:', emailError);
            // Continue even if email invites fail
          }
        }
        
        res.status(201).json(parentScrimmage);
      } else {
        // Create single scrimmage (non-recurring)
        const scrimmage = await storage.createScrimmage({
          ...scrimmageData,
          announcementId,
        });
        
        
        // Add co-hosts if provided
        if (req.body.coHostIds && Array.isArray(req.body.coHostIds) && req.body.coHostIds.length > 0) {
          for (const coHostId of req.body.coHostIds) {
            try {
              await storage.addScrimmageCoHost({
                scrimmageId: scrimmage.id,
                userId: coHostId,
                canApproveRequests: true,
                canSendReminders: true,
                canManagePayments: true,
                addedBy: userId,
              });
              // Notify co-host
              await storage.createNotification({
                userId: coHostId,
                type: 'scrimmage_cohost_added',
                title: `You're a co-host for ${scrimmageData.title}`,
                message: `You have been added as a co-host for "${scrimmageData.title}" on ${formatFullDateTime(scrimmageData.dateTime, league.timezone)}. You can now help manage players and payments.`,
                actionUrl: `/scrimmage/${scrimmage.id}`,
                scrimmageId: scrimmage.id,
              });
              broadcastNotificationUpdate(coHostId);
            } catch (coHostError) {
              console.error(`Failed to add co-host ${coHostId}:`, coHostError);
            }
          }
        }
        
        // ALWAYS send in-app notifications when members are invited
        if (req.body.selectedMemberIds && req.body.selectedMemberIds.length > 0) {
          const creator = await storage.getUser(userId);
          const organizerName = creator 
            ? `${creator.firstName || ''} ${creator.lastName || ''}`.trim() || 'Organizer'
            : 'Organizer';
          const scrimmageDateTime = formatScrimmageDateTime(scrimmageData.dateTime, league.timezone);
          const { date: singleInviteDate, time: singleInviteTime } = formatShortDayAndTime(scrimmageData.dateTime, league.timezone);
          
          for (const memberId of req.body.selectedMemberIds) {
            try {
              // ALWAYS create in-app notification for Alerts
              await storage.createNotificationIfNotExists({
                userId: memberId,
                type: 'scrimmage_invite',
                title: `You're Invited: ${scrimmageData.title}`,
                message: `Join us on ${singleInviteDate} at ${singleInviteTime} at ${scrimmageData.location}. Tap to RSVP!`,
                actionUrl: `/scrimmage/${scrimmage.id}`,
                scrimmageId: scrimmage.id,
              });

              
              // Only send push notification if sendInviteNow is enabled
              if (req.body.sendInviteNow) {
                const { sendScrimmageInvitePushNotification } = await import('./oneSignalNotifications');
                const pushResult = await sendScrimmageInvitePushNotification(
                  memberId,
                  organizerName,
                  scrimmageData.title,
                  scrimmageDateTime,
                  scrimmageData.location || 'TBD',
                  scrimmage.id
                );
                console.log(`[Push] Scrimmage invite push to ${memberId}: ${pushResult ? 'sent' : 'skipped/failed'}`);
              }
            } catch (notifError) {
              console.error(`Failed to create notification for user ${memberId}:`, notifError);
            }
          }

        }
        
        // Save email invites if provided
        if (req.body.selectedEmails && Array.isArray(req.body.selectedEmails) && req.body.selectedEmails.length > 0) {
          try {
            // Validate and normalize emails
            const emailSchema = z.string().email();
            const validEmails = req.body.selectedEmails
              .map((email: string) => email.toLowerCase().trim())
              .filter((email: string) => emailSchema.safeParse(email).success);
            
            // Deduplicate emails
            const uniqueEmails = Array.from(new Set(validEmails));
            
            if (uniqueEmails.length > 0) {
              await storage.createScrimmageInvites(scrimmage.id, uniqueEmails);
              
              // Send email notifications
              try {
                const creator = await storage.getUser(userId);
                const creatorName = creator ? `${creator.firstName} ${creator.lastName}` : 'A league member';
                
                const emailData = {
                  scrimmageId: scrimmage.id,
                  title: scrimmage.title,
                  dateTime: new Date(scrimmage.dateTime),
                  location: scrimmage.location,
                  creatorName,
                  skillLevel: scrimmage.skillLevel || undefined,
                  costPerPlayer: scrimmage.costPerPlayer || undefined,
                  notes: scrimmage.notes || undefined,
                  maxPlayers: scrimmage.maxPlayers,
                };
                
                const emailResults = await sendBulkScrimmageInvites(uniqueEmails, emailData);

              } catch (emailSendError) {
                console.error('Error sending email notifications:', emailSendError);
                // Continue even if email notifications fail
              }
            }
          } catch (emailError) {
            console.error('Error creating email invites:', emailError);
            // Continue even if email invites fail
          }
        }
        
        res.status(201).json(scrimmage);
      }
    } catch (error) {
      console.error('Error creating scrimmage:', error);
      res.status(500).json({ message: 'Failed to create scrimmage' });
    }
  });

  // Get league scrimmages
  app.get('/api/leagues/:id/scrimmages', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.id;
      const userId = req.user.claims.sub;
      
      // Validate league exists
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }
      
      // Verify user is a member of the league
      const membership = await storage.getUserLeagueMembership(userId, leagueId);
      if (!membership || membership.status !== 'approved') {
        return res.status(403).json({ message: "Must be a league member to view scrimmages" });
      }
      
      const scrimmages = await storage.getLeagueScrimmages(leagueId);
      res.json(scrimmages);
    } catch (error) {
      console.error('Error fetching league scrimmages:', error);
      res.status(500).json({ message: 'Failed to fetch league scrimmages' });
    }
  });

  // Get single scrimmage details
  app.get('/api/scrimmages/:id', isAuthenticated, async (req: any, res) => {
    try {
      const scrimmageId = req.params.id;
      const userId = req.user.claims.sub;
      
      const scrimmage = await storage.getScrimmage(scrimmageId);
      if (!scrimmage) {
        return res.status(404).json({ message: 'Scrimmage not found' });
      }
      
      // Verify user is a member of the league
      const membership = await storage.getUserLeagueMembership(userId, scrimmage.leagueId);
      if (!membership || membership.status !== 'approved') {
        return res.status(403).json({ message: "Must be a league member to view scrimmage details" });
      }

      res.json(scrimmage);
    } catch (error) {
      console.error('Error fetching scrimmage:', error);
      res.status(500).json({ message: 'Failed to fetch scrimmage' });
    }
  });

  // Update scrimmage (Creator only)
  app.put('/api/scrimmages/:id', isAuthenticated, async (req: any, res) => {
    try {
      const scrimmageId = req.params.id;
      const userId = req.user.claims.sub;

      // Get scrimmage to check ownership and current state
      const existingScrimmage = await storage.getScrimmage(scrimmageId);
      if (!existingScrimmage) {
        return res.status(404).json({ message: 'Scrimmage not found' });
      }

      if (existingScrimmage.creatorId !== userId) {
        return res.status(403).json({ message: 'Only the creator can update this scrimmage' });
      }
      
      // Business invariant: Cannot edit scrimmage that has already started or ended
      const now = new Date();
      if (existingScrimmage.dateTime <= now) {
        return res.status(409).json({ message: 'Cannot update scrimmage that has already started or ended' });
      }
      
      // Business invariant: Cannot edit scrimmage that is cancelled
      if (existingScrimmage.status === 'cancelled') {
        return res.status(409).json({ message: 'Cannot update cancelled scrimmage' });
      }

      // Validate input data with proper Zod schema
      let updateData;
      try {
        updateData = updateScrimmageRequestSchema.parse(req.body);
      } catch (validationError) {
        console.error('Validation error updating scrimmage:', validationError);
        return res.status(400).json({ message: "Invalid update data", errors: validationError instanceof Error ? validationError.message : 'Validation failed' });
      }
      
      // Business invariants validation
      if (updateData.maxPlayers !== undefined) {
        if (updateData.maxPlayers < 2) {
          return res.status(400).json({ message: "Maximum players must be at least 2" });
        }
        if (updateData.maxPlayers > 50) {
          return res.status(400).json({ message: "Maximum players cannot exceed 50" });
        }
        
        // Get current accepted players count
        const acceptedRequests = await storage.getScrimmageRequests(scrimmageId);
        const acceptedCount = acceptedRequests.filter(req => req.status === 'approved').length;
        
        if (updateData.maxPlayers < acceptedCount) {
          return res.status(409).json({ 
            message: `Cannot reduce max players to ${updateData.maxPlayers}. There are already ${acceptedCount} accepted players.` 
          });
        }
      }
      
      // DateTime editing restrictions
      if (updateData.dateTime !== undefined) {
        if (updateData.dateTime <= now) {
          return res.status(400).json({ message: "Scrimmage must be scheduled for a future date" });
        }
        
        // Don't allow changing date if it's less than 24 hours away
        const hoursUntilExisting = (existingScrimmage.dateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
        if (hoursUntilExisting < 24) {
          return res.status(409).json({ message: "Cannot change scrimmage date less than 24 hours before scheduled time" });
        }
      }

      const updatedScrimmage = await storage.updateScrimmage(scrimmageId, updateData);
      res.json(updatedScrimmage);
    } catch (error) {
      console.error('Error updating scrimmage:', error);
      res.status(500).json({ message: 'Failed to update scrimmage' });
    }
  });

  // Batch delete scrimmages (Creator only) - must be before :id route to avoid conflict
  app.delete('/api/scrimmages/batch', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'ids must be a non-empty array of scrimmage IDs' });
      }

      let deleted = 0;
      let skipped = 0;
      for (const scrimmageId of ids) {
        try {
          const scrimmage = await storage.getScrimmage(scrimmageId);
          if (!scrimmage) { skipped++; continue; }
          if (scrimmage.creatorId !== userId) { skipped++; continue; }

          // Get approved players before deleting (for cancellation notifications)
          const scrimmageRequests = await storage.getScrimmageRequests(scrimmageId);
          const approvedRequests = scrimmageRequests.filter(r => r.status === 'approved');

          await storage.deleteScrimmage(scrimmageId);
          deleted++;

          // Send cancellation notification to approved players (mirrors single-delete logic)
          if (approvedRequests.length > 0) {
            try {
              const league = await storage.getLeague(scrimmage.leagueId);
              const timezone = league?.timezone || 'America/New_York';
              const targetUserIds = approvedRequests.map(r => r.playerId);
              const announcementContent = `❌ Scrimmage Cancelled: "${scrimmage.title}" scheduled for ${formatFullDateTime(scrimmage.dateTime, timezone)} at ${scrimmage.location} has been cancelled by the organizer.`;
              const announcement = await storage.createAnnouncement({
                content: announcementContent,
                leagueId: scrimmage.leagueId,
                authorId: userId,
                isPinned: false,
              });
              await storage.createAnnouncementVisibility(announcement.id, targetUserIds);
            } catch (notifyErr) {
              console.error(`Error sending cancellation notifications for scrimmage ${scrimmageId}:`, notifyErr);
              // Don't fail the deletion if notification fails
            }
          }
        } catch (err) {
          console.error(`Error deleting scrimmage ${scrimmageId} in batch:`, err);
          skipped++;
        }
      }

      res.json({ message: `Deleted ${deleted} scrimmages, skipped ${skipped}`, deleted, skipped });
    } catch (error) {
      console.error('Error batch deleting scrimmages:', error);
      res.status(500).json({ message: 'Failed to batch delete scrimmages' });
    }
  });

  // Delete entire recurring scrimmage series (Creator only) - must be before :id route
  app.delete('/api/scrimmages/series/:parentId', isAuthenticated, async (req: any, res) => {
    try {
      const parentId = req.params.parentId;
      const userId = req.user.claims.sub;

      // Fetch the full series (parent + all children)
      const seriesScrimmages = await storage.getScrimmageSeries(parentId);
      if (seriesScrimmages.length === 0) {
        return res.status(404).json({ message: 'Series not found' });
      }

      // Use the parent row for ownership/metadata if it exists; fall back to any child
      const parent = seriesScrimmages.find(s => s.id === parentId);
      const representative = parent ?? seriesScrimmages[0];

      if (representative.creatorId !== userId) {
        return res.status(403).json({ message: 'Only the creator can delete this series' });
      }

      // Collect all approved players across all occurrences (deduplicated by userId)
      const allApprovedPlayerIds = new Set<string>();
      for (const scrimmage of seriesScrimmages) {
        const scrimmageRequests = await storage.getScrimmageRequests(scrimmage.id);
        scrimmageRequests.filter(r => r.status === 'approved').forEach(r => allApprovedPlayerIds.add(r.playerId));
      }

      // Delete all scrimmages in the series
      for (const scrimmage of seriesScrimmages) {
        await storage.deleteScrimmage(scrimmage.id);
      }

      // Send a single series-cancellation notification to all affected players
      if (allApprovedPlayerIds.size > 0) {
        try {
          const league = await storage.getLeague(representative.leagueId);
          const timezone = league?.timezone || 'America/New_York';
          const targetUserIds = Array.from(allApprovedPlayerIds);
          const announcementContent = `❌ Recurring Series Cancelled: The entire "${representative.title}" recurring scrimmage series has been cancelled by the organizer. All ${seriesScrimmages.length} occurrence(s) have been removed.`;
          const announcement = await storage.createAnnouncement({
            content: announcementContent,
            leagueId: representative.leagueId,
            authorId: userId,
            isPinned: false,
          });
          await storage.createAnnouncementVisibility(announcement.id, targetUserIds);
        } catch (notifyErr) {
          console.error(`Error sending series cancellation notifications for series ${parentId}:`, notifyErr);
        }
      }

      res.json({ message: `Deleted ${seriesScrimmages.length} scrimmage(s) in the series`, deleted: seriesScrimmages.length });
    } catch (error) {
      console.error('Error deleting scrimmage series:', error);
      res.status(500).json({ message: 'Failed to delete scrimmage series' });
    }
  });

  // Delete scrimmage (Creator only)
  app.delete('/api/scrimmages/:id', isAuthenticated, async (req: any, res) => {
    try {
      const scrimmageId = req.params.id;
      const userId = req.user.claims.sub;

      // Get scrimmage to check ownership and status
      const scrimmage = await storage.getScrimmage(scrimmageId);
      if (!scrimmage) {
        return res.status(404).json({ message: 'Scrimmage not found' });
      }

      if (scrimmage.creatorId !== userId) {
        return res.status(403).json({ message: 'Only the creator can delete this scrimmage' });
      }

      await storage.deleteScrimmage(scrimmageId);
      res.json({ message: 'Scrimmage deleted successfully' });
    } catch (error) {
      console.error('Error deleting scrimmage:', error);
      res.status(500).json({ message: 'Failed to delete scrimmage' });
    }
  });

  // Create scrimmage request (join request)
  app.post('/api/scrimmages/:id/requests', isAuthenticated, async (req: any, res) => {
    try {
      const scrimmageId = req.params.id;
      const userId = req.user.claims.sub;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Check if scrimmage exists and get details
      const scrimmage = await storage.getScrimmage(scrimmageId);
      if (!scrimmage) {
        return res.status(404).json({ message: 'Scrimmage not found' });
      }
      
      // Business invariant: Cannot join scrimmage that has passed or is imminent
      const now = new Date();
      if (scrimmage.dateTime <= now) {
        return res.status(409).json({ message: 'Cannot join scrimmage that has already started or ended' });
      }
      
      // Cannot join cancelled scrimmage
      if (scrimmage.status === 'cancelled') {
        return res.status(409).json({ message: 'Cannot join cancelled scrimmage' });
      }
      
      // Verify user is a member of the league
      const membership = await storage.getUserLeagueMembership(userId, scrimmage.leagueId);
      if (!membership || membership.status !== 'approved') {
        return res.status(403).json({ message: "Must be an approved league member to join scrimmages" });
      }

      // Check if user already has a request for this scrimmage
      const existingRequest = await storage.getScrimmageRequest(scrimmageId, userId);
      if (existingRequest) {
        return res.status(409).json({ message: 'Request already exists for this scrimmage' });
      }
      
      // Check if scrimmage is already at capacity
      const currentRequests = await storage.getScrimmageRequests(scrimmageId);
      const acceptedCount = currentRequests.filter(req => req.status === 'approved').length;
      
      if (acceptedCount >= scrimmage.maxPlayers) {
        return res.status(409).json({ message: 'Scrimmage is already at full capacity' });
      }

      // Validate request data
      // If creator or co-host is joining their own scrimmage, auto-approve them
      const isCreator = scrimmage.creatorId === userId;
      const isCoHost = await storage.isUserScrimmageCoHost(scrimmageId, userId);
      const shouldAutoApprove = isCreator || isCoHost;
      
      let requestData;
      try {
        requestData = insertScrimmageRequestSchema.parse({
          scrimmageId,
          playerId: userId,
          status: shouldAutoApprove ? 'approved' : 'pending',
        });
      } catch (validationError) {
        console.error('[Scrimmage Request] Validation error:', validationError);
        return res.status(400).json({ message: "Invalid request data", errors: validationError instanceof Error ? validationError.message : 'Validation failed' });
      }

      const request = await storage.createScrimmageRequest(requestData);
      res.status(201).json(request);
    } catch (error) {
      console.error('[Scrimmage Request] Error creating scrimmage request:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ message: 'Failed to create scrimmage request', error: errorMessage });
    }
  });

  // Get approved players for scrimmage (Any league member)
  app.get('/api/scrimmages/:id/approved-players', isAuthenticated, async (req: any, res) => {
    try {
      const scrimmageId = req.params.id;
      const userId = req.user.claims.sub;
      
      const scrimmage = await storage.getScrimmage(scrimmageId);
      if (!scrimmage) {
        return res.status(404).json({ message: 'Scrimmage not found' });
      }
      
      // Verify user is a member of the league
      const membership = await storage.getUserLeagueMembership(userId, scrimmage.leagueId);
      if (!membership || membership.status !== 'approved') {
        return res.status(403).json({ message: "Must be a league member to view scrimmage details" });
      }

      // Get only approved requests
      const allRequests = await storage.getScrimmageRequests(scrimmageId);
      const approvedPlayers = allRequests.filter(request => request.status === 'approved');
      
      res.json({
        scrimmage,
        approvedPlayers
      });
    } catch (error) {
      console.error('Error fetching approved players:', error);
      res.status(500).json({ message: 'Failed to fetch approved players' });
    }
  });

  // Get scrimmage requests (Creator or Co-Host with canApproveRequests permission)
  app.get('/api/scrimmages/:id/requests', isAuthenticated, async (req: any, res) => {
    try {
      const scrimmageId = req.params.id;
      const userId = req.user.claims.sub;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Check if user can manage this scrimmage
      const { canManage, isCreator, isCoHost, permissions } = await storage.canUserManageScrimmage(scrimmageId, userId);
      
      if (!canManage) {
        return res.status(403).json({ message: 'Only the creator or co-hosts can view requests' });
      }
      
      // If co-host, verify they have permission to approve requests
      if (isCoHost && permissions && !permissions.canApproveRequests) {
        return res.status(403).json({ message: 'You do not have permission to view requests for this scrimmage' });
      }

      const requests = await storage.getScrimmageRequests(scrimmageId);
      res.json(requests);
    } catch (error) {
      console.error('Error fetching scrimmage requests:', error);
      res.status(500).json({ message: 'Failed to fetch scrimmage requests' });
    }
  });

  // Update scrimmage request status (Creator or Co-Host with canApproveRequests permission)
  app.put('/api/scrimmage-requests/:id/status', isAuthenticated, async (req: any, res) => {
    try {
      const requestId = req.params.id;
      const userId = req.user.claims.sub;
      const { status } = req.body;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Validate status input
      if (!status || !['approved', 'dismissed'].includes(status)) {
        return res.status(400).json({ message: 'Status must be "approved" or "dismissed"' });
      }

      // Get the request first
      const request = await storage.getScrimmageRequestById(requestId);
      
      if (!request) {
        return res.status(404).json({ message: 'Request not found' });
      }
      
      // Business invariant: Cannot modify already processed requests
      if (request.status !== 'pending') {
        return res.status(409).json({ message: `Request has already been ${request.status}` });
      }

      const scrimmage = await storage.getScrimmage(request.scrimmageId);
      if (!scrimmage) {
        return res.status(404).json({ message: 'Scrimmage not found' });
      }
      
      // Check if user can manage this scrimmage
      const { canManage, isCreator, isCoHost, permissions } = await storage.canUserManageScrimmage(request.scrimmageId, userId);
      
      if (!canManage) {
        return res.status(403).json({ message: 'Only the creator or co-hosts can update request status' });
      }
      
      // If co-host, verify they have permission to approve requests
      if (isCoHost && permissions && !permissions.canApproveRequests) {
        return res.status(403).json({ message: 'You do not have permission to approve requests for this scrimmage' });
      }
      
      // Business invariant: Cannot approve requests for scrimmages that have passed
      const now = new Date();
      if (scrimmage.dateTime <= now && status === 'approved') {
        return res.status(409).json({ message: 'Cannot approve requests for scrimmages that have already started' });
      }
      
      // Business invariant: Cannot approve if at capacity
      if (status === 'approved') {
        const currentRequests = await storage.getScrimmageRequests(scrimmage.id);
        const approvedCount = currentRequests.filter(req => req.status === 'approved').length;
        
        if (approvedCount >= scrimmage.maxPlayers) {
          return res.status(409).json({ message: 'Cannot approve request - scrimmage is at full capacity' });
        }
      }

      const updatedRequest = await storage.updateScrimmageRequestStatus(requestId, status);
      
      // Send approval notification email if request was approved
      if (status === 'approved') {
        try {
          // Get the player who was approved
          const player = await storage.getUser(request.playerId);
          
          // Get the scrimmage creator for the organizer name
          const creator = await storage.getUser(scrimmage.creatorId);
          
          // Get current player count
          const allRequests = await storage.getScrimmageRequests(scrimmage.id);
          const approvedCount = allRequests.filter(r => r.status === 'approved').length;
          
          if (player) {
            // Get league timezone for proper date formatting
            const league = await storage.getLeague(scrimmage.leagueId);
            const timezone = league?.timezone || 'America/New_York';
            const { date: approvalDate, time: approvalTime } = formatDayAndTime(scrimmage.dateTime, timezone);
            
            // Send in-app notification
            await storage.createNotification({
              userId: player.id,
              type: 'scrimmage_approved',
              title: `You're in! ${scrimmage.title}`,
              message: `Your request to join "${scrimmage.title}" on ${approvalDate} at ${approvalTime} has been approved!`,
              actionUrl: `/scrimmage/${scrimmage.id}`,
              actionText: 'View Details',
              scrimmageId: scrimmage.id,
            });
            broadcastNotificationUpdate(player.id);
            
            // Send IMMEDIATE push notification - await to ensure delivery
            const scrimmageDateTime = formatScrimmageDateTime(scrimmage.dateTime, timezone);
            const { sendScrimmageApprovalPushNotification } = await import('./oneSignalNotifications');
            const pushResult = await sendScrimmageApprovalPushNotification(
              player.id,
              scrimmage.title,
              scrimmageDateTime,
              scrimmage.id
            );
            console.log(`[Push] Scrimmage approval push to ${player.id}: ${pushResult ? 'sent' : 'skipped/failed'}`);
            
            
            // Also send email if available
            if (player.email && creator) {
              await sendScrimmageApprovalEmail(player.email, {
                scrimmageId: scrimmage.id,
                title: scrimmage.title,
                dateTime: new Date(scrimmage.dateTime),
                location: scrimmage.location,
                organizerName: `${creator.firstName || ''} ${creator.lastName || ''}`.trim() || 'Organizer',
                playerName: player.firstName || 'Player',
                maxPlayers: scrimmage.maxPlayers,
                currentPlayers: approvedCount,
              });
            }
          }
        } catch (emailError) {
          // Log but don't fail the request if email fails
          console.error('Failed to send approval notification email:', emailError);
        }
      }
      
      res.json(updatedRequest);
    } catch (error) {
      console.error('Error updating request status:', error);
      res.status(500).json({ message: 'Failed to update request status' });
    }
  });

  // Delete scrimmage request
  app.delete('/api/scrimmage-requests/:id', isAuthenticated, async (req: any, res) => {
    try {
      const requestId = req.params.id;
      const userId = req.user.claims.sub;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Get the request by ID
      const request = await storage.getScrimmageRequestById(requestId);
      
      if (!request) {
        return res.status(404).json({ message: 'Request not found' });
      }

      const scrimmage = await storage.getScrimmage(request.scrimmageId);
      if (!scrimmage) {
        return res.status(404).json({ message: 'Scrimmage not found' });
      }
      
      // Allow deletion if user is the requester or the scrimmage creator
      if (request.playerId !== userId && scrimmage.creatorId !== userId) {
        return res.status(403).json({ message: 'Unauthorized to delete this request' });
      }
      
      // Business invariant: Cannot delete approved request less than 24 hours before scrimmage
      if (request.status === 'approved' && request.playerId === userId) {
        const now = new Date();
        const hoursUntil = (scrimmage.dateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
        
        if (hoursUntil < 24) {
          return res.status(409).json({ 
            message: 'Cannot withdraw from approved scrimmage less than 24 hours before scheduled time' 
          });
        }
      }

      await storage.deleteScrimmageRequest(requestId);
      res.json({ message: 'Request deleted successfully' });
    } catch (error) {
      console.error('Error deleting request:', error);
      res.status(500).json({ message: 'Failed to delete request' });
    }
  });

  // Finalize scrimmage roster and send confirmation notifications (Creator or Co-Host)
  app.put('/api/scrimmages/:id/finalize', isAuthenticated, async (req: any, res) => {
    try {
      const scrimmageId = req.params.id;
      const userId = req.user.claims.sub;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Get the scrimmage
      const scrimmage = await storage.getScrimmage(scrimmageId);
      if (!scrimmage) {
        return res.status(404).json({ message: 'Scrimmage not found' });
      }
      
      // Check if user can manage this scrimmage (creator or co-host)
      const { canManage } = await storage.canUserManageScrimmage(scrimmageId, userId);
      if (!canManage) {
        return res.status(403).json({ message: 'Only the creator or co-hosts can finalize the scrimmage' });
      }
      
      // Check if already finalized
      if (scrimmage.status === 'roster_confirmed') {
        return res.status(409).json({ message: 'Scrimmage roster is already finalized' });
      }
      
      // Business rule: Cannot finalize if scrimmage has already started
      const now = new Date();
      if (scrimmage.dateTime <= now) {
        return res.status(409).json({ message: 'Cannot finalize a scrimmage that has already started' });
      }
      
      // Get approved players
      const requests = await storage.getScrimmageRequests(scrimmageId);
      const approvedRequests = requests.filter(req => req.status === 'approved');
      
      if (approvedRequests.length === 0) {
        return res.status(400).json({ message: 'Cannot finalize scrimmage with no approved players' });
      }
      
      // Update scrimmage status to finalized
      const updatedScrimmage = await storage.updateScrimmage(scrimmageId, { status: 'roster_confirmed' });
      
      // Send in-app notifications to approved players (shows in Alerts, not News)
      const approvedUserIds = approvedRequests.map(req => req.playerId);
      
      // Get league timezone for proper date formatting
      const league = await storage.getLeague(scrimmage.leagueId);
      const timezone = league?.timezone || 'America/New_York';
      
      try {
        for (const playerId of approvedUserIds) {
          await storage.createNotification({
            userId: playerId,
            type: 'scrimmage_approved',
            title: `Scrimmage Confirmed: ${scrimmage.title}`,
            message: `Your spot in "${scrimmage.title}" has been confirmed for ${formatFullDateTime(scrimmage.dateTime, timezone)} at ${scrimmage.location}. See you on the ice!`,
            actionUrl: `/scrimmage/${scrimmage.id}`,
            actionText: 'View Details',
            scrimmageId: scrimmage.id,
          });
          broadcastNotificationUpdate(playerId);
        }
      } catch (notificationError) {
        console.error('Error sending confirmation notifications:', notificationError);
        // Don't fail the finalization if notification fails
      }

      // Automatically create payment request if there's a cost
      if (scrimmage.costPerPlayer && parseFloat(scrimmage.costPerPlayer) > 0) {
        try {
          const paymentRequest = await storage.createPaymentRequest(
            {
              creatorId: userId,
              title: `Payment for ${scrimmage.title}`,
              description: `Payment for scrimmage on ${formatFullDateTime(scrimmage.dateTime, timezone)} at ${scrimmage.location}`,
              amountPerPerson: scrimmage.costPerPlayer,
              relatedScrimmageId: scrimmageId,
              deadline: null,
              notes: null,
              relatedConversationId: null,
            },
            approvedUserIds
          );
          
        } catch (paymentError) {
          console.error('Error creating payment request:', paymentError);
          // Don't fail the finalization if payment request creation fails
        }
      }
      
      res.json(updatedScrimmage);
    } catch (error) {
      console.error('Error finalizing scrimmage:', error);
      res.status(500).json({ message: 'Failed to finalize scrimmage' });
    }
  });

  // ========================================
  // Scrimmage Co-Host Management Endpoints
  // ========================================

  // Get co-hosts for a scrimmage
  app.get('/api/scrimmages/:id/co-hosts', isAuthenticated, async (req: any, res) => {
    try {
      const scrimmageId = req.params.id;
      const userId = req.user.claims.sub;
      
      // Verify scrimmage exists
      const scrimmage = await storage.getScrimmage(scrimmageId);
      if (!scrimmage) {
        return res.status(404).json({ message: 'Scrimmage not found' });
      }
      
      // Verify user is a member of the league
      const membership = await storage.getUserLeagueMembership(userId, scrimmage.leagueId);
      if (!membership || membership.status !== 'approved') {
        return res.status(403).json({ message: "Must be a league member to view co-hosts" });
      }

      const coHosts = await storage.getScrimmageCoHosts(scrimmageId);
      res.json(coHosts);
    } catch (error) {
      console.error('Error fetching co-hosts:', error);
      res.status(500).json({ message: 'Failed to fetch co-hosts' });
    }
  });

  // Add a co-host to a scrimmage (Creator only)
  app.post('/api/scrimmages/:id/co-hosts', isAuthenticated, async (req: any, res) => {
    try {
      const scrimmageId = req.params.id;
      const userId = req.user.claims.sub;
      const { coHostUserId, canApproveRequests = true, canSendReminders = true, canManagePayments = true } = req.body;
      
      if (!coHostUserId) {
        return res.status(400).json({ message: 'Co-host user ID is required' });
      }
      
      // Get scrimmage to check ownership
      const scrimmage = await storage.getScrimmage(scrimmageId);
      if (!scrimmage) {
        return res.status(404).json({ message: 'Scrimmage not found' });
      }
      
      // Only the creator can add co-hosts
      if (scrimmage.creatorId !== userId) {
        return res.status(403).json({ message: 'Only the creator can add co-hosts' });
      }
      
      // Cannot add creator as co-host
      if (coHostUserId === userId) {
        return res.status(400).json({ message: 'Cannot add yourself as a co-host' });
      }
      
      // Verify the co-host user exists and is a league member
      const coHostUser = await storage.getUser(coHostUserId);
      if (!coHostUser) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      const coHostMembership = await storage.getUserLeagueMembership(coHostUserId, scrimmage.leagueId);
      if (!coHostMembership || coHostMembership.status !== 'approved') {
        return res.status(400).json({ message: 'Co-host must be an approved league member' });
      }
      
      // Check if already a co-host
      const existingCoHost = await storage.getScrimmageCoHost(scrimmageId, coHostUserId);
      if (existingCoHost) {
        return res.status(409).json({ message: 'User is already a co-host for this scrimmage' });
      }
      
      const coHost = await storage.addScrimmageCoHost({
        scrimmageId,
        userId: coHostUserId,
        canApproveRequests,
        canSendReminders,
        canManagePayments,
        addedBy: userId,
      });
      
      // Get league timezone for proper date formatting
      const league = await storage.getLeague(scrimmage.leagueId);
      const timezone = league?.timezone || 'America/New_York';
      
      // Notify the new co-host
      const dateTimeStr = formatFullDateTime(scrimmage.dateTime, timezone);
      await storage.createNotification({
        userId: coHostUserId,
        type: 'scrimmage_cohost_added',
        title: `You're a co-host for ${scrimmage.title}`,
        message: `You have been added as a co-host for "${scrimmage.title}" on ${dateTimeStr}. You can now help manage players and payments.`,
        actionUrl: `/scrimmage/${scrimmageId}`,
        scrimmageId: scrimmageId,
      });
      broadcastNotificationUpdate(coHostUserId);
      
      // Send push notification
      try {
        const { sendCoHostPushNotification } = await import('./oneSignalNotifications');
        const pushResult = await sendCoHostPushNotification(
          coHostUserId,
          scrimmage.title,
          dateTimeStr,
          scrimmageId
        );
        console.log(`[Push] Co-host notification to ${coHostUserId}: ${pushResult ? 'sent' : 'skipped/failed'}`);
      } catch (pushError) {
        console.error('[Push] Failed to send co-host notification:', pushError);
      }
      
      res.status(201).json(coHost);
    } catch (error) {
      console.error('Error adding co-host:', error);
      res.status(500).json({ message: 'Failed to add co-host' });
    }
  });

  // Remove a co-host from a scrimmage (Creator only)
  app.delete('/api/scrimmages/:id/co-hosts/:coHostUserId', isAuthenticated, async (req: any, res) => {
    try {
      const scrimmageId = req.params.id;
      const coHostUserId = req.params.coHostUserId;
      const userId = req.user.claims.sub;
      
      // Get scrimmage to check ownership
      const scrimmage = await storage.getScrimmage(scrimmageId);
      if (!scrimmage) {
        return res.status(404).json({ message: 'Scrimmage not found' });
      }
      
      // Only the creator can remove co-hosts
      if (scrimmage.creatorId !== userId) {
        return res.status(403).json({ message: 'Only the creator can remove co-hosts' });
      }
      
      // Check if user is a co-host
      const existingCoHost = await storage.getScrimmageCoHost(scrimmageId, coHostUserId);
      if (!existingCoHost) {
        return res.status(404).json({ message: 'User is not a co-host for this scrimmage' });
      }
      
      await storage.removeScrimmageCoHost(scrimmageId, coHostUserId);
      
      // Notify the removed co-host
      await storage.createNotification({
        userId: coHostUserId,
        type: 'scrimmage_cohost_removed',
        title: `Co-host access removed`,
        message: `Your co-host access for "${scrimmage.title}" has been removed.`,
        scrimmageId: scrimmageId,
      });
      
      res.json({ message: 'Co-host removed successfully' });
    } catch (error) {
      console.error('Error removing co-host:', error);
      res.status(500).json({ message: 'Failed to remove co-host' });
    }
  });

  // Check if current user can manage a scrimmage (Creator or Co-Host)
  app.get('/api/scrimmages/:id/can-manage', isAuthenticated, async (req: any, res) => {
    try {
      const scrimmageId = req.params.id;
      const userId = req.user.claims.sub;
      
      const result = await storage.canUserManageScrimmage(scrimmageId, userId);
      res.json(result);
    } catch (error) {
      console.error('Error checking management permissions:', error);
      res.status(500).json({ message: 'Failed to check permissions' });
    }
  });

  // Delete scrimmage and notify confirmed players
  app.delete('/api/scrimmages/:id', isAuthenticated, async (req: any, res) => {
    try {
      const scrimmageId = req.params.id;
      const userId = req.user.claims.sub;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Get the scrimmage
      const scrimmage = await storage.getScrimmage(scrimmageId);
      if (!scrimmage) {
        return res.status(404).json({ message: 'Scrimmage not found' });
      }
      
      // Only creator can delete
      if (scrimmage.creatorId !== userId) {
        return res.status(403).json({ message: 'Only the creator can cancel the scrimmage' });
      }
      
      // Get approved players before deleting
      const requests = await storage.getScrimmageRequests(scrimmageId);
      const approvedRequests = requests.filter(req => req.status === 'approved');
      
      // Delete the scrimmage (this will cascade delete requests)
      await storage.deleteScrimmage(scrimmageId);
      
      // Send cancellation notification to approved players
      if (approvedRequests.length > 0) {
        // Get league timezone for proper date formatting
        const league = await storage.getLeague(scrimmage.leagueId);
        const timezone = league?.timezone || 'America/New_York';
        
        const targetUserIds = approvedRequests.map(req => req.playerId);
        const announcementContent = `❌ Scrimmage Cancelled: "${scrimmage.title}" scheduled for ${formatFullDateTime(scrimmage.dateTime, timezone)} at ${scrimmage.location} has been cancelled by the organizer.`;
        
        try {
          // Create announcement
          const announcement = await storage.createAnnouncement({
            content: announcementContent,
            leagueId: scrimmage.leagueId,
            authorId: userId,
            isPinned: false,
          });
          
          // Create visibility records for approved players
          await storage.createAnnouncementVisibility(announcement.id, targetUserIds);
          
        } catch (announcementError) {
          console.error('Error sending cancellation notifications:', announcementError);
          // Don't fail the deletion if announcement fails
        }
      }
      
      res.json({ message: 'Scrimmage cancelled successfully' });
    } catch (error) {
      console.error('Error deleting scrimmage:', error);
      res.status(500).json({ message: 'Failed to cancel scrimmage' });
    }
  });

  // Player Stats Routes
  
  // Get aggregated user stats across all leagues
  app.get('/api/user/stats/aggregate', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get all leagues the user is a member of
      const leagues = await storage.getUserLeagues(userId);
      
      let totalGoals = 0;
      let totalAssists = 0;
      let totalGamesPlayed = 0;
      let totalPenaltyMinutes = 0;
      
      // Aggregate stats across all leagues and all seasons
      for (const league of leagues) {
        try {
          const allStats = await storage.getAllPlayerStatsByUser(userId, league.id);
          for (const stats of allStats) {
            totalGoals += stats.goals || 0;
            totalAssists += stats.assists || 0;
            totalGamesPlayed += stats.gamesPlayed || 0;
            totalPenaltyMinutes += stats.penaltyMinutes || 0;
          }
        } catch (error) {
          // Skip leagues where stats don't exist
          continue;
        }
      }
      
      res.json({
        goals: totalGoals,
        assists: totalAssists,
        points: totalGoals + totalAssists,
        gamesPlayed: totalGamesPlayed,
        penaltyMinutes: totalPenaltyMinutes,
      });
    } catch (error) {
      console.error('Error fetching aggregate user stats:', error);
      res.status(500).json({ message: 'Failed to fetch user stats' });
    }
  });
  
  // Get player stats for a league (with optional season filter)
  app.get('/api/leagues/:leagueId/stats', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const seasonId = Array.isArray(req.query.seasonId) ? req.query.seasonId[0] : req.query.seasonId;
      const playerType = Array.isArray(req.query.playerType) ? req.query.playerType[0] : req.query.playerType;
      const userId = req.user.claims.sub;
      
      // Verify user is a member of this league
      const userMembership = await storage.getUserLeagueMembership(userId, leagueId);
      if (!userMembership || userMembership.status !== 'approved') {
        return res.status(403).json({ message: "Access denied - not an approved league member" });
      }
      
      // Validate season ownership if seasonId is provided
      if (seasonId) {
        const season = await storage.getSeason(seasonId);
        if (!season || season.leagueId !== leagueId) {
          return res.status(400).json({ message: "Season not found or does not belong to this league" });
        }
      }
      
      if (playerType === 'goalies') {
        // Get goalie statistics with discriminated union type
        const goalieStats = await storage.getGoalieStats(leagueId, seasonId);
        const response = goalieStats.map(stat => ({
          type: 'goalie' as const,
          userId: stat.userId,
          teamId: stat.teamId,
          gamesPlayed: stat.gamesPlayed,
          wins: stat.wins,
          losses: stat.losses,
          ties: stat.ties,
          shootoutLosses: stat.shootoutLosses,
          goalsAgainst: stat.goalsAgainst,
          shutouts: stat.shutouts,
          goalsAgainstAverage: stat.goalsAgainstAverage,
          user: stat.user
        }));
        res.json(response);
      } else {
        // Get regular player statistics with discriminated union type
        const playerStats = await storage.getPlayerStats(leagueId, seasonId, playerType as 'non-goalies' | undefined);
        const response = playerStats.map(stat => ({
          type: 'skater' as const,
          id: stat.id,
          leagueId: stat.leagueId,
          seasonId: stat.seasonId,
          userId: stat.userId,
          gamesPlayed: stat.gamesPlayed,
          goals: stat.goals,
          assists: stat.assists,
          penaltyMinutes: stat.penaltyMinutes,
          points: stat.goals + stat.assists,
          isGoalie: stat.isGoalie,
          user: stat.user
        }));
        res.json(response);
      }
    } catch (error) {
      console.error('Error fetching player stats:', error);
      res.status(500).json({ message: 'Failed to fetch player stats' });
    }
  });
  
  // Get individual player's stats
  app.get('/api/leagues/:leagueId/stats/players/:playerId', isAuthenticated, async (req: any, res) => {
    try {
      const { leagueId, playerId } = req.params;
      const seasonId = Array.isArray(req.query.seasonId) ? req.query.seasonId[0] : req.query.seasonId;
      const userId = req.user.claims.sub;
      
      // Verify user is a member of this league
      const userMembership = await storage.getUserLeagueMembership(userId, leagueId);
      if (!userMembership || userMembership.status !== 'approved') {
        return res.status(403).json({ message: "Access denied - not an approved league member" });
      }
      
      // Validate season ownership if seasonId is provided
      if (seasonId) {
        const season = await storage.getSeason(seasonId);
        if (!season || season.leagueId !== leagueId) {
          return res.status(400).json({ message: "Season not found or does not belong to this league" });
        }
      }
      
      const stats = await storage.getPlayerStatsByUser(playerId, leagueId, seasonId);
      if (!stats) {
        // Return default empty stats instead of 404 for players without stats yet
        return res.json({
          userId: playerId,
          leagueId,
          seasonId: seasonId || null,
          gamesPlayed: 0,
          goals: 0,
          assists: 0,
          penaltyMinutes: 0
        });
      }
      
      res.json(stats);
    } catch (error) {
      console.error('Error fetching individual player stats:', error);
      res.status(500).json({ message: 'Failed to fetch player stats' });
    }
  });
  
  // Create or update player stats (Commissioner only)
  app.post('/api/leagues/:leagueId/stats/players/:playerId', isAuthenticated, async (req: any, res) => {
    try {
      const { leagueId, playerId } = req.params;
      const seasonId = Array.isArray(req.query.seasonId) ? req.query.seasonId[0] : req.query.seasonId;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const league = await storage.getLeague(leagueId);
      
      // Verify user is commissioner of this league
      if (!league || !user || (league.commissionerId !== userId && !(user.role === 'commissioner' || user.role === 'secondary_commissioner' || user.specialPermissions?.includes('admin')))) {
        return res.status(403).json({ message: "Access denied - commissioner access required" });
      }
      
      // Validate season ownership if seasonId is provided
      if (seasonId) {
        const season = await storage.getSeason(seasonId);
        if (!season || season.leagueId !== leagueId) {
          return res.status(400).json({ message: "Season not found or does not belong to this league" });
        }
      }
      
      // Validate target player is in league
      const playerMembership = await storage.getUserLeagueMembership(playerId, leagueId);
      if (!playerMembership || playerMembership.status !== 'approved') {
        return res.status(404).json({ message: "Player not found in this league" });
      }
      
      // Validate request body - only allow stat fields with proper coercion
      const validatedData = insertPlayerStatsSchema.pick({
        gamesPlayed: true,
        goals: true,
        assists: true,
        penaltyMinutes: true,
      }).parse(req.body);
      
      const updatedStats = await storage.updatePlayerStats(
        playerId, 
        leagueId, 
        validatedData,
        seasonId
      );
      
      res.json(updatedStats);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error('Error updating player stats:', error);
      res.status(500).json({ message: 'Failed to update player stats' });
    }
  });

  // Backfill goalie stats for all completed games (Commissioner only)
  app.post('/api/leagues/:leagueId/stats/backfill-goalies', isAuthenticated, async (req: any, res) => {
    try {
      const { leagueId } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const league = await storage.getLeague(leagueId);
      
      // Verify user is commissioner of this league
      if (!league || !user || (league.commissionerId !== userId && !(user.role === 'commissioner' || user.role === 'secondary_commissioner' || user.specialPermissions?.includes('admin')))) {
        return res.status(403).json({ message: "Access denied - commissioner access required" });
      }
      
      const result = await storage.backfillGoalieStats(leagueId);
      res.json(result);
    } catch (error) {
      console.error('Error backfilling goalie stats:', error);
      res.status(500).json({ message: 'Failed to backfill goalie stats' });
    }
  });
  
  // Bulk update player stats (Commissioner only) - useful for "by game" updates
  app.post('/api/leagues/:leagueId/stats/bulk', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const league = await storage.getLeague(leagueId);
      
      // Verify user is commissioner of this league
      if (!league || !user || (league.commissionerId !== userId && !(user.role === 'commissioner' || user.role === 'secondary_commissioner' || user.specialPermissions?.includes('admin')))) {
        return res.status(403).json({ message: "Access denied - commissioner access required" });
      }
      
      // Validate request body structure with proper coercion
      const bulkUpdateSchema = z.object({
        updates: z.array(z.object({
          userId: z.string(),
          stats: insertPlayerStatsSchema.pick({
            gamesPlayed: true,
            goals: true,
            assists: true,
            penaltyMinutes: true,
          }).partial()
        })),
        mode: z.enum(['increment', 'set']).optional().default('set'),
        seasonId: z.string().min(1, "Season ID is required for all stats updates")
      });
      
      const validatedData = bulkUpdateSchema.parse(req.body);
      const seasonId = validatedData.seasonId;
      
      // Validate season ownership if seasonId is provided
      if (seasonId) {
        const season = await storage.getSeason(seasonId);
        if (!season || season.leagueId !== leagueId) {
          return res.status(400).json({ message: "Season not found or does not belong to this league" });
        }
      }
      
      // Verify all target players are in the league
      for (const update of validatedData.updates) {
        const playerMembership = await storage.getUserLeagueMembership(update.userId, leagueId);
        if (!playerMembership || playerMembership.status !== 'approved') {
          return res.status(400).json({ 
            message: `Player ${update.userId} not found in this league` 
          });
        }
      }
      
      // Transform to storage format
      const statsUpdates = validatedData.updates.map(update => ({
        userId: update.userId,
        updates: update.stats
      }));
      
      await storage.bulkUpdatePlayerStats(leagueId, statsUpdates, validatedData.mode, seasonId);
      
      res.json({ message: 'Player stats updated successfully', updatedCount: statsUpdates.length });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error('Error bulk updating player stats:', error);
      res.status(500).json({ message: 'Failed to update player stats' });
    }
  });

  // Messaging API routes
  
  // Get league members for contact discovery (messaging)
  app.get('/api/leagues/:id/contacts', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.id;
      const userId = req.user.claims.sub;
      
      // Check if user is a member of this league
      const userMembership = await storage.getUserLeagueMembership(userId, leagueId);
      if (!userMembership || userMembership.status !== 'approved') {
        return res.status(403).json({ message: "Access denied - not a league member" });
      }
      
      // Check if user has Player Plus subscription for messaging
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Get all league members except the current user
      const allMembers = await storage.getLeagueMembers(leagueId);
      const contacts = allMembers
        .filter(member => member.userId !== userId)
        .map(member => ({
          id: member.user.id,
          firstName: member.user.firstName,
          lastName: member.user.lastName,
          email: member.user.email,
          profileImageUrl: member.user.profileImageUrl,
          displayFirstName: member.displayFirstName,
          displayLastName: member.displayLastName,
          position: member.position,
          jerseyNumber: member.jerseyNumber,
          skillLevel: member.skillLevel
        }));
      
      res.json(contacts);
    } catch (error) {
      console.error("Error fetching league contacts:", error);
      res.status(500).json({ message: "Failed to fetch contacts" });
    }
  });

  // Get user's conversations
  app.get('/api/conversations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { leagueId } = req.query;
      
      const conversations = await messagingService.getUserConversations(userId, leagueId);
      
      // Get participants for each conversation so frontend can display names
      const conversationsWithParticipants = await Promise.all(
        conversations.map(async (conversation) => {
          const participants = await messagingService.getConversationParticipants(conversation.id);
          return {
            ...conversation,
            participants
          };
        })
      );
      
      res.json(conversationsWithParticipants);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      res.status(500).json({ message: 'Failed to fetch conversations' });
    }
  });

  // Get conversation details with participants
  app.get('/api/conversations/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      
      // Verify user is participant
      const isParticipant = await messagingService.isUserInConversation(userId, id);
      if (!isParticipant) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      const conversation = await messagingService.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ message: 'Conversation not found' });
      }
      
      const participants = await messagingService.getConversationParticipants(id);
      
      res.json({
        ...conversation,
        participants
      });
    } catch (error) {
      console.error('Error fetching conversation details:', error);
      res.status(500).json({ message: 'Failed to fetch conversation details' });
    }
  });

  // Create a new direct conversation
  app.post('/api/conversations/direct', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const requestSchema = z.object({
        otherUserId: z.string().min(1),
        leagueId: z.string().min(1).nullish()
      });
      
      const { otherUserId, leagueId } = requestSchema.parse(req.body);
      
      // Check if conversation already exists
      const existingConversation = await messagingService.findDirectConversation(userId, otherUserId, leagueId || null);
      if (existingConversation) {
        const participants = await messagingService.getConversationParticipants(existingConversation.id);
        return res.json({
          ...existingConversation,
          participants
        });
      }
      
      // Create new conversation
      const conversation = await messagingService.createDirectConversation(userId, otherUserId, leagueId || null);
      const participants = await messagingService.getConversationParticipants(conversation.id);
      
      res.status(201).json({
        ...conversation,
        participants
      });
    } catch (error) {
      console.error('Error creating direct conversation:', error);
      res.status(500).json({ message: 'Failed to create conversation' });
    }
  });

  // Create a team group conversation
  app.post('/api/conversations/team-group', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const requestSchema = z.object({
        teamId: z.string().min(1),
        leagueId: z.string().min(1)
      });
      
      const { teamId, leagueId } = requestSchema.parse(req.body);
      
      // Check if team group conversation already exists
      const conversation = await messagingService.createTeamGroupChat(teamId, leagueId, userId);
      const participants = await messagingService.getConversationParticipants(conversation.id);
      
      res.status(201).json({
        ...conversation,
        participants
      });
    } catch (error) {
      console.error('Error creating team group conversation:', error);
      res.status(500).json({ message: 'Failed to create team group conversation' });
    }
  });

  // Create a custom group conversation
  app.post('/api/conversations/custom-group', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const requestSchema = z.object({
        title: z.string().min(1).max(100),
        leagueId: z.string().min(1),
        participantIds: z.array(z.string().min(1)).min(1).max(20)
      });
      
      const { title, leagueId, participantIds } = requestSchema.parse(req.body);
      
      // Create custom group conversation
      const conversation = await messagingService.createCustomGroupChat(title, leagueId, userId, participantIds);
      const participants = await messagingService.getConversationParticipants(conversation.id);
      
      res.status(201).json({
        ...conversation,
        participants
      });
    } catch (error) {
      console.error('Error creating custom group conversation:', error);
      res.status(500).json({ message: 'Failed to create custom group conversation' });
    }
  });

  // Add user to group conversation
  app.post('/api/conversations/:id/participants', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      const requestSchema = z.object({
        userId: z.string().min(1)
      });
      
      const { userId: targetUserId } = requestSchema.parse(req.body);
      
      // Verify user has permission to add participants (participant in conversation)
      const isParticipant = await messagingService.isUserInConversation(userId, id);
      if (!isParticipant) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      const participant = await messagingService.addUserToGroupConversation(id, targetUserId);
      res.status(201).json(participant);
    } catch (error) {
      console.error('Error adding user to conversation:', error);
      res.status(500).json({ message: 'Failed to add user to conversation' });
    }
  });

  // Remove user from group conversation
  app.delete('/api/conversations/:id/participants/:userId', isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user.claims.sub;
      const { id, userId } = req.params;
      
      // Enhanced permission check - allow removal if user can manage conversation
      const conversation = await messagingService.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ message: 'Conversation not found' });
      }
      
      const canManage = await messagingService.canUserManageConversation(currentUserId, id);
      if (currentUserId !== userId && !canManage) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      await messagingService.removeUserFromGroupConversation(id, userId);
      res.status(204).send();
    } catch (error) {
      console.error('Error removing user from conversation:', error);
      res.status(500).json({ message: 'Failed to remove user from conversation' });
    }
  });

  // Create captain-only chat
  app.post('/api/conversations/captain-only', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const requestSchema = z.object({
        leagueId: z.string().min(1)
      });
      
      const { leagueId } = requestSchema.parse(req.body);
      
      // Verify user is a captain in this league
      const isCaptain = await messagingService.isUserCaptain(userId, leagueId);
      if (!isCaptain) {
        return res.status(403).json({ message: 'Only team captains can create captain-only chats' });
      }
      
      const conversation = await messagingService.createCaptainOnlyChat(leagueId, userId);
      const participants = await messagingService.getConversationParticipants(conversation.id);
      
      res.status(201).json({
        ...conversation,
        participants
      });
    } catch (error) {
      console.error('Error creating captain-only conversation:', error);
      res.status(500).json({ message: 'Failed to create captain-only conversation' });
    }
  });

  // Ensure captain chat membership is up-to-date for a league
  app.post('/api/leagues/:id/captain-chat/sync', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id: leagueId } = req.params;
      
      // Verify user is a captain in this league
      const isCaptain = await messagingService.isUserCaptain(userId, leagueId);
      if (!isCaptain) {
        return res.status(403).json({ message: 'Only team captains can manage captain chats' });
      }
      
      // Sync captain chat membership
      await messagingService.ensureCaptainChatMembership(leagueId);
      
      res.status(200).json({ message: 'Captain chat membership synced successfully' });
    } catch (error) {
      console.error('Error syncing captain chat membership:', error);
      res.status(500).json({ message: 'Failed to sync captain chat membership' });
    }
  });

  // Leave conversation (SMS-style for direct/captain, group removal for others)
  app.post('/api/conversations/:id/leave', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      
      // Check if conversation exists
      const conversation = await messagingService.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ message: 'Conversation not found' });
      }
      
      // Check if user is actually in the conversation
      const isParticipant = await messagingService.isUserInConversation(userId, id);
      if (!isParticipant) {
        return res.status(400).json({ message: 'You are not a participant in this conversation' });
      }
      
      // Handle different conversation types
      if (conversation.type === 'direct' || conversation.type === 'captain_only') {
        // SMS-style leave: hide conversation and clear history from user's view only
        await messagingService.leaveConversationSMSStyle(id, userId);
        res.status(200).json({ message: 'Successfully left conversation' });
      } else {
        // Group conversations: remove user from participants entirely  
        await messagingService.removeUserFromGroupConversation(id, userId);
        res.status(200).json({ message: 'Successfully left conversation' });
      }
    } catch (error) {
      console.error('Error leaving conversation:', error);
      res.status(500).json({ message: 'Failed to leave conversation' });
    }
  });

  // Delete conversation
  app.delete('/api/conversations/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      
      // Check if conversation exists
      const conversation = await messagingService.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ message: 'Conversation not found' });
      }
      
      // Captain-only chats cannot be deleted
      if (conversation.type === 'captain_only') {
        return res.status(403).json({ message: 'Captain-only chats cannot be deleted' });
      }
      
      // Check permissions
      const canManage = await messagingService.canUserManageConversation(userId, id);
      if (!canManage) {
        return res.status(403).json({ message: 'Only conversation creators and team captains can delete conversations' });
      }
      
      await messagingService.deleteConversation(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting conversation:', error);
      res.status(500).json({ message: 'Failed to delete conversation' });
    }
  });

  // Get conversation members with status
  app.get('/api/conversations/:id/members', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      
      // Verify user is participant
      const isParticipant = await messagingService.isUserInConversation(userId, id);
      if (!isParticipant) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      const members = await messagingService.getConversationMembersWithStatus(id);
      const memberCount = await messagingService.getConversationMemberCount(id);
      
      res.json({
        members,
        count: memberCount
      });
    } catch (error) {
      console.error('Error fetching conversation members:', error);
      res.status(500).json({ message: 'Failed to fetch conversation members' });
    }
  });

  // Get conversation messages
  app.get('/api/conversations/:id/messages', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      const querySchema = z.object({
        limit: z.coerce.number().min(1).max(100).default(50),
        before: z.string().optional()
      });
      
      const { limit, before } = querySchema.parse(req.query);
      
      // Verify user is participant
      const isParticipant = await messagingService.isUserInConversation(userId, id);
      if (!isParticipant) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      const messages = await messagingService.getConversationMessagesForUser(id, userId, limit);
      
      // Import Supabase storage service for signed URLs
      const { SupabaseStorageService } = await import('./supabaseStorage');
      const supabaseStorageService = new SupabaseStorageService();
      
      // Get attachments and read receipts for each message
      const messagesWithDetails = await Promise.all(
        messages.map(async (message) => {
          const attachments = await messagingService.getMessageAttachments(message.id);
          const readReceipts = await messagingService.getMessageReadReceipts(message.id);
          
          // Convert attachment paths to signed URLs for images
          const attachmentsWithSignedUrls = await Promise.all(
            attachments.map(async (attachment) => {
              // Only convert paths that start with /message-attachments/
              if (attachment.url && attachment.url.startsWith('/message-attachments/')) {
                const signedUrl = await supabaseStorageService.getMessageAttachmentSignedUrl(attachment.url);
                return {
                  ...attachment,
                  url: signedUrl || attachment.url
                };
              }
              return attachment;
            })
          );
          
          return {
            ...message,
            sentAt: message.createdAt, // Map createdAt to sentAt for frontend compatibility
            attachments: attachmentsWithSignedUrls,
            readReceipts
          };
        })
      );
      
      res.json(messagesWithDetails);
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ message: 'Failed to fetch messages' });
    }
  });

  // Send a new message
  app.post('/api/conversations/:id/messages', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id: conversationId } = req.params;
      const requestSchema = z.object({
        content: z.string().min(1).max(10000),
        messageType: z.enum(['text', 'image', 'gif', 'file', 'poll']).default('text'),
        replyToId: z.string().optional(),
        attachments: z.array(z.object({
          fileName: z.string(),
          fileUrl: z.string().regex(/^(https?:\/\/|\/message-attachments\/)/, {
            message: 'fileUrl must be a valid URL or a /message-attachments/ path'
          }),
          fileType: z.string(),
          fileSize: z.number().min(0)
        })).optional()
      });
      
      const { content, messageType, replyToId, attachments } = requestSchema.parse(req.body);
      
      // Verify user is participant
      const isParticipant = await messagingService.isUserInConversation(userId, conversationId);
      if (!isParticipant) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Free tier restriction: can only send messages in team_group conversations
      const senderUser = await storage.getUser(userId);
      if (senderUser && (senderUser.role === 'free_tier' || !senderUser.role)) {
        const conversation = await messagingService.getConversation(conversationId);
        if (!conversation || conversation.type !== 'team_group') {
          return res.status(403).json({ message: 'A Player Pro subscription is required to reply in this conversation.' });
        }
      }
      
      // Create message
      const message = await messagingService.createMessage({
        conversationId,
        senderId: userId,
        content,
        messageType,
        replyToId
      });
      
      // Add attachments if any
      let messageAttachments = [];
      const { SupabaseStorageService } = await import('./supabaseStorage');
      const supabaseStorageService = new SupabaseStorageService();
      
      if (attachments && attachments.length > 0) {
        for (const attachment of attachments) {
          // Validate file size (10MB limit)
          if (attachment.fileSize > 10 * 1024 * 1024) {
            return res.status(400).json({ message: 'File size exceeds 10MB limit' });
          }
          
          // Normalize the file URL to use app route
          const normalizedUrl = supabaseStorageService.normalizeMessageAttachmentPath(attachment.fileUrl);
          
          // Determine attachment type from MIME type
          let attachmentType = 'file';
          if (attachment.fileType.startsWith('image/')) {
            attachmentType = attachment.fileType === 'image/gif' ? 'gif' : 'image';
          }
          
          const messageAttachment = await messagingService.createMessageAttachment({
            messageId: message.id,
            type: attachmentType,
            url: normalizedUrl,
            filename: attachment.fileName,
            fileSize: attachment.fileSize,
            mimeType: attachment.fileType
          });
          messageAttachments.push(messageAttachment);
        }
      }
      
      // Convert attachment paths to signed URLs
      const attachmentsWithSignedUrls = await Promise.all(
        messageAttachments.map(async (attachment) => {
          if (attachment.url && attachment.url.startsWith('/message-attachments/')) {
            const signedUrl = await supabaseStorageService.getMessageAttachmentSignedUrl(attachment.url);
            return {
              ...attachment,
              url: signedUrl || attachment.url
            };
          }
          return attachment;
        })
      );
      
      // Broadcast message to all participants via WebSocket
      const participants = await messagingService.getConversationParticipants(conversationId);
      broadcastToParticipants(participants, {
        type: 'message',
        conversationId,
        message: {
          ...message,
          sentAt: message.createdAt, // Map for frontend compatibility
          attachments: attachmentsWithSignedUrls,
          readReceipts: []
        }
      });

      // Send push notifications to other participants (async, don't wait)
      (async () => {
        try {
          console.log('[Message Notification Debug] Starting notification process for message in conversation:', conversationId);
          console.log('[Message Notification Debug] Sender userId:', userId);
          console.log('[Message Notification Debug] All participants:', JSON.stringify(participants.map(p => ({ id: p.id, oderId: p.userId, name: (p as any).firstName }))));
          
          const sender = await storage.getUser(userId);
          const senderName = sender ? `${sender.firstName} ${sender.lastName}`.trim() || sender.email : 'Someone';
          console.log('[Message Notification Debug] Sender name:', senderName);
          
          // Use userId (actual user UUID) instead of id (participant record ID)
          const recipientIds = participants
            .filter(p => p.userId !== undefined && p.userId !== null)
            .map(p => p.userId as string)
            .filter(id => id !== userId);
          
          console.log('[Message Notification Debug] Recipient user IDs (after filtering sender):', recipientIds);
          
          if (recipientIds.length > 0) {
            console.log('[Message Notification Debug] Calling sendMessageNotification for', recipientIds.length, 'recipients');
            const { sendMessagePushNotification } = await import('./oneSignalNotifications');
            for (const recipientId of recipientIds) {
              await sendMessagePushNotification(
                userId,
                senderName,
                recipientId,
                conversationId,
                content
              );
            }
            console.log('[Message Notification Debug] Push notifications sent');
          } else {
            console.log('[Message Notification Debug] No recipients to notify (empty list after filtering)');
          }
        } catch (notifError) {
          console.error('[Notifications] Failed to send message notifications:', notifError);
        }
      })();

      res.status(201).json({
        ...message,
        sentAt: message.createdAt, // Map for frontend compatibility
        attachments: attachmentsWithSignedUrls,
        readReceipts: []
      });
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({ message: 'Failed to send message' });
    }
  });

  // Mark message as read
  app.post('/api/messages/:id/read', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id: messageId } = req.params;
      
      // Get message to verify access
      const message = await messagingService.getMessage(messageId);
      if (!message) {
        return res.status(404).json({ message: 'Message not found' });
      }
      
      // Verify user is participant in conversation
      const isParticipant = await messagingService.isUserInConversation(userId, message.conversationId);
      if (!isParticipant) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      const readReceipt = await messagingService.markMessageAsRead(messageId, userId);
      res.json(readReceipt);
    } catch (error) {
      console.error('Error marking message as read:', error);
      res.status(500).json({ message: 'Failed to mark message as read' });
    }
  });

  // Get user's online status
  app.get('/api/users/:id/status', isAuthenticated, async (req: any, res) => {
    try {
      const { id: targetUserId } = req.params;
      
      const status = await messagingService.getUserOnlineStatus(targetUserId);
      res.json(status || { userId: targetUserId, status: 'offline', lastSeenAt: null });
    } catch (error) {
      console.error('Error fetching user status:', error);
      res.status(500).json({ message: 'Failed to fetch user status' });
    }
  });

  // Get conversation typing indicators
  app.get('/api/conversations/:id/typing', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      
      // Verify user is participant
      const isParticipant = await messagingService.isUserInConversation(userId, id);
      if (!isParticipant) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      const typingIndicators = await messagingService.getTypingIndicators(id);
      // Filter out expired indicators (older than 5 seconds)
      const now = new Date();
      const activeIndicators = typingIndicators.filter(indicator => 
        indicator.expiresAt && indicator.expiresAt > now
      );
      
      res.json(activeIndicators);
    } catch (error) {
      console.error('Error fetching typing indicators:', error);
      res.status(500).json({ message: 'Failed to fetch typing indicators' });
    }
  });

  // Get unread message count for current user
  app.get('/api/messages/unread-count', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const unreadCount = await messagingService.getUnreadMessageCount(userId);
      res.json({ count: unreadCount });
    } catch (error) {
      console.error('Error fetching unread message count:', error);
      res.status(500).json({ message: 'Failed to fetch unread message count' });
    }
  });

  // Get unread message count per conversation for current user
  app.get('/api/messages/unread-count-per-conversation', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const unreadCounts = await messagingService.getUnreadMessageCountPerConversation(userId);
      res.json({ unreadCounts });
    } catch (error) {
      console.error('Error fetching unread message count per conversation:', error);
      res.status(500).json({ message: 'Failed to fetch unread message count per conversation' });
    }
  });

  // Mark all messages in a conversation as read - MOVED AFTER WEBSOCKET SETUP
  // (This route is defined later in the file to have access to WebSocket connections)

  // ===== NOTIFICATION SUMMARY FOR DASHBOARD DROPDOWN =====
  
  // Get notification counts for all user's leagues and tournaments
  app.get('/api/user/notification-counts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get all user's approved league memberships
      const userLeagueMemberships = await db
        .select({
          leagueId: leagueMemberships.leagueId,
        })
        .from(leagueMemberships)
        .where(
          and(
            eq(leagueMemberships.userId, userId),
            eq(leagueMemberships.status, 'approved')
          )
        );
      
      // Get all user's paid tournaments
      const userTournaments = await db
        .select({
          tournamentId: tournamentParticipants.tournamentId,
        })
        .from(tournamentParticipants)
        .where(
          and(
            eq(tournamentParticipants.userId, userId),
            eq(tournamentParticipants.status, 'approved')
          )
        );
      
      // Get leagues where user is commissioner
      const commissionerLeagues = await db
        .select({ id: leagues.id })
        .from(leagues)
        .where(eq(leagues.commissionerId, userId));
      
      // Combine all league IDs
      const allLeagueIds = new Set([
        ...userLeagueMemberships.map(m => m.leagueId),
        ...commissionerLeagues.map(l => l.id)
      ]);
      
      // Fetch notification counts for each league
      const leagueNotifications: Record<string, number> = {};
      
      for (const leagueId of allLeagueIds) {
        try {
          // Get unread announcement count
          const unreadCount = await storage.getUnreadAnnouncementCount(leagueId, userId);
          
          // Check if user is commissioner of this league
          const [league] = await db
            .select({ commissionerId: leagues.commissionerId })
            .from(leagues)
            .where(eq(leagues.id, leagueId));
          
          const isCommissioner = league?.commissionerId === userId;
          
          let todoCount = 0;
          
          if (isCommissioner) {
            // Get pending members count
            const pendingMembersResult = await db
              .select({ count: sql<number>`CAST(COUNT(*) AS INTEGER)` })
              .from(leagueMemberships)
              .where(
                and(
                  eq(leagueMemberships.leagueId, leagueId),
                  eq(leagueMemberships.status, 'pending')
                )
              );
            todoCount += pendingMembersResult[0]?.count || 0;
          }
          
          leagueNotifications[leagueId] = unreadCount + todoCount;
        } catch (error) {
          // If fetching fails for a league, just set to 0
          leagueNotifications[leagueId] = 0;
        }
      }
      
      // Fetch notification counts for each tournament
      const tournamentNotifications: Record<string, number> = {};
      
      for (const { tournamentId } of userTournaments) {
        try {
          const unreadCount = await storage.getUnreadTournamentAnnouncementCount(tournamentId, userId);
          tournamentNotifications[tournamentId] = unreadCount;
        } catch (error) {
          tournamentNotifications[tournamentId] = 0;
        }
      }
      
      res.json({
        leagues: leagueNotifications,
        tournaments: tournamentNotifications
      });
    } catch (error) {
      console.error('Error fetching notification counts:', error);
      res.status(500).json({ message: 'Failed to fetch notification counts' });
    }
  });

  // ===== ADMIN / DEBUG ROUTES =====
  
  // Sync all captain chats
  app.post('/api/admin/sync-all-captain-chats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get all leagues
      const allLeagues = await db
        .select({ id: leagues.id })
        .from(leagues);
      
      
      let synced = 0;
      let failed = 0;
      const errors: string[] = [];
      
      for (const league of allLeagues) {
        try {
          await messagingService.ensureCaptainChatMembership(league.id);
          synced++;
        } catch (error) {
          failed++;
          const errorMsg = `Failed to sync captain chat for league ${league.id}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          console.error(errorMsg);
        }
      }
      
      
      res.json({
        success: true,
        message: `Synced ${synced} captain chats`,
        synced,
        failed,
        total: allLeagues.length,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      console.error('Error syncing captain chats:', error);
      res.status(500).json({ 
        message: 'Failed to sync captain chats',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Sync all team chat participants
  app.post('/api/admin/sync-all-team-chats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get all teams with a league_id (only those can have team chats)
      const teamsWithLeagues = await db
        .select({ id: teams.id, leagueId: teams.leagueId })
        .from(teams)
        .where(sql`${teams.leagueId} IS NOT NULL`);
      
      
      let synced = 0;
      let failed = 0;
      const errors: string[] = [];
      
      for (const team of teamsWithLeagues) {
        try {
          await messagingService.syncTeamChatParticipants(team.id, team.leagueId);
          synced++;
        } catch (error) {
          failed++;
          const errorMsg = `Failed to sync team ${team.id}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          console.error(errorMsg);
        }
      }
      
      
      res.json({
        success: true,
        message: `Synced ${synced} team chats`,
        synced,
        failed,
        total: teamsWithLeagues.length,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      console.error('Error syncing team chats:', error);
      res.status(500).json({ 
        message: 'Failed to sync team chats',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // ===== CHAT POLL ROUTES =====

  // Create a poll on a message
  app.post('/api/messages/:id/polls', isAuthenticated, async (req: any, res) => {
    try {
      const messageId = req.params.id;
      const userId = req.user.claims.sub;

      // Get message to check if user can create polls on it
      const message = await messagingService.getMessageById(messageId);
      if (!message) {
        return res.status(404).json({ message: 'Message not found' });
      }

      // Check if user is participant in the conversation
      const isParticipant = await messagingService.isUserInConversation(userId, message.conversationId);
      if (!isParticipant) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Only the message sender can add polls to their message
      if (message.senderId !== userId) {
        return res.status(403).json({ message: 'Only message sender can add polls' });
      }

      const pollData = createChatPollRequestSchema.parse(req.body);
      const poll = await messagingService.createChatPoll({
        ...pollData,
        messageId,
      });

      // Broadcast poll creation to all conversation participants via WebSocket
      const participants = await messagingService.getConversationParticipants(message.conversationId);
      broadcastToParticipants(participants, {
        type: 'poll_created',
        conversationId: message.conversationId,
        messageId,
        poll,
        createdBy: userId
      });

      res.json(poll);
    } catch (error) {
      console.error('Error creating chat poll:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid poll data', details: error.errors });
      }
      res.status(500).json({ message: 'Failed to create poll' });
    }
  });

  // Vote on a chat poll
  app.post('/api/chat-polls/:id/votes', isAuthenticated, async (req: any, res) => {
    try {
      const pollId = req.params.id;
      const userId = req.user.claims.sub;
      const { optionIndex } = req.body;

      if (optionIndex === undefined || optionIndex < 0) {
        return res.status(400).json({ message: 'Valid option index is required' });
      }

      // Get the poll to find the message it belongs to
      const poll = await messagingService.getChatPoll(pollId);
      if (!poll) {
        return res.status(404).json({ message: 'Poll not found' });
      }

      // Check if poll is still active
      if (poll.status === 'closed') {
        return res.status(400).json({ message: 'Poll is closed' });
      }

      // Chat polls don't have expiration - this check is only for announcement polls

      // Get message to check conversation access
      const message = await messagingService.getMessageById(poll.messageId);
      if (!message) {
        return res.status(404).json({ message: 'Message not found' });
      }

      // Check if user is participant in the conversation
      const isParticipant = await messagingService.isUserInConversation(userId, message.conversationId);
      if (!isParticipant) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Check if user has already voted
      const existingVote = await messagingService.getUserVoteOnPoll(pollId, userId);
      if (existingVote) {
        return res.status(400).json({ message: 'You have already voted on this poll' });
      }

      // Validate option index
      const options = poll.options as any[];
      if (optionIndex >= options.length) {
        return res.status(400).json({ message: 'Invalid option index' });
      }

      const vote = await messagingService.voteOnChatPoll({
        pollId,
        userId,
        optionIndex,
      });

      // Broadcast vote update to all conversation participants via WebSocket
      const participants = await messagingService.getConversationParticipants(message.conversationId);
      broadcastToParticipants(participants, {
        type: 'poll_vote',
        conversationId: message.conversationId,
        pollId,
        vote,
        votedBy: userId
      });

      res.json(vote);
    } catch (error) {
      console.error('Error voting on chat poll:', error);
      res.status(500).json({ message: 'Failed to vote on poll' });
    }
  });

  // Get poll results
  app.get('/api/chat-polls/:id/results', isAuthenticated, async (req: any, res) => {
    try {
      const pollId = req.params.id;
      const userId = req.user.claims.sub;

      // Get the poll to find the message it belongs to
      const poll = await messagingService.getChatPoll(pollId);
      if (!poll) {
        return res.status(404).json({ message: 'Poll not found' });
      }

      // Get message to check conversation access
      const message = await messagingService.getMessageById(poll.messageId);
      if (!message) {
        return res.status(404).json({ message: 'Message not found' });
      }

      // Check if user is participant in the conversation
      const isParticipant = await messagingService.isUserInConversation(userId, message.conversationId);
      if (!isParticipant) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const results = await messagingService.getChatPollResults(pollId);
      res.json(results);
    } catch (error) {
      console.error('Error fetching poll results:', error);
      res.status(500).json({ message: 'Failed to fetch poll results' });
    }
  });

  // Close a chat poll
  app.post('/api/chat-polls/:id/close', isAuthenticated, async (req: any, res) => {
    try {
      const pollId = req.params.id;
      const userId = req.user.claims.sub;

      // Get the poll to find the message it belongs to
      const poll = await messagingService.getChatPoll(pollId);
      if (!poll) {
        return res.status(404).json({ message: 'Poll not found' });
      }

      // Get message to check permissions
      const message = await messagingService.getMessageById(poll.messageId);
      if (!message) {
        return res.status(404).json({ message: 'Message not found' });
      }

      // Check if user is participant in the conversation
      const isParticipant = await messagingService.isUserInConversation(userId, message.conversationId);
      if (!isParticipant) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Only poll creator (message sender) can close the poll
      if (message.senderId !== userId) {
        return res.status(403).json({ message: 'Only poll creator can close the poll' });
      }

      const closedPoll = await messagingService.closeChatPoll(pollId);

      // Broadcast poll closure to all conversation participants via WebSocket
      const participants = await messagingService.getConversationParticipants(message.conversationId);
      broadcastToParticipants(participants, {
        type: 'poll_closed',
        conversationId: message.conversationId,
        pollId,
        poll: closedPoll,
        closedBy: userId
      });

      res.json(closedPoll);
    } catch (error) {
      console.error('Error closing chat poll:', error);
      res.status(500).json({ message: 'Failed to close poll' });
    }
  });

  // Get polls for a message
  app.get('/api/messages/:id/polls', isAuthenticated, async (req: any, res) => {
    try {
      const messageId = req.params.id;
      const userId = req.user.claims.sub;

      // Get message to check conversation access
      const message = await messagingService.getMessageById(messageId);
      if (!message) {
        return res.status(404).json({ message: 'Message not found' });
      }

      // Check if user is participant in the conversation
      const isParticipant = await messagingService.isUserInConversation(userId, message.conversationId);
      if (!isParticipant) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const polls = await messagingService.getChatPollsByMessage(messageId);
      res.json(polls);
    } catch (error) {
      console.error('Error fetching message polls:', error);
      res.status(500).json({ message: 'Failed to fetch polls' });
    }
  });

  // ===== GIPHY API ROUTES =====
  
  // Import Giphy service
  const { giphyService } = await import('./giphyService');

  // Search GIFs
  app.get('/api/giphy/search', isAuthenticated, async (req: any, res) => {
    try {
      const { q: query, limit = 25, offset = 0 } = req.query;
      
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ message: 'Search query is required' });
      }

      const result = await giphyService.searchGifs(query, {
        limit: parseInt(limit as string) || 25,
        offset: parseInt(offset as string) || 0
      });

      res.json(result);
    } catch (error) {
      console.error('Error searching GIFs:', error);
      res.status(500).json({ message: 'Failed to search GIFs' });
    }
  });

  // Get trending GIFs
  app.get('/api/giphy/trending', isAuthenticated, async (req: any, res) => {
    try {
      const { limit = 25, offset = 0 } = req.query;

      const result = await giphyService.getTrendingGifs({
        limit: parseInt(limit as string) || 25,
        offset: parseInt(offset as string) || 0
      });

      res.json(result);
    } catch (error) {
      console.error('Error getting trending GIFs:', error);
      res.status(500).json({ message: 'Failed to get trending GIFs' });
    }
  });

  // Get category GIFs
  app.get('/api/giphy/category/:category', isAuthenticated, async (req: any, res) => {
    try {
      const { category } = req.params;
      const { limit = 25, offset = 0 } = req.query;

      const result = await giphyService.getCategoryGifs(category, {
        limit: parseInt(limit as string) || 25,
        offset: parseInt(offset as string) || 0
      });

      res.json(result);
    } catch (error) {
      console.error('Error getting category GIFs:', error);
      res.status(500).json({ message: 'Failed to get category GIFs' });
    }
  });

  // Get GIF by ID
  app.get('/api/giphy/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const gif = await giphyService.getGifById(id);
      if (!gif) {
        return res.status(404).json({ message: 'GIF not found' });
      }

      res.json(gif);
    } catch (error) {
      console.error('Error getting GIF by ID:', error);
      res.status(500).json({ message: 'Failed to get GIF' });
    }
  });

  // User Management API Routes - Admin Only
  
  // Get all users (for admin user management)
  app.get('/api/admin/users', isAuthenticated, loadUserPermissions, requireUserManagement, async (req: any, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error('Error fetching all users:', error);
      res.status(500).json({ message: 'Failed to fetch users' });
    }
  });
  
  // Update user role and permissions
  app.patch('/api/admin/users/:userId/permissions', isAuthenticated, loadUserPermissions, requireUserManagement, async (req: any, res) => {
    try {
      const targetUserId = req.params.userId;
      const updatedById = req.user.claims.sub;
      const { role, specialPermissions, isPrimaryCommissioner } = req.body;
      
      // Validate input
      if (!role) {
        return res.status(400).json({ message: 'Role is required' });
      }
      
      const permissionData: any = { role };
      if (specialPermissions !== undefined) permissionData.specialPermissions = specialPermissions;
      if (isPrimaryCommissioner !== undefined) permissionData.isPrimaryCommissioner = isPrimaryCommissioner;
      
      const updatedUser = await storage.updateUserPermissions(targetUserId, permissionData);
      res.json(updatedUser);
    } catch (error) {
      console.error('Error updating user permissions:', error);
      res.status(500).json({ message: 'Failed to update user permissions' });
    }
  });
  
  // Get users by league (for league-specific user management)
  app.get('/api/leagues/:leagueId/users', isAuthenticated, loadUserPermissions, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const userId = req.user.claims.sub;
      const userPermissions = (req as any).userWithPermissions;
      
      // Check if user can manage this league (commissioner of this league, or admin/primary commissioner)
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }
      
      const canManageLeague = league.commissionerId === userId || 
                             userPermissions.specialPermissions?.includes('admin') ||
                             userPermissions.isPrimaryCommissioner;
                             
      if (!canManageLeague) {
        return res.status(403).json({ message: 'Access denied - insufficient permissions' });
      }
      
      const leagueUsers = await storage.getLeagueUsersWithPermissions(leagueId);
      res.json(leagueUsers);
    } catch (error) {
      console.error('Error fetching league users:', error);
      res.status(500).json({ message: 'Failed to fetch league users' });
    }
  });

  // Update league-specific user permissions
  app.patch('/api/leagues/:leagueId/users/:userId/permissions', isAuthenticated, loadUserPermissions, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const targetUserId = req.params.userId;
      const updatingUserId = req.user.claims.sub;
      const { leagueRole, leagueSpecialPermissions } = req.body;
      
      // Check if user can manage this league
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }
      
      const userPermissions = (req as any).userWithPermissions;
      const canManageLeague = league.commissionerId === updatingUserId || 
                             userPermissions.specialPermissions?.includes('admin') ||
                             userPermissions.isPrimaryCommissioner;
                             
      if (!canManageLeague) {
        return res.status(403).json({ message: 'Access denied - insufficient permissions' });
      }
      
      const updates: any = {};
      if (leagueRole !== undefined) updates.leagueRole = leagueRole;
      if (leagueSpecialPermissions !== undefined) updates.leagueSpecialPermissions = leagueSpecialPermissions;
      
      const updatedMembership = await storage.updateLeagueUserPermissions(targetUserId, leagueId, updates);
      res.json(updatedMembership);
    } catch (error) {
      console.error('Error updating league user permissions:', error);
      res.status(500).json({ message: 'Failed to update league user permissions' });
    }
  });

  // Add league special permission
  app.post('/api/leagues/:leagueId/users/:userId/special-permissions/:permission', isAuthenticated, loadUserPermissions, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const targetUserId = req.params.userId;
      const permission = req.params.permission as 'admin' | 'stat_manager';
      const updatingUserId = req.user.claims.sub;
      
      // Validate permission type
      if (!['admin', 'stat_manager'].includes(permission)) {
        return res.status(400).json({ message: 'Invalid permission type' });
      }
      
      // Check if user can manage this league
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }
      
      const userPermissions = (req as any).userWithPermissions;
      const canManageLeague = league.commissionerId === updatingUserId || 
                             userPermissions.specialPermissions?.includes('admin') ||
                             userPermissions.isPrimaryCommissioner;
                             
      if (!canManageLeague) {
        return res.status(403).json({ message: 'Access denied - insufficient permissions' });
      }
      
      const updatedMembership = await storage.addLeagueSpecialPermission(targetUserId, leagueId, permission);
      res.json(updatedMembership);
    } catch (error) {
      console.error('Error adding league special permission:', error);
      res.status(500).json({ message: 'Failed to add league special permission' });
    }
  });

  // Remove league special permission
  app.delete('/api/leagues/:leagueId/users/:userId/special-permissions/:permission', isAuthenticated, loadUserPermissions, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const targetUserId = req.params.userId;
      const permission = req.params.permission as 'admin' | 'stat_manager';
      const updatingUserId = req.user.claims.sub;
      
      // Validate permission type
      if (!['admin', 'stat_manager'].includes(permission)) {
        return res.status(400).json({ message: 'Invalid permission type' });
      }
      
      // Check if user can manage this league
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }
      
      const userPermissions = (req as any).userWithPermissions;
      const canManageLeague = league.commissionerId === updatingUserId || 
                             userPermissions.specialPermissions?.includes('admin') ||
                             userPermissions.isPrimaryCommissioner;
                             
      if (!canManageLeague) {
        return res.status(403).json({ message: 'Access denied - insufficient permissions' });
      }
      
      const updatedMembership = await storage.removeLeagueSpecialPermission(targetUserId, leagueId, permission);
      res.json(updatedMembership);
    } catch (error) {
      console.error('Error removing league special permission:', error);
      res.status(500).json({ message: 'Failed to remove league special permission' });
    }
  });

  // Get user's league-specific permissions
  app.get('/api/leagues/:leagueId/users/:userId/permissions', isAuthenticated, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const targetUserId = req.params.userId;
      const requestingUserId = req.user.claims.sub;
      
      // Users can only view their own permissions unless they have management rights
      if (targetUserId !== requestingUserId) {
        const league = await storage.getLeague(leagueId);
        if (!league) {
          return res.status(404).json({ message: 'League not found' });
        }
        
        const userPermissions = await storage.getUserLeaguePermissions(requestingUserId, leagueId);
        const canViewPermissions = league.commissionerId === requestingUserId || 
                                 userPermissions?.leagueSpecialPermissions?.includes('admin');
                                 
        if (!canViewPermissions) {
          return res.status(403).json({ message: 'Access denied - insufficient permissions' });
        }
      }
      
      const permissions = await storage.getUserLeaguePermissions(targetUserId, leagueId);
      if (!permissions) {
        return res.status(404).json({ message: 'User not found in league' });
      }
      
      res.json(permissions);
    } catch (error) {
      console.error('Error fetching user league permissions:', error);
      res.status(500).json({ message: 'Failed to fetch user league permissions' });
    }
  });

  // Invite scorekeeper by email - creates membership and adds stat_manager permission
  app.post('/api/leagues/:leagueId/invite-scorekeeper', isAuthenticated, loadUserPermissions, async (req: any, res) => {
    try {
      const leagueId = req.params.leagueId;
      const invitingUserId = req.user.claims.sub;
      const { email } = req.body;
      
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ message: 'Email is required' });
      }
      
      const normalizedEmail = email.toLowerCase().trim();
      
      // Check if user can manage this league
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }
      
      const userPermissions = (req as any).userWithPermissions;
      const canManageLeague = league.commissionerId === invitingUserId || 
                             userPermissions.specialPermissions?.includes('admin') ||
                             userPermissions.isPrimaryCommissioner;
                             
      if (!canManageLeague) {
        return res.status(403).json({ message: 'Access denied - only commissioners can invite scorekeepers' });
      }
      
      // Find user by email
      const targetUser = await storage.getUserByEmail(normalizedEmail);
      
      if (!targetUser) {
        return res.status(404).json({ 
          message: 'User not found. They must create an account first with this email address.',
          code: 'USER_NOT_FOUND'
        });
      }
      
      // Check if user already has a membership in this league
      let membership = await storage.getUserLeagueMembership(targetUser.id, leagueId);
      
      if (!membership) {
        // Create a new membership (auto-approved for scorekeeper invitations)
        membership = await storage.requestLeagueMembership({
          userId: targetUser.id,
          leagueId,
        });
        // Immediately approve the membership
        membership = await storage.approveLeagueMembership(membership.id, invitingUserId);
      } else if (membership.status !== 'approved') {
        // If membership exists but not approved, approve it
        membership = await storage.approveLeagueMembership(membership.id, invitingUserId);
      }
      
      // Add stat_manager permission
      const currentPermissions = membership.leagueSpecialPermissions || [];
      if (!currentPermissions.includes('stat_manager')) {
        membership = await storage.addLeagueSpecialPermission(targetUser.id, leagueId, 'stat_manager');
      }
      
      res.json({ 
        message: 'Scorekeeper invited successfully',
        user: {
          id: targetUser.id,
          email: targetUser.email,
          firstName: targetUser.firstName,
          lastName: targetUser.lastName
        },
        membership
      });
    } catch (error) {
      console.error('Error inviting scorekeeper:', error);
      res.status(500).json({ message: 'Failed to invite scorekeeper' });
    }
  });

  const httpServer = createServer(app);

  // WebSocket server for real-time messaging
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', async (ws: WebSocket, req) => {
    let userId: string | null = null;
    
    ws.on('message', async (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());
        
        switch (data.type) {
          case 'authenticate':
            // Authenticate user and store connection
            userId = data.userId;
            if (userId) {
              activeConnections.set(userId, ws);
              
              // Update user online status (wrapped in try-catch to prevent server crash)
              try {
                await messagingService.updateUserOnlineStatus(userId, true);
              } catch (err) {
                console.error('Failed to update online status for user:', userId, err);
              }
              
              // Broadcast to contacts that user is online
              broadcastOnlineStatus(userId, true);
              
              ws.send(JSON.stringify({ type: 'authenticated', userId }));
            }
            break;

          case 'join_conversation':
            if (!userId) return;
            
            // Verify user is participant in conversation
            const conversation = await messagingService.getConversation(data.conversationId);
            const isParticipant = await messagingService.isUserInConversation(userId, data.conversationId);
            
            if (conversation && isParticipant) {
              // Join conversation room (store conversation ID on connection)
              (ws as any).conversationId = data.conversationId;
              ws.send(JSON.stringify({ 
                type: 'joined_conversation', 
                conversationId: data.conversationId 
              }));
            }
            break;

          case 'send_message':
            if (!userId) return;
            
            const { conversationId, content, messageType = 'text', replyToId, attachments } = data;
            
            // Create message in database
            const message = await messagingService.createMessage({
              conversationId,
              senderId: userId,
              content,
              messageType,
              replyToId
            });

            // Add attachments if any
            if (attachments && attachments.length > 0) {
              for (const attachment of attachments) {
                await messagingService.createMessageAttachment({
                  messageId: message.id,
                  type: attachment.fileType,
                  url: attachment.fileUrl,
                  filename: attachment.fileName,
                  fileSize: attachment.fileSize
                });
              }
            }

            // Broadcast message to all participants
            const participants = await messagingService.getConversationParticipants(conversationId);
            broadcastToParticipants(participants, {
              type: 'new_message',
              message: {
                ...message,
                attachments: attachments || []
              }
            });
            break;

          case 'typing_start':
            if (!userId) return;
            
            await messagingService.setTypingIndicator(data.conversationId, userId, true);
            
            // Broadcast typing indicator to other participants
            const typingParticipants = await messagingService.getConversationParticipants(data.conversationId);
            broadcastToParticipants(
              typingParticipants.filter(p => p.userId !== userId),
              {
                type: 'typing_indicator',
                conversationId: data.conversationId,
                userId,
                isTyping: true
              }
            );
            break;

          case 'typing_stop':
            if (!userId) return;
            
            await messagingService.setTypingIndicator(data.conversationId, userId, false);
            
            // Broadcast typing stopped to other participants
            const stoppedTypingParticipants = await messagingService.getConversationParticipants(data.conversationId);
            broadcastToParticipants(
              stoppedTypingParticipants.filter(p => p.userId !== userId),
              {
                type: 'typing_indicator',
                conversationId: data.conversationId,
                userId,
                isTyping: false
              }
            );
            break;

          case 'mark_read':
            if (!userId) return;
            
            // Create read receipt
            await messagingService.markMessageAsRead(data.messageId, userId);
            
            // Broadcast read receipt to message sender
            const readMessage = await messagingService.getMessage(data.messageId);
            if (readMessage) {
              const senderConnection = activeConnections.get(readMessage.senderId);
              if (senderConnection && senderConnection.readyState === WebSocket.OPEN) {
                senderConnection.send(JSON.stringify({
                  type: 'message_read',
                  messageId: data.messageId,
                  readBy: userId,
                  readAt: new Date().toISOString()
                }));
              }
            }
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: 'Failed to process message' 
        }));
      }
    });

    ws.on('close', async () => {
      if (userId) {
        // Remove connection
        activeConnections.delete(userId);
        
        // Update user offline status (wrapped in try-catch to prevent server crash)
        try {
          await messagingService.updateUserOnlineStatus(userId, false);
        } catch (err) {
          console.error('Failed to update offline status for user:', userId, err);
        }
        
        // Clear any typing indicators
        try {
          await messagingService.clearUserTypingIndicators(userId);
        } catch (err) {
          console.error('Failed to clear typing indicators for user:', userId, err);
        }
        
        // Broadcast to contacts that user is offline
        broadcastOnlineStatus(userId, false);
      }
    });
  });

  // Helper function to broadcast online status to user contacts
  function broadcastOnlineStatus(userId: string, isOnline: boolean) {
    // This would need to get user's contacts and broadcast to them
    // For now, we'll implement a simple version
    const statusMessage = {
      type: 'user_status',
      userId,
      isOnline,
      lastSeen: new Date().toISOString()
    };

    for (const [contactId, connection] of Array.from(activeConnections)) {
      if (contactId !== userId && connection.readyState === WebSocket.OPEN) {
        connection.send(JSON.stringify(statusMessage));
      }
    }
  }

  // Helper function to broadcast to conversation participants
  function broadcastToParticipants(participants: Array<{userId: string}>, message: any) {
    participants.forEach(participant => {
      const connection = activeConnections.get(participant.userId);
      if (connection && connection.readyState === WebSocket.OPEN) {
        connection.send(JSON.stringify(message));
      }
    });
  }

  // Mark all messages in a conversation as read (with WebSocket notifications)
  app.post('/api/conversations/:id/mark-all-read', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const conversationId = req.params.id;
      
      // Mark messages as read and get the list of marked messages with sender IDs
      const markedMessages = await messagingService.markAllMessagesInConversationAsRead(userId, conversationId);
      
      // Send WebSocket notifications to message senders
      if (markedMessages.length > 0) {
        const readAt = new Date().toISOString();
        
        // Group messages by sender to minimize WebSocket messages
        const messagesBySender = new Map<string, string[]>();
        for (const { messageId, senderId } of markedMessages) {
          if (!messagesBySender.has(senderId)) {
            messagesBySender.set(senderId, []);
          }
          messagesBySender.get(senderId)!.push(messageId);
        }
        
        // Send notification to each sender
        Array.from(messagesBySender.entries()).forEach(([senderId, messageIds]) => {
          const senderConnection = activeConnections.get(senderId);
          if (senderConnection && senderConnection.readyState === WebSocket.OPEN) {
            senderConnection.send(JSON.stringify({
              type: 'message_read',
              conversationId,
              messageIds,
              readBy: userId,
              readAt
            }));
          }
        });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error marking all messages as read:', error);
      if (error instanceof Error && error.message === 'User is not a participant in this conversation') {
        return res.status(403).json({ message: 'Access denied' });
      }
      res.status(500).json({ message: 'Failed to mark messages as read' });
    }
  });

  // Feedback submission route
  app.post('/api/feedback', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Validate request body
      const validatedData = createFeedbackSubmissionSchema.parse(req.body);

      // Store feedback in database
      const feedback = await storage.createFeedbackSubmission({
        userId,
        category: validatedData.category,
        message: validatedData.message,
      });

      // Send email using Resend
      try {
        
        const { getUncachableResendClient } = await import('./resend');
        const { client, fromEmail } = await getUncachableResendClient();
        
        const categoryLabel = validatedData.category === 'product_improvement' 
          ? 'Product Improvement' 
          : 'Report an Issue';

        const recipientEmail = 'roster.mobile.app@gmail.com';

        const emailResult = await client.emails.send({
          from: fromEmail,
          to: recipientEmail,
          subject: `Rosters Feedback: ${categoryLabel}`,
          html: `
            <h2>New Feedback Submission</h2>
            <p><strong>Category:</strong> ${categoryLabel}</p>
            <p><strong>From:</strong> ${user.firstName} ${user.lastName} (${user.email})</p>
            <p><strong>User ID:</strong> ${userId}</p>
            <p><strong>Submitted:</strong> ${new Date().toISOString()}</p>
            <hr />
            <h3>Message:</h3>
            <p>${validatedData.message.replace(/\n/g, '<br />')}</p>
          `,
        });
      } catch (emailError: any) {
        console.error("[Feedback] Error sending feedback email:", emailError?.message || emailError);
        console.error("[Feedback] Full error:", JSON.stringify(emailError, null, 2));
        // Don't fail the request if email fails - feedback is still saved
      }

      res.json({ 
        success: true, 
        message: "Feedback submitted successfully",
        id: feedback.id 
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ 
          message: "Invalid feedback data", 
          errors: error.errors 
        });
      }
      console.error("Error submitting feedback:", error);
      res.status(500).json({ message: "Failed to submit feedback" });
    }
  });

  // Invite group routes
  // Get all invite groups for the current user
  app.get('/api/invite-groups', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const leagueId = req.query.leagueId as string | undefined;
      
      const groups = await storage.getInviteGroups(userId, leagueId);
      res.json(groups);
    } catch (error) {
      console.error('Error fetching invite groups:', error);
      res.status(500).json({ message: 'Failed to fetch invite groups' });
    }
  });

  // Get a specific invite group with members
  app.get('/api/invite-groups/:id', isAuthenticated, async (req: any, res) => {
    try {
      const groupId = req.params.id;
      const userId = req.user.claims.sub;
      
      const group = await storage.getInviteGroup(groupId);
      if (!group) {
        return res.status(404).json({ message: 'Invite group not found' });
      }
      
      // Check ownership
      if (group.creatorId !== userId) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      const members = await storage.getInviteGroupMembers(groupId);
      res.json({ ...group, members });
    } catch (error) {
      console.error('Error fetching invite group:', error);
      res.status(500).json({ message: 'Failed to fetch invite group' });
    }
  });

  // Get members of a specific invite group
  app.get('/api/invite-groups/:id/members', isAuthenticated, async (req: any, res) => {
    try {
      const groupId = req.params.id;
      const userId = req.user.claims.sub;
      
      const group = await storage.getInviteGroup(groupId);
      if (!group) {
        return res.status(404).json({ message: 'Invite group not found' });
      }
      
      // Check ownership
      if (group.creatorId !== userId) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      const members = await storage.getInviteGroupMembers(groupId);
      res.json(members);
    } catch (error) {
      console.error('Error fetching invite group members:', error);
      res.status(500).json({ message: 'Failed to fetch invite group members' });
    }
  });

  // Create a new invite group
  app.post('/api/invite-groups', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { name, description, leagueId, members } = req.body;
      
      if (!name) {
        return res.status(400).json({ message: 'Group name is required' });
      }
      
      const groupData = {
        creatorId: userId,
        name,
        description: description || null,
        leagueId: leagueId || null,
      };
      
      const newGroup = await storage.createInviteGroup(groupData);
      
      // Add members if provided
      if (members && Array.isArray(members) && members.length > 0) {
        await storage.addMembersToInviteGroup(newGroup.id, members);
      }
      
      res.status(201).json(newGroup);
    } catch (error) {
      console.error('Error creating invite group:', error);
      res.status(500).json({ message: 'Failed to create invite group' });
    }
  });

  // Update an invite group
  app.patch('/api/invite-groups/:id', isAuthenticated, async (req: any, res) => {
    try {
      const groupId = req.params.id;
      const userId = req.user.claims.sub;
      const { name, description } = req.body;
      
      const group = await storage.getInviteGroup(groupId);
      if (!group) {
        return res.status(404).json({ message: 'Invite group not found' });
      }
      
      if (group.creatorId !== userId) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      const updates: any = {};
      if (name) updates.name = name;
      if (description !== undefined) updates.description = description;
      
      const updatedGroup = await storage.updateInviteGroup(groupId, updates);
      res.json(updatedGroup);
    } catch (error) {
      console.error('Error updating invite group:', error);
      res.status(500).json({ message: 'Failed to update invite group' });
    }
  });

  // Delete an invite group
  app.delete('/api/invite-groups/:id', isAuthenticated, async (req: any, res) => {
    try {
      const groupId = req.params.id;
      const userId = req.user.claims.sub;
      
      const group = await storage.getInviteGroup(groupId);
      if (!group) {
        return res.status(404).json({ message: 'Invite group not found' });
      }
      
      if (group.creatorId !== userId) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      await storage.deleteInviteGroup(groupId);
      res.json({ message: 'Invite group deleted successfully' });
    } catch (error) {
      console.error('Error deleting invite group:', error);
      res.status(500).json({ message: 'Failed to delete invite group' });
    }
  });

  // Add/Replace members in an invite group
  app.post('/api/invite-groups/:id/members', isAuthenticated, async (req: any, res) => {
    try {
      const groupId = req.params.id;
      const userId = req.user.claims.sub;
      const { members } = req.body;
      
      const group = await storage.getInviteGroup(groupId);
      if (!group) {
        return res.status(404).json({ message: 'Invite group not found' });
      }
      
      if (group.creatorId !== userId) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      // If members array is provided (even if empty), replace all members
      if (members !== undefined && Array.isArray(members)) {
        // Get existing members
        const existingMembers = await storage.getInviteGroupMembers(groupId);
        
        // Remove all existing members
        for (const member of existingMembers) {
          await storage.removeMemberFromInviteGroup(groupId, member.id);
        }
        
        // Add new members if any
        let newMembers: any[] = [];
        if (members.length > 0) {
          newMembers = await storage.addMembersToInviteGroup(groupId, members);
        }
        
        res.status(201).json(newMembers);
      } else {
        return res.status(400).json({ message: 'Members array is required' });
      }
    } catch (error) {
      console.error('Error updating members in invite group:', error);
      res.status(500).json({ message: 'Failed to update members' });
    }
  });

  // Remove a member from an invite group
  app.delete('/api/invite-groups/:groupId/members/:memberId', isAuthenticated, async (req: any, res) => {
    try {
      const { groupId, memberId } = req.params;
      const userId = req.user.claims.sub;
      
      const group = await storage.getInviteGroup(groupId);
      if (!group) {
        return res.status(404).json({ message: 'Invite group not found' });
      }
      
      if (group.creatorId !== userId) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      await storage.removeMemberFromInviteGroup(groupId, memberId);
      res.json({ message: 'Member removed successfully' });
    } catch (error) {
      console.error('Error removing member from invite group:', error);
      res.status(500).json({ message: 'Failed to remove member' });
    }
  });

  // Search users by email
  app.get('/api/users/search', isAuthenticated, async (req: any, res) => {
    try {
      const email = req.query.email as string;
      
      if (!email) {
        return res.status(400).json({ message: 'Email query parameter is required' });
      }
      
      const users = await storage.searchUsersByEmail(email, 10);
      res.json(users);
    } catch (error) {
      console.error('Error searching users:', error);
      res.status(500).json({ message: 'Failed to search users' });
    }
  });

  // Payment request routes
  // Create a new payment request
  app.post('/api/payment-requests', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Validate request body using Zod schema
      const validatedData = createPaymentRequestSchema.parse(req.body);

      const paymentRequest = await storage.createPaymentRequest({
        creatorId: userId,
        title: validatedData.title,
        description: validatedData.description,
        amountPerPerson: validatedData.amountPerPerson,
        deadline: validatedData.deadline || null,
        relatedScrimmageId: validatedData.relatedScrimmageId || null,
        relatedConversationId: validatedData.relatedConversationId || null,
      }, validatedData.recipientUserIds);

      // Send push notifications to recipients (async, don't wait)
      (async () => {
        try {
          const creator = await storage.getUser(userId);
          const creatorName = creator ? `${creator.firstName} ${creator.lastName}`.trim() || creator.email : 'Someone';
          
          if (validatedData.recipientUserIds.length > 0) {
            const { sendPaymentRequestPushNotification } = await import('./oneSignalNotifications');
            for (const recipientId of validatedData.recipientUserIds) {
              await sendPaymentRequestPushNotification(
                recipientId,
                creatorName,
                validatedData.amountPerPerson,
                validatedData.title,
                paymentRequest.id
              );
            }
          }
        } catch (notifError) {
          console.error('[Notifications] Failed to send payment request notifications:', notifError);
        }
      })();

      res.json(paymentRequest);
    } catch (error) {
      if (error instanceof ZodError) {
        console.error("Payment request validation error:", JSON.stringify(error.errors, null, 2));
        console.error("Received data:", JSON.stringify(req.body, null, 2));
        return res.status(400).json({ 
          message: "Invalid payment request data", 
          errors: error.errors 
        });
      }
      console.error("Error creating payment request:", error);
      res.status(500).json({ message: "Failed to create payment request" });
    }
  });

  // Get payment requests created by the current user
  app.get('/api/payment-requests/created/by-me', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const paymentRequests = await storage.getPaymentRequestsByCreator(userId);
      res.json(paymentRequests);
    } catch (error) {
      console.error("Error fetching created payment requests:", error);
      res.status(500).json({ message: "Failed to fetch payment requests" });
    }
  });

  // Get payment requests where the current user is a recipient
  app.get('/api/payment-requests/received/by-me', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const paymentRequests = await storage.getPaymentRequestsByRecipient(userId);
      res.json(paymentRequests);
    } catch (error) {
      console.error("Error fetching received payment requests:", error);
      res.status(500).json({ message: "Failed to fetch payment requests" });
    }
  });

  // Get count of unpaid payment requests for current user
  app.get('/api/payment-requests/unpaid-count', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const count = await storage.getUnpaidPaymentRequestCount(userId);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching unpaid payment request count:", error);
      res.status(500).json({ message: "Failed to fetch unpaid count" });
    }
  });

  // Get a specific payment request with all details
  app.get('/api/payment-requests/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;

      const paymentRequest = await storage.getPaymentRequest(id);

      if (!paymentRequest) {
        return res.status(404).json({ message: "Payment request not found" });
      }

      // Check if user is creator or recipient
      const isCreator = paymentRequest.creatorId === userId;
      const isRecipient = paymentRequest.recipients.some(r => r.userId === userId);

      if (!isCreator && !isRecipient) {
        return res.status(403).json({ message: "You do not have access to this payment request" });
      }

      res.json(paymentRequest);
    } catch (error) {
      console.error("Error fetching payment request:", error);
      res.status(500).json({ message: "Failed to fetch payment request" });
    }
  });

  // Get payment requests for a specific scrimmage
  app.get('/api/scrimmages/:scrimmageId/payment-requests', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { scrimmageId } = req.params;

      // Verify user has access to this scrimmage
      const scrimmage = await storage.getScrimmage(scrimmageId);
      if (!scrimmage) {
        return res.status(404).json({ message: "Scrimmage not found" });
      }

      // Check if user is the creator or a participant in the scrimmage
      const isCreator = scrimmage.creatorId === userId;
      const userRequest = await db.query.scrimmageRequests.findFirst({
        where: (requests, { eq, and }) => and(
          eq(requests.scrimmageId, scrimmageId),
          eq(requests.playerId, userId)
        ),
      });
      const isParticipant = !!userRequest;

      if (!isCreator && !isParticipant) {
        return res.status(403).json({ message: "You do not have access to this scrimmage" });
      }

      const paymentRequests = await storage.getPaymentRequestsByScrimmage(scrimmageId);
      res.json(paymentRequests);
    } catch (error) {
      console.error("Error fetching scrimmage payment requests:", error);
      res.status(500).json({ message: "Failed to fetch payment requests" });
    }
  });

  // Get payment requests for a specific conversation
  app.get('/api/conversations/:conversationId/payment-requests', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { conversationId } = req.params;

      // Verify user is a participant in this conversation
      const isParticipant = await messagingService.isUserInConversation(userId, conversationId);
      if (!isParticipant) {
        return res.status(403).json({ message: "You are not a participant in this conversation" });
      }

      const paymentRequests = await storage.getPaymentRequestsByConversation(conversationId);
      res.json(paymentRequests);
    } catch (error) {
      console.error("Error fetching conversation payment requests:", error);
      res.status(500).json({ message: "Failed to fetch payment requests" });
    }
  });

  // Update a payment request recipient (mark as paid/unpaid, set payment method)
  app.patch('/api/payment-request-recipients/:recipientId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { recipientId } = req.params;
      
      // Validate request body using Zod schema
      const validatedData = updatePaymentRequestRecipientSchema.parse(req.body);

      // Get the payment request to verify permissions
      const recipient = await db.query.paymentRequestRecipients.findFirst({
        where: (recipients, { eq }) => eq(recipients.id, recipientId),
        with: {
          paymentRequest: true,
        },
      });

      if (!recipient) {
        return res.status(404).json({ message: "Payment recipient not found" });
      }

      // Only the creator or the recipient themselves can update the payment status
      const isCreator = recipient.paymentRequest.creatorId === userId;
      const isRecipient = recipient.userId === userId;

      if (!isCreator && !isRecipient) {
        return res.status(403).json({ message: "You do not have permission to update this payment" });
      }

      const updatedRecipient = await storage.updatePaymentRequestRecipient(recipientId, {
        isPaid: validatedData.isPaid,
        paymentMethod: validatedData.paymentMethod,
      });

      res.json(updatedRecipient);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ 
          message: "Invalid payment recipient update data", 
          errors: error.errors 
        });
      }
      console.error("Error updating payment recipient:", error);
      res.status(500).json({ message: "Failed to update payment recipient" });
    }
  });

  // Confirm a payment request recipient (creator only)
  app.patch('/api/payment-request-recipients/:recipientId/confirm', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { recipientId } = req.params;
      const { isConfirmed } = req.body;

      // Get the payment request to verify permissions
      const recipient = await db.query.paymentRequestRecipients.findFirst({
        where: (recipients, { eq }) => eq(recipients.id, recipientId),
        with: {
          paymentRequest: true,
        },
      });

      if (!recipient) {
        return res.status(404).json({ message: "Payment recipient not found" });
      }

      // Only the creator can confirm payments
      const isCreator = recipient.paymentRequest.creatorId === userId;

      if (!isCreator) {
        return res.status(403).json({ message: "Only the payment request creator can confirm payments" });
      }

      const updatedRecipient = await storage.confirmPaymentRequestRecipient(recipientId, isConfirmed);

      res.json(updatedRecipient);
    } catch (error) {
      console.error("Error confirming payment recipient:", error);
      res.status(500).json({ message: "Failed to confirm payment" });
    }
  });

  // Delete a payment request (only by creator)
  app.delete('/api/payment-requests/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;

      const paymentRequest = await storage.getPaymentRequest(id);

      if (!paymentRequest) {
        return res.status(404).json({ message: "Payment request not found" });
      }

      if (paymentRequest.creatorId !== userId) {
        return res.status(403).json({ message: "Only the creator can delete this payment request" });
      }

      await storage.deletePaymentRequest(id);
      res.json({ success: true, message: "Payment request deleted successfully" });
    } catch (error) {
      console.error("Error deleting payment request:", error);
      res.status(500).json({ message: "Failed to delete payment request" });
    }
  });

  // Update user payment methods (Venmo/CashApp)
  app.patch('/api/users/payment-methods', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { venmoUsername, cashappUsername } = req.body;

      const paymentMethods: any = {};
      if (venmoUsername !== undefined) paymentMethods.venmoUsername = venmoUsername;
      if (cashappUsername !== undefined) paymentMethods.cashappUsername = cashappUsername;

      const user = await storage.updateUserPaymentMethods(userId, paymentMethods);
      res.json(user);
    } catch (error) {
      console.error("Error updating payment methods:", error);
      res.status(500).json({ message: "Failed to update payment methods" });
    }
  });

  // Facility routes
  // List all facilities (public - no auth required)
  app.get('/api/facilities', async (req: any, res) => {
    try {
      const { sport, city, state, search } = req.query;
      const facilities = await storage.getAllFacilities({ sport, city, state, search });
      res.json(facilities);
    } catch (error) {
      console.error("Error fetching facilities:", error);
      res.status(500).json({ message: "Failed to fetch facilities" });
    }
  });

  // Get facility details (public - no auth required)
  app.get('/api/facilities/:id', async (req: any, res) => {
    try {
      const { id } = req.params;
      const facility = await storage.getFacility(id);
      
      if (!facility) {
        return res.status(404).json({ message: "Facility not found" });
      }
      
      res.json(facility);
    } catch (error) {
      console.error("Error fetching facility:", error);
      res.status(500).json({ message: "Failed to fetch facility" });
    }
  });

  // Create facility (authenticated users only)
  app.post('/api/facilities', isAuthenticated, async (req: any, res) => {
    try {
      const validatedData = createFacilityRequestSchema.parse(req.body);
      const facility = await storage.createFacility(validatedData);
      res.status(201).json(facility);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ 
          message: "Invalid facility data", 
          errors: error.errors 
        });
      }
      console.error("Error creating facility:", error);
      res.status(500).json({ message: "Failed to create facility" });
    }
  });

  // Update facility (authenticated users only)
  app.patch('/api/facilities/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const validatedData = updateFacilityRequestSchema.parse(req.body);
      
      const existingFacility = await storage.getFacility(id);
      if (!existingFacility) {
        return res.status(404).json({ message: "Facility not found" });
      }
      
      const facility = await storage.updateFacility(id, validatedData);
      res.json(facility);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ 
          message: "Invalid facility data", 
          errors: error.errors 
        });
      }
      console.error("Error updating facility:", error);
      res.status(500).json({ message: "Failed to update facility" });
    }
  });

  // Delete facility (authenticated users only)
  app.delete('/api/facilities/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      const existingFacility = await storage.getFacility(id);
      if (!existingFacility) {
        return res.status(404).json({ message: "Facility not found" });
      }
      
      await storage.deleteFacility(id);
      res.json({ success: true, message: "Facility deleted successfully" });
    } catch (error) {
      console.error("Error deleting facility:", error);
      res.status(500).json({ message: "Failed to delete facility" });
    }
  });

  // Get facility members (public - no auth required)
  app.get('/api/facilities/:id/members', async (req: any, res) => {
    try {
      const { id } = req.params;
      const members = await storage.getFacilityMembers(id);
      res.json(members);
    } catch (error) {
      console.error("Error fetching facility members:", error);
      res.status(500).json({ message: "Failed to fetch members" });
    }
  });

  // Join facility (create membership)
  app.post('/api/facilities/:id/memberships', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id: facilityId } = req.params;
      
      const facility = await storage.getFacility(facilityId);
      if (!facility) {
        return res.status(404).json({ message: "Facility not found" });
      }
      
      const existingMembership = await storage.getUserFacilityMembership(userId, facilityId);
      if (existingMembership) {
        return res.status(400).json({ message: "You are already a member of this facility" });
      }
      
      const validatedData = createFacilityMembershipRequestSchema.parse(req.body);
      
      const membership = await storage.createFacilityMembership({
        ...validatedData,
        userId,
        facilityId,
        startDate: new Date(),
      });
      
      res.status(201).json(membership);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ 
          message: "Invalid membership data", 
          errors: error.errors 
        });
      }
      console.error("Error creating facility membership:", error);
      res.status(500).json({ message: "Failed to join facility" });
    }
  });

  // Get user's facility memberships
  app.get('/api/users/me/facility-memberships', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const memberships = await storage.getUserFacilityMemberships(userId);
      res.json(memberships);
    } catch (error) {
      console.error("Error fetching user facility memberships:", error);
      res.status(500).json({ message: "Failed to fetch memberships" });
    }
  });

  // Check user's membership at a facility
  app.get('/api/facilities/:id/memberships/check', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id: facilityId } = req.params;
      
      const hasActiveMembership = await storage.checkUserActiveFacilityMembership(userId, facilityId);
      res.json({ hasActiveMembership });
    } catch (error) {
      console.error("Error checking facility membership:", error);
      res.status(500).json({ message: "Failed to check membership" });
    }
  });

  // Delete facility membership (leave facility)
  app.delete('/api/facility-memberships/:membershipId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { membershipId } = req.params;
      
      const membership = await storage.getFacilityMembership(membershipId);
      if (!membership) {
        return res.status(404).json({ message: "Membership not found" });
      }
      
      if (membership.userId !== userId) {
        return res.status(403).json({ message: "You can only delete your own membership" });
      }
      
      await storage.deleteFacilityMembership(membershipId);
      res.json({ success: true, message: "Membership deleted successfully" });
    } catch (error) {
      console.error("Error deleting facility membership:", error);
      res.status(500).json({ message: "Failed to delete membership" });
    }
  });

  // Calendar event routes
  // Get facility calendar events (public - no auth required)
  app.get('/api/facilities/:id/calendar', async (req: any, res) => {
    try {
      const { id: facilityId } = req.params;
      const { sportId, startDate, endDate } = req.query;
      
      const options: any = {};
      if (sportId) options.sportId = sportId;
      if (startDate) options.startDate = new Date(startDate as string);
      if (endDate) options.endDate = new Date(endDate as string);
      
      const events = await storage.getFacilityCalendarEvents(facilityId, options);
      res.json(events);
    } catch (error) {
      console.error("Error fetching facility calendar:", error);
      res.status(500).json({ message: "Failed to fetch calendar" });
    }
  });

  // Get calendar event details (public - no auth required)
  app.get('/api/calendar-events/:id', async (req: any, res) => {
    try {
      const { id } = req.params;
      const event = await storage.getCalendarEvent(id);
      
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      res.json(event);
    } catch (error) {
      console.error("Error fetching calendar event:", error);
      res.status(500).json({ message: "Failed to fetch event" });
    }
  });

  // Create calendar event (members only if requiresMembership is true)
  app.post('/api/calendar-events', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const validatedData = createCalendarEventRequestSchema.parse(req.body);
      
      const facility = await storage.getFacility(validatedData.facilityId);
      if (!facility) {
        return res.status(404).json({ message: "Facility not found" });
      }
      
      const event = await storage.createCalendarEvent({
        ...validatedData,
        createdBy: userId,
      });
      
      res.status(201).json(event);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ 
          message: "Invalid event data", 
          errors: error.errors 
        });
      }
      console.error("Error creating calendar event:", error);
      res.status(500).json({ message: "Failed to create event" });
    }
  });

  // Update calendar event (creator or facility admin only)
  app.patch('/api/calendar-events/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      const validatedData = updateCalendarEventRequestSchema.parse(req.body);
      
      const event = await storage.getCalendarEvent(id);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      if (event.createdBy !== userId) {
        return res.status(403).json({ message: "Only the event creator can update this event" });
      }
      
      const updatedEvent = await storage.updateCalendarEvent(id, validatedData);
      res.json(updatedEvent);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ 
          message: "Invalid event data", 
          errors: error.errors 
        });
      }
      console.error("Error updating calendar event:", error);
      res.status(500).json({ message: "Failed to update event" });
    }
  });

  // Delete calendar event (creator or facility admin only)
  app.delete('/api/calendar-events/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id } = req.params;
      
      const event = await storage.getCalendarEvent(id);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      if (event.createdBy !== userId) {
        return res.status(403).json({ message: "Only the event creator can delete this event" });
      }
      
      await storage.deleteCalendarEvent(id);
      res.json({ success: true, message: "Event deleted successfully" });
    } catch (error) {
      console.error("Error deleting calendar event:", error);
      res.status(500).json({ message: "Failed to delete event" });
    }
  });

  // Get event participants (public for public events, members for members-only events)
  app.get('/api/calendar-events/:id/participants', async (req: any, res) => {
    try {
      const { id: eventId } = req.params;
      
      const event = await storage.getCalendarEvent(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      const participants = await storage.getEventParticipants(eventId);
      res.json(participants);
    } catch (error) {
      console.error("Error fetching event participants:", error);
      res.status(500).json({ message: "Failed to fetch participants" });
    }
  });

  // Join event (members only)
  app.post('/api/calendar-events/:id/participants', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id: eventId } = req.params;
      
      const event = await storage.getCalendarEvent(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      if (event.requiresMembership) {
        const hasActiveMembership = await storage.checkUserActiveFacilityMembership(userId, event.facilityId);
        if (!hasActiveMembership) {
          return res.status(403).json({ message: "You must be a facility member to join this event" });
        }
      }
      
      const existingParticipation = await storage.getUserEventParticipation(userId, eventId);
      if (existingParticipation) {
        return res.status(400).json({ message: "You are already participating in this event" });
      }
      
      if (event.maxParticipants && event.currentParticipantsCount >= event.maxParticipants) {
        return res.status(400).json({ message: "This event is full" });
      }
      
      const membership = await storage.getUserFacilityMembership(userId, event.facilityId);
      if (!membership) {
        return res.status(400).json({ message: "You must be a facility member to participate" });
      }
      
      const validatedData = createEventParticipantRequestSchema.parse(req.body);
      
      const participant = await storage.createEventParticipant({
        ...validatedData,
        eventId,
        userId,
        facilityMembershipId: membership.id,
      });
      
      res.status(201).json(participant);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ 
          message: "Invalid participant data", 
          errors: error.errors 
        });
      }
      console.error("Error joining event:", error);
      res.status(500).json({ message: "Failed to join event" });
    }
  });

  // Leave event (delete participation)
  app.delete('/api/event-participants/:participantId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { participantId } = req.params;
      
      const participant = await storage.getUserEventParticipation(userId, participantId);
      if (!participant) {
        return res.status(404).json({ message: "Participation not found" });
      }
      
      if (participant.userId !== userId) {
        return res.status(403).json({ message: "You can only delete your own participation" });
      }
      
      await storage.deleteEventParticipant(participantId);
      res.json({ success: true, message: "Left event successfully" });
    } catch (error) {
      console.error("Error leaving event:", error);
      res.status(500).json({ message: "Failed to leave event" });
    }
  });

  // Check in participant (event creator or facility admin only)
  app.patch('/api/event-participants/:participantId/check-in', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { participantId } = req.params;
      
      const participant = await storage.updateEventParticipant(participantId, {});
      if (!participant) {
        return res.status(404).json({ message: "Participant not found" });
      }
      
      const checkedInParticipant = await storage.checkInEventParticipant(participantId);
      res.json(checkedInParticipant);
    } catch (error) {
      console.error("Error checking in participant:", error);
      res.status(500).json({ message: "Failed to check in participant" });
    }
  });

  // ==================== TEAM EVENTS ROUTES ====================

  // Get team events for a specific team
  app.get('/api/teams/:teamId/events', isAuthenticated, async (req: any, res) => {
    try {
      const { teamId } = req.params;
      const userId = req.user.claims.sub;
      
      // Check if user is a member of this team
      const membership = await storage.getTeamMembership(userId, teamId);
      if (!membership) {
        return res.status(403).json({ message: "You must be a team member to view events" });
      }
      
      const events = await db
        .select()
        .from(teamEvents)
        .where(eq(teamEvents.teamId, teamId))
        .orderBy(teamEvents.scheduledAt);
      
      // Format dates for frontend
      const formattedEvents = events.map(event => ({
        ...event,
        scheduledAt: formatDateAsLocalString(event.scheduledAt),
        endTime: event.endTime ? formatDateAsLocalString(event.endTime) : null,
      }));
      
      res.json(formattedEvents);
    } catch (error) {
      console.error("Error fetching team events:", error);
      res.status(500).json({ message: "Failed to fetch team events" });
    }
  });

  // Get a single team event
  app.get('/api/team-events/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const event = await db
        .select()
        .from(teamEvents)
        .where(eq(teamEvents.id, id))
        .limit(1);
      
      if (!event.length) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      const teamEvent = event[0];
      
      // Check if user is a member of this team
      const membership = await storage.getTeamMembership(userId, teamEvent.teamId);
      if (!membership) {
        return res.status(403).json({ message: "You must be a team member to view this event" });
      }
      
      // Get RSVPs for this event
      const rsvps = await db
        .select({
          id: teamEventRsvps.id,
          userId: teamEventRsvps.userId,
          status: teamEventRsvps.status,
          respondedAt: teamEventRsvps.respondedAt,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        })
        .from(teamEventRsvps)
        .innerJoin(users, eq(teamEventRsvps.userId, users.id))
        .where(eq(teamEventRsvps.teamEventId, id));
      
      // Get team info
      const [team] = await db
        .select({
          id: teams.id,
          name: teams.name,
          captainId: teams.captainId,
          leagueId: teams.leagueId,
        })
        .from(teams)
        .where(eq(teams.id, teamEvent.teamId));
      
      // Get all team members for the roster view
      const teamMembers = await db
        .select({
          userId: teamMemberships.userId,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
          isCaptain: teamMemberships.isCaptain,
        })
        .from(teamMemberships)
        .innerJoin(users, eq(teamMemberships.userId, users.id))
        .where(and(
          eq(teamMemberships.teamId, teamEvent.teamId),
          eq(teamMemberships.status, 'approved')
        ));
      
      // Check if current user is captain
      const isCaptain = membership.isCaptain || team?.captainId === userId;
      
      res.json({
        ...teamEvent,
        scheduledAt: formatDateAsLocalString(teamEvent.scheduledAt),
        endTime: teamEvent.endTime ? formatDateAsLocalString(teamEvent.endTime) : null,
        rsvps,
        team,
        teamMembers,
        isCaptain,
        userRsvp: rsvps.find(r => r.userId === userId) || null,
      });
    } catch (error) {
      console.error("Error fetching team event:", error);
      res.status(500).json({ message: "Failed to fetch team event" });
    }
  });

  // Create a team event
  app.post('/api/team-events', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const validatedData = createTeamEventRequestSchema.parse(req.body);
      
      // Check if user is a member of this team (and preferably captain)
      const membership = await storage.getTeamMembership(userId, validatedData.teamId);
      if (!membership) {
        return res.status(403).json({ message: "You must be a team member to create events" });
      }
      
      const [newEvent] = await db
        .insert(teamEvents)
        .values({
          ...validatedData,
          creatorId: userId,
        })
        .returning();
      
      // Send push notifications to all team members (except the creator)
      try {
        const team = await storage.getTeam(validatedData.teamId);
        const teamMembers = await storage.getTeamMembers(validatedData.teamId);
        const creator = await storage.getUser(userId);
        
        if (team && creator && teamMembers.length > 0) {
          const creatorName = `${creator.firstName || ''} ${creator.lastName || ''}`.trim() || 'Team member';
          const formattedDate = formatDayAndTime(newEvent.scheduledAt);
          
          // Send notifications to all team members except the creator
          for (const member of teamMembers) {
            if (member.userId !== userId) {
              sendTeamEventPushNotification(
                member.userId,
                creatorName,
                newEvent.title,
                newEvent.eventType,
                formattedDate,
                newEvent.location,
                newEvent.id,
                team.name
              ).catch(err => console.error(`Failed to send team event notification to ${member.userId}:`, err));
            }
          }
          console.log(`[TeamEvents] Sent push notifications to ${teamMembers.length - 1} team members for event "${newEvent.title}"`);
        }
      } catch (notificationError) {
        console.error("Error sending team event notifications:", notificationError);
      }
      
      res.status(201).json({
        ...newEvent,
        scheduledAt: formatDateAsLocalString(newEvent.scheduledAt),
        endTime: newEvent.endTime ? formatDateAsLocalString(newEvent.endTime) : null,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ 
          message: "Invalid event data", 
          errors: error.errors 
        });
      }
      console.error("Error creating team event:", error);
      res.status(500).json({ message: "Failed to create team event" });
    }
  });

  // Update a team event
  app.patch('/api/team-events/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      // Get the event first
      const [existingEvent] = await db
        .select()
        .from(teamEvents)
        .where(eq(teamEvents.id, id))
        .limit(1);
      
      if (!existingEvent) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      // Check if user is the creator, team captain, or commissioner
      const membership = await storage.getTeamMembership(userId, existingEvent.teamId);
      if (!membership) {
        return res.status(403).json({ message: "You must be a team member to edit events" });
      }
      
      // Check if user is commissioner of the team's league
      const team = await storage.getTeam(existingEvent.teamId);
      let isCommissioner = false;
      if (team?.leagueId) {
        const league = await storage.getLeague(team.leagueId);
        isCommissioner = league?.commissionerId === userId;
      }
      
      if (existingEvent.creatorId !== userId && !membership.isCaptain && !isCommissioner) {
        return res.status(403).json({ message: "Only the event creator, team captain, or commissioner can edit events" });
      }
      
      const validatedData = updateTeamEventRequestSchema.parse(req.body);
      
      const [updatedEvent] = await db
        .update(teamEvents)
        .set({
          ...validatedData,
          updatedAt: new Date(),
        })
        .where(eq(teamEvents.id, id))
        .returning();
      
      res.json({
        ...updatedEvent,
        scheduledAt: formatDateAsLocalString(updatedEvent.scheduledAt),
        endTime: updatedEvent.endTime ? formatDateAsLocalString(updatedEvent.endTime) : null,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ 
          message: "Invalid event data", 
          errors: error.errors 
        });
      }
      console.error("Error updating team event:", error);
      res.status(500).json({ message: "Failed to update team event" });
    }
  });

  // Delete a team event
  app.delete('/api/team-events/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      // Get the event first
      const [existingEvent] = await db
        .select()
        .from(teamEvents)
        .where(eq(teamEvents.id, id))
        .limit(1);
      
      if (!existingEvent) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      // Check if user is the creator, team captain, or commissioner
      const membership = await storage.getTeamMembership(userId, existingEvent.teamId);
      if (!membership) {
        return res.status(403).json({ message: "You must be a team member to delete events" });
      }
      
      // Check if user is commissioner of the team's league
      const team = await storage.getTeam(existingEvent.teamId);
      let isCommissioner = false;
      if (team?.leagueId) {
        const league = await storage.getLeague(team.leagueId);
        isCommissioner = league?.commissionerId === userId;
      }
      
      if (existingEvent.creatorId !== userId && !membership.isCaptain && !isCommissioner) {
        return res.status(403).json({ message: "Only the event creator, team captain, or commissioner can delete events" });
      }
      
      // Delete RSVPs first
      await db
        .delete(teamEventRsvps)
        .where(eq(teamEventRsvps.teamEventId, id));
      
      // Then delete the event
      await db
        .delete(teamEvents)
        .where(eq(teamEvents.id, id));
      
      res.json({ success: true, message: "Event deleted successfully" });
    } catch (error) {
      console.error("Error deleting team event:", error);
      res.status(500).json({ message: "Failed to delete team event" });
    }
  });

  // Update RSVP for a team event
  app.post('/api/team-events/:id/rsvp', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const { status } = req.body;
      
      if (!['attending', 'not_attending', 'no_response'].includes(status)) {
        return res.status(400).json({ message: "Invalid RSVP status" });
      }
      
      // Get the event first
      const [event] = await db
        .select()
        .from(teamEvents)
        .where(eq(teamEvents.id, id))
        .limit(1);
      
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      // Check if user is a member of this team
      const membership = await storage.getTeamMembership(userId, event.teamId);
      if (!membership) {
        return res.status(403).json({ message: "You must be a team member to RSVP" });
      }
      
      // Check if RSVP exists
      const [existingRsvp] = await db
        .select()
        .from(teamEventRsvps)
        .where(and(
          eq(teamEventRsvps.teamEventId, id),
          eq(teamEventRsvps.userId, userId)
        ))
        .limit(1);
      
      let rsvp;
      if (existingRsvp) {
        // Update existing RSVP
        [rsvp] = await db
          .update(teamEventRsvps)
          .set({
            status,
            respondedAt: new Date(),
          })
          .where(eq(teamEventRsvps.id, existingRsvp.id))
          .returning();
      } else {
        // Create new RSVP
        [rsvp] = await db
          .insert(teamEventRsvps)
          .values({
            teamEventId: id,
            userId,
            status,
            respondedAt: new Date(),
          })
          .returning();
      }
      
      res.json(rsvp);
    } catch (error) {
      console.error("Error updating RSVP:", error);
      res.status(500).json({ message: "Failed to update RSVP" });
    }
  });

  // Get team events for the user's calendar (all teams)
  app.get('/api/user/team-events', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get all teams the user is a member of
      const userMemberships = await db
        .select({ teamId: teamMemberships.teamId })
        .from(teamMemberships)
        .where(and(
          eq(teamMemberships.userId, userId),
          eq(teamMemberships.status, 'approved')
        ));
      
      const teamIds = userMemberships.map(m => m.teamId);
      
      if (teamIds.length === 0) {
        return res.json([]);
      }
      
      // Get full membership info including captain status
      const userMembershipsWithRole = await db
        .select({ 
          teamId: teamMemberships.teamId, 
          isCaptain: teamMemberships.isCaptain 
        })
        .from(teamMemberships)
        .where(and(
          eq(teamMemberships.userId, userId),
          eq(teamMemberships.status, 'approved')
        ));
      
      const membershipMap = new Map(userMembershipsWithRole.map(m => [m.teamId, m.isCaptain]));
      
      // Get leagues where user is commissioner or co-commissioner
      const commissionerLeagues = await storage.getLeaguesByCommissioner(userId);
      const commissionerLeagueIds = new Set(commissionerLeagues.map(l => l.id));
      
      // Get teams and their league IDs
      const teamsWithLeagues = await db
        .select({ id: teams.id, leagueId: teams.leagueId })
        .from(teams)
        .where(inArray(teams.id, teamIds));
      
      const teamLeagueMap = new Map(teamsWithLeagues.map(t => [t.id, t.leagueId]));
      
      const events = await db
        .select({
          id: teamEvents.id,
          teamId: teamEvents.teamId,
          creatorId: teamEvents.creatorId,
          eventType: teamEvents.eventType,
          title: teamEvents.title,
          description: teamEvents.description,
          scheduledAt: teamEvents.scheduledAt,
          endTime: teamEvents.endTime,
          location: teamEvents.location,
          opponentName: teamEvents.opponentName,
          isInternalScrimmage: teamEvents.isInternalScrimmage,
          color: teamEvents.color,
          teamName: teams.name,
        })
        .from(teamEvents)
        .innerJoin(teams, eq(teamEvents.teamId, teams.id))
        .where(inArray(teamEvents.teamId, teamIds))
        .orderBy(teamEvents.scheduledAt);
      
      const formattedEvents = events.map(event => {
        const isCaptain = membershipMap.get(event.teamId) || false;
        const leagueId = teamLeagueMap.get(event.teamId);
        const isCommissioner = leagueId ? commissionerLeagueIds.has(leagueId) : false;
        const isCreator = event.creatorId === userId;
        const canEdit = isCreator || isCaptain || isCommissioner;
        
        return {
          ...event,
          scheduledAt: formatDateAsLocalString(event.scheduledAt),
          endTime: event.endTime ? formatDateAsLocalString(event.endTime) : null,
          canEdit,
        };
      });
      
      res.json(formattedEvents);
    } catch (error) {
      console.error("Error fetching user team events:", error);
      res.status(500).json({ message: "Failed to fetch team events" });
    }
  });

  // ==================== TOURNAMENT ROUTES ====================

  // Get format recommendations for a team count
  app.get('/api/tournaments/format-recommendations', isAuthenticated, loadUserPermissions, requireLeagueManagement, async (req: any, res) => {
    try {
      const numTeams = parseInt(req.query.numTeams as string);
      
      if (!numTeams || numTeams < 2) {
        return res.status(400).json({ message: "Invalid team count" });
      }

      const recommendations = getFormatRecommendations(numTeams);
      res.json(recommendations);
    } catch (error) {
      console.error("Error getting format recommendations:", error);
      res.status(500).json({ message: "Failed to get format recommendations" });
    }
  });

  // Get all tournaments for the current user (both standalone and league-based)
  app.get('/api/tournaments/all', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      // Get leagues where user is commissioner or co-commissioner
      const commissionerLeagues = await storage.getLeaguesByCommissioner(userId);
      const commissionerLeagueIds = commissionerLeagues.map(l => l.id);

      // Build conditions: user created the tournament OR user is commissioner/co-commissioner of the league
      const conditions: any[] = [eq(tournaments.createdBy, userId)];
      if (commissionerLeagueIds.length > 0) {
        conditions.push(inArray(tournaments.leagueId, commissionerLeagueIds));
      }

      // Get all tournaments the user has access to
      const allTournamentsList = await db
        .select({
          id: tournaments.id,
          name: tournaments.name,
          format: tournaments.format,
          status: tournaments.status,
          type: tournaments.type,
          leagueId: tournaments.leagueId,
          leagueName: leagues.name,
          teamCount: sql<number>`(SELECT COUNT(*) FROM ${tournamentTeams} WHERE ${tournamentTeams.tournamentId} = ${tournaments.id})`
        })
        .from(tournaments)
        .leftJoin(leagues, eq(tournaments.leagueId, leagues.id))
        .where(or(...conditions))
        .orderBy(sql`${tournaments.createdAt} DESC`);

      res.json(allTournamentsList);
    } catch (error) {
      console.error("Error fetching all tournaments:", error);
      res.status(500).json({ message: "Failed to fetch tournaments" });
    }
  });

  // List tournaments for a league
  app.get('/api/leagues/:leagueId/tournaments', isAuthenticated, async (req: any, res) => {
    try {
      const { leagueId } = req.params;

      const tournamentList = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.leagueId, leagueId))
        .orderBy(sql`${tournaments.startDate} DESC NULLS LAST, ${tournaments.createdAt} DESC`);

      res.json(tournamentList);
    } catch (error) {
      console.error("Error fetching tournaments:", error);
      res.status(500).json({ message: "Failed to fetch tournaments" });
    }
  });

  // Get single tournament with details
  app.get('/api/tournaments/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;

      const [tournament] = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, id));

      if (!tournament) {
        return res.status(404).json({ message: "Tournament not found" });
      }

      res.json(tournament);
    } catch (error) {
      console.error("Error fetching tournament:", error);
      res.status(500).json({ message: "Failed to fetch tournament" });
    }
  });

  // Get tournament teams
  app.get('/api/tournaments/:id/teams', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;

      // Get all tournament teams
      const tournamentTeamsList = await db
        .select()
        .from(tournamentTeams)
        .where(eq(tournamentTeams.tournamentId, id))
        .orderBy(tournamentTeams.seed);
      
      // For each team, resolve the captain from linked league team
      const teamsWithCaptains = await Promise.all(
        tournamentTeamsList.map(async (team) => {
          let captainId: string | null = null;
          
          // Check if team has a linked league team with a captain
          if (team.teamId) {
            const [linkedTeam] = await db
              .select({ captainId: teams.captainId })
              .from(teams)
              .where(eq(teams.id, team.teamId))
              .limit(1);
            captainId = linkedTeam?.captainId || null;
          }
          
          // For standalone tournament teams without linked league teams,
          // there's no captain role in tournament_participant_role enum.
          // Captaincy is only tracked via the linked league team's captainId.
          
          return {
            ...team,
            captainId
          };
        })
      );

      res.json(teamsWithCaptains);
    } catch (error) {
      console.error("Error fetching tournament teams:", error);
      res.status(500).json({ message: "Failed to fetch tournament teams" });
    }
  });

  // Tournament CSV import endpoint
  app.post('/api/tournaments/:tournamentId/import-csv', isAuthenticated, (req: any, res, next) => {
    upload.single('playerFile')(req, res, (err) => {
      if (err) {
        console.error('Multer error:', err);
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: 'File size exceeds 5MB limit' });
          }
          return res.status(400).json({ message: err.message });
        }
        return res.status(400).json({ message: err.message || 'File upload error' });
      }
      next();
    });
  }, async (req: any, res) => {
    try {
      const { tournamentId } = req.params;
      const userId = req.user.claims.sub;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      // Check if user can manage this tournament
      const tournament = await db.query.tournaments.findFirst({
        where: eq(tournaments.id, tournamentId)
      });

      if (!tournament) {
        return res.status(404).json({ message: 'Tournament not found' });
      }

      // Check permissions - must be creator for standalone or commissioner for league tournaments
      if (tournament.type === 'standalone' && tournament.createdBy !== userId) {
        return res.status(403).json({ message: 'Only the tournament creator can import players' });
      }
      
      if (tournament.type === 'league' && tournament.leagueId) {
        const league = await db.query.leagues.findFirst({
          where: eq(leagues.id, tournament.leagueId)
        });
        if (!league || league.commissionerId !== userId) {
          return res.status(403).json({ message: 'Only league commissioners can import players' });
        }
      }

      // Read and parse the CSV file
      const fileContent = fs.readFileSync(file.path, 'utf8');
      const parseResults = Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => {
          const normalized = header.toLowerCase().trim().replace(/\*/g, '');
          const mapping: Record<string, string> = {
            'player full name': 'fullName',
            'full name': 'fullName',
            'name': 'fullName',
            'player': 'fullName',
            'player name': 'fullName',
            'team': 'teamName',
            'team name': 'teamName',
            'email': 'email',
            'jersey #': 'jerseyNumber',
            'jersey number': 'jerseyNumber',
            'phone': 'phoneNumber',
            'phone number': 'phoneNumber',
            'position': 'position',
            'skill level': 'skillLevel',
            'player type': 'playerType'
          };
          return mapping[normalized] || header;
        }
      });

      if (parseResults.errors.length > 0) {
        return res.status(400).json({ 
          message: 'Error parsing CSV file', 
          errors: parseResults.errors 
        });
      }

      // Helper function for email validation
      const isValidEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
      };

      // Helper function for enhanced name parsing
      const parseFullName = (fullName: string): { firstName: string; lastName: string } => {
        const trimmed = fullName.trim();
        
        if (trimmed.includes(',')) {
          const parts = trimmed.split(',').map(p => p.trim());
          return {
            lastName: parts[0] || '',
            firstName: parts.slice(1).join(' ') || ''
          };
        }
        
        const nameParts = trimmed.split(/\s+/);
        if (nameParts.length === 0) {
          return { firstName: '', lastName: '' };
        } else if (nameParts.length === 1) {
          return { firstName: nameParts[0], lastName: '' };
        } else {
          const lastName = nameParts[nameParts.length - 1];
          const firstName = nameParts.slice(0, -1).join(' ');
          return { firstName, lastName };
        }
      };

      // Get existing tournament teams
      const existingTeams = await db.query.tournamentTeams.findMany({
        where: eq(tournamentTeams.tournamentId, tournamentId)
      });
      
      const teamLookup = new Map<string, string>(); // teamName -> teamId
      existingTeams.forEach(team => {
        if (team.teamName) {
          teamLookup.set(team.teamName.toLowerCase().trim(), team.id);
        }
      });

      let teamsCreated = 0;
      let playersImported = 0;
      const errors: string[] = [];

      // Process each row in the CSV
      for (const row of parseResults.data) {
        try {
          const teamName = (row as any).teamName?.trim();
          if (!teamName) {
            errors.push(`Row missing team name`);
            continue;
          }

          // Get or create tournament team
          let teamId = teamLookup.get(teamName.toLowerCase());
          if (!teamId) {
            const [newTeam] = await db.insert(tournamentTeams).values({
              id: nanoid(),
              tournamentId,
              teamName,
              seed: existingTeams.length + teamsCreated + 1
            }).returning();
            teamId = newTeam.id;
            teamLookup.set(teamName.toLowerCase(), teamId);
            teamsCreated++;
          }

          // Process player data
          const fullName = (row as any).fullName?.trim();
          const email = (row as any).email?.trim();

          if (!fullName && !email) {
            continue; // Skip rows with no player data
          }

          let playerUserId: string | null = null;

          // If email is provided, create/find user account
          if (email && isValidEmail(email)) {
            const existingUser = await db.query.users.findFirst({
              where: eq(users.email, email)
            });

            if (existingUser) {
              playerUserId = existingUser.id;
            } else if (fullName) {
              // Create new user account
              const { firstName, lastName } = parseFullName(fullName);
              const [newUser] = await db.insert(users).values({
                id: nanoid(),
                email,
                firstName,
                lastName,
                displayName: fullName,
                role: 'free_tier'
              }).returning();
              playerUserId = newUser.id;
            }
          }

          // Create tournament participant entry if we have a user
          if (playerUserId && teamId) {
            // Check if participant already exists
            const existingParticipant = await db.query.tournamentParticipants.findFirst({
              where: and(
                eq(tournamentParticipants.tournamentId, tournamentId),
                eq(tournamentParticipants.userId, playerUserId),
                eq(tournamentParticipants.tournamentTeamId, teamId)
              )
            });

            if (!existingParticipant) {
              await db.insert(tournamentParticipants).values({
                id: nanoid(),
                tournamentId,
                userId: playerUserId,
                tournamentTeamId: teamId,
                role: 'player',
                status: 'approved', // Auto-approve CSV imports
                joinedAt: new Date()
              });
              playersImported++;
            }
          }
        } catch (error) {
          console.error('Error processing row:', error);
          errors.push(`Error processing row: ${JSON.stringify(row)}`);
        }
      }

      // Clean up the uploaded file
      fs.unlinkSync(file.path);

      res.json({
        message: 'CSV import completed',
        teamsCreated,
        playersImported,
        errors: errors.length > 0 ? errors : undefined
      });

    } catch (error) {
      console.error("Error importing CSV:", error);
      res.status(500).json({ message: "Failed to import CSV" });
    }
  });

  // Get tournament participants (players) by tournament team
  app.get('/api/tournaments/:tournamentId/teams/:teamId/players', isAuthenticated, async (req: any, res) => {
    try {
      const { tournamentId, teamId } = req.params;

      const participants = await db
        .select({
          id: tournamentParticipants.id,
          userId: tournamentParticipants.userId,
          tournamentTeamId: tournamentParticipants.tournamentTeamId,
          role: tournamentParticipants.role,
          status: tournamentParticipants.status,
          joinedAt: tournamentParticipants.joinedAt,
          fullName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
          email: users.email,
          profileImageUrl: users.profileImageUrl,
          firstName: users.firstName,
          lastName: users.lastName
        })
        .from(tournamentParticipants)
        .leftJoin(users, eq(tournamentParticipants.userId, users.id))
        .where(and(
          eq(tournamentParticipants.tournamentId, tournamentId),
          eq(tournamentParticipants.tournamentTeamId, teamId),
          eq(tournamentParticipants.status, 'approved')
        ))
        .orderBy(sql`${users.lastName}, ${users.firstName}`);

      res.json(participants);
    } catch (error) {
      console.error("Error fetching tournament team players:", error);
      res.status(500).json({ message: "Failed to fetch tournament team players" });
    }
  });

  // Get tournament matches
  app.get('/api/tournaments/:id/matches', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;

      const matches = await db
        .select()
        .from(tournamentMatches)
        .where(eq(tournamentMatches.tournamentId, id))
        .orderBy(tournamentMatches.matchNumber);

      res.json(matches);
    } catch (error) {
      console.error("Error fetching tournament matches:", error);
      res.status(500).json({ message: "Failed to fetch tournament matches" });
    }
  });

  // Get single tournament match with player rosters and stats
  app.get('/api/tournaments/:tournamentId/matches/:matchId/details', isAuthenticated, async (req: any, res) => {
    try {
      const { tournamentId, matchId } = req.params;

      // Get the match
      const [match] = await db
        .select()
        .from(tournamentMatches)
        .where(and(
          eq(tournamentMatches.id, matchId),
          eq(tournamentMatches.tournamentId, tournamentId)
        ));

      if (!match) {
        return res.status(404).json({ message: "Match not found" });
      }

      // Get team1 details and roster
      let team1Roster: any[] = [];
      let team1Name = 'TBD';
      if (match.team1Id) {
        const [team1] = await db
          .select()
          .from(tournamentTeams)
          .where(eq(tournamentTeams.id, match.team1Id));
        
        if (team1) {
          team1Name = team1.teamName;
          
          // Get roster from regular team if teamId exists
          if (team1.teamId) {
            const members = await storage.getTeamMembers(team1.teamId);
            team1Roster = members.map(m => ({
              userId: m.user.id,
              firstName: m.user.firstName,
              lastName: m.user.lastName,
              email: m.user.email,
              profileImageUrl: m.user.profileImageUrl,
              jerseyNumber: m.jerseyNumber,
              position: m.position
            }));
          }
        }
      }

      // Get team2 details and roster
      let team2Roster: any[] = [];
      let team2Name = 'TBD';
      if (match.team2Id) {
        const [team2] = await db
          .select()
          .from(tournamentTeams)
          .where(eq(tournamentTeams.id, match.team2Id));
        
        if (team2) {
          team2Name = team2.teamName;
          
          // Get roster from regular team if teamId exists
          if (team2.teamId) {
            const members = await storage.getTeamMembers(team2.teamId);
            team2Roster = members.map(m => ({
              userId: m.user.id,
              firstName: m.user.firstName,
              lastName: m.user.lastName,
              email: m.user.email,
              profileImageUrl: m.user.profileImageUrl,
              jerseyNumber: m.jerseyNumber,
              position: m.position
            }));
          }
        }
      }

      // Get existing tournament stats for all players
      const allPlayerIds = [...team1Roster, ...team2Roster].map(p => p.userId);
      const existingStats = allPlayerIds.length > 0 ? await db
        .select()
        .from(tournamentStats)
        .where(and(
          eq(tournamentStats.tournamentId, tournamentId),
          inArray(tournamentStats.userId, allPlayerIds)
        )) : [];

      res.json({
        match,
        team1: {
          id: match.team1Id,
          name: team1Name,
          roster: team1Roster
        },
        team2: {
          id: match.team2Id,
          name: team2Name,
          roster: team2Roster
        },
        existingStats
      });
    } catch (error) {
      console.error("Error fetching match details:", error);
      res.status(500).json({ message: "Failed to fetch match details" });
    }
  });

  // Update tournament match (schedule, location, scores)
  app.patch('/api/tournaments/:tournamentId/matches/:matchId', isAuthenticated, loadUserPermissions, requireLeagueManagement, async (req: any, res) => {
    try {
      const { tournamentId, matchId } = req.params;
      
      // Validate request body
      const validatedData = updateTournamentMatchSchema.parse(req.body);
      const { scheduledTime, location, team1Score, team2Score, status } = validatedData;

      // Verify match belongs to tournament
      const [match] = await db
        .select()
        .from(tournamentMatches)
        .where(and(
          eq(tournamentMatches.id, matchId),
          eq(tournamentMatches.tournamentId, tournamentId)
        ));

      if (!match) {
        return res.status(404).json({ message: "Match not found" });
      }

      // Build update object with only provided fields
      const updateData: any = {
        updatedAt: new Date()
      };

      if (scheduledTime !== undefined) {
        // scheduledTime is already transformed to Date | null by Zod schema
        updateData.scheduledTime = scheduledTime;
      }
      if (location !== undefined) {
        updateData.location = location;
      }
      if (team1Score !== undefined) {
        updateData.team1Score = team1Score;
      }
      if (team2Score !== undefined) {
        updateData.team2Score = team2Score;
      }
      if (status !== undefined) {
        updateData.status = status;
      }

      // Auto-set scheduledTime to now when completing a match without a scheduled time
      const isCompletingMatch = status === 'completed' || 
        (team1Score !== undefined && team2Score !== undefined && team1Score !== null && team2Score !== null);
      
      if (isCompletingMatch && !match.scheduledTime && scheduledTime === undefined) {
        updateData.scheduledTime = new Date().toISOString();
      }

      // Determine winner if scores are provided
      if (team1Score !== undefined && team2Score !== undefined) {
        if (team1Score === null || team2Score === null) {
          // Scores cleared - clear winner
          updateData.winnerId = null;
        } else if (team1Score > team2Score) {
          updateData.winnerId = match.team1Id;
        } else if (team2Score > team1Score) {
          updateData.winnerId = match.team2Id;
        } else {
          // Tied - clear winner
          updateData.winnerId = null;
        }
      }

      // Get tournament info and team details
      const [tournament] = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, tournamentId));

      // Get actual team IDs from tournament teams
      const team1Data = match.team1Id ? await db
        .select()
        .from(tournamentTeams)
        .where(eq(tournamentTeams.id, match.team1Id))
        .limit(1) : null;
      
      const team2Data = match.team2Id ? await db
        .select()
        .from(tournamentTeams)
        .where(eq(tournamentTeams.id, match.team2Id))
        .limit(1) : null;

      // Create or update game record if both teams exist and match has schedule info
      if (team1Data?.[0]?.teamId && team2Data?.[0]?.teamId && tournament) {
        if (scheduledTime) {
          // Schedule is set - create or update game
          if (match.gameId) {
            // Update existing game
            await db
              .update(games)
              .set({
                scheduledAt: scheduledTime,
                venue: location !== undefined ? location : match.location,
                homeScore: team1Score !== undefined ? team1Score : match.team1Score,
                awayScore: team2Score !== undefined ? team2Score : match.team2Score,
                isCompleted: status === 'completed'
              })
              .where(eq(games.id, match.gameId));
          } else {
            // Create new game
            const [newGame] = await db
              .insert(games)
              .values({
                leagueId: tournament.leagueId,
                seasonId: tournament.seasonId,
                homeTeamId: team1Data[0].teamId,
                awayTeamId: team2Data[0].teamId,
                scheduledAt: scheduledTime,
                venue: location ?? null,
                homeScore: team1Score ?? null,
                awayScore: team2Score ?? null,
                isCompleted: status === 'completed' || false
              })
              .returning();
            
            // Link game to tournament match
            updateData.gameId = newGame.id;
          }
        } else if (scheduledTime === null && match.gameId) {
          // Schedule cleared - delete related records then the game
          try {
            // Delete related duty exclusions first
            await db
              .delete(dutyExclusions)
              .where(eq(dutyExclusions.gameId, match.gameId));
            
            // Delete related score submissions
            await db
              .delete(gameScoreSubmissions)
              .where(eq(gameScoreSubmissions.gameId, match.gameId));
            
            // Now delete the game
            await db
              .delete(games)
              .where(eq(games.id, match.gameId));
          } catch (deleteError) {
            // Could not delete game (may have other references)
          }
          // Always unlink the game from the tournament match
          updateData.gameId = null;
        }
      }

      const [updatedMatch] = await db
        .update(tournamentMatches)
        .set(updateData)
        .where(eq(tournamentMatches.id, matchId))
        .returning();

      res.json(updatedMatch);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ 
          message: "Invalid match data", 
          errors: error.errors 
        });
      }
      console.error("Error updating tournament match:", error);
      res.status(500).json({ message: "Failed to update tournament match" });
    }
  });

  // Add a new match to an existing tournament (for bracket adjustments)
  app.post('/api/tournaments/:tournamentId/matches', isAuthenticated, loadUserPermissions, requireLeagueManagement, async (req: any, res) => {
    try {
      const { tournamentId } = req.params;
      const { round, team1Id, team2Id, notes, advancesToMatchId } = req.body;

      // Verify tournament exists
      const [tournament] = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, tournamentId));

      if (!tournament) {
        return res.status(404).json({ message: "Tournament not found" });
      }

      // Get the highest match number in the tournament
      const existingMatches = await db
        .select()
        .from(tournamentMatches)
        .where(eq(tournamentMatches.tournamentId, tournamentId))
        .orderBy(sql`${tournamentMatches.matchNumber} DESC`)
        .limit(1);

      const nextMatchNumber = existingMatches.length > 0 ? existingMatches[0].matchNumber + 1 : 1;

      // Create the new match
      const [newMatch] = await db
        .insert(tournamentMatches)
        .values({
          id: nanoid(),
          tournamentId,
          gameId: null,
          round: round || `Game ${nextMatchNumber}`,
          matchNumber: nextMatchNumber,
          bracketType: 'main',
          team1Id: team1Id || null,
          team2Id: team2Id || null,
          winnerId: null,
          team1Score: null,
          team2Score: null,
          advancesToMatchId: advancesToMatchId || null,
          scheduledTime: null,
          location: null,
          status: 'scheduled',
          notes: notes || null
        })
        .returning();

      res.status(201).json(newMatch);
    } catch (error) {
      console.error("Error adding tournament match:", error);
      res.status(500).json({ message: "Failed to add tournament match" });
    }
  });

  // Update tournament match scores with player stats
  app.post('/api/tournaments/:tournamentId/matches/:matchId/score', isAuthenticated, loadUserPermissions, requireLeagueManagement, async (req: any, res) => {
    try {
      const { tournamentId, matchId } = req.params;
      const { team1Score, team2Score, playerStats } = req.body;

      // Validate both scores are provided and are numbers
      if (team1Score === null || team1Score === undefined || team2Score === null || team2Score === undefined) {
        return res.status(400).json({ message: "Both team scores are required" });
      }

      if (typeof team1Score !== 'number' || typeof team2Score !== 'number') {
        return res.status(400).json({ message: "Scores must be numbers" });
      }

      // Use transaction for data consistency
      const result = await db.transaction(async (tx) => {
        // Verify match exists and get current state
        const [match] = await tx
          .select()
          .from(tournamentMatches)
          .where(and(
            eq(tournamentMatches.id, matchId),
            eq(tournamentMatches.tournamentId, tournamentId)
          ));

        if (!match) {
          throw new Error("Match not found");
        }

        // Get tournament to check if it's a custom bracket
        const [tournament] = await tx
          .select()
          .from(tournaments)
          .where(eq(tournaments.id, tournamentId));
        
        const settings = tournament?.settings as any;
        const isCustomBracket = !!settings?.customBracket;
        
        // For custom brackets, team names are in settings, not team1Id/team2Id
        let hasTeamsAssigned = !!(match.team1Id && match.team2Id);
        
        if (!hasTeamsAssigned && isCustomBracket) {
          // Check if teams are assigned in custom bracket settings
          const matchup = settings.customBracket.matchups?.find((m: any) => m.id === matchId);
          const isRealTeam = (name: string) => 
            name && !name.startsWith('winner:') && !name.startsWith('loser:') && name !== '';
          hasTeamsAssigned = matchup && isRealTeam(matchup.team1) && isRealTeam(matchup.team2);
        }
        
        if (!hasTeamsAssigned) {
          throw new Error("Match does not have both teams assigned");
        }

        // Determine winner (for non-custom brackets)
        let winnerId = null;
        if (match.team1Id && match.team2Id) {
          if (team1Score > team2Score) {
            winnerId = match.team1Id;
          } else if (team2Score > team1Score) {
            winnerId = match.team2Id;
          }
        }

        const previousWinnerId = match.winnerId;

        // Update match scores and winner, auto-set scheduledTime if not already set
        const updateFields: any = {
          team1Score,
          team2Score,
          winnerId,
          status: 'completed',
          updatedAt: new Date()
        };
        
        // Auto-set scheduledTime to now when completing a match without a scheduled time
        if (!match.scheduledTime) {
          updateFields.scheduledTime = new Date().toISOString();
        }
        
        const [updatedMatch] = await tx
          .update(tournamentMatches)
          .set(updateFields)
          .where(eq(tournamentMatches.id, matchId))
          .returning();

        // Recalculate ALL team records from tournament matches (ensures consistency)
        const allMatches = await tx
          .select()
          .from(tournamentMatches)
          .where(eq(tournamentMatches.tournamentId, tournamentId));

        // Reset all team records to 0
        await tx
          .update(tournamentTeams)
          .set({ wins: 0, losses: 0 })
          .where(eq(tournamentTeams.tournamentId, tournamentId));

        // Count wins and losses from all completed matches
        const teamRecords = new Map<string, { wins: number; losses: number }>();
        for (const m of allMatches) {
          if (m.winnerId && m.team1Id && m.team2Id) {
            const winner = teamRecords.get(m.winnerId) || { wins: 0, losses: 0 };
            winner.wins += 1;
            teamRecords.set(m.winnerId, winner);

            const loserId = m.winnerId === m.team1Id ? m.team2Id : m.team1Id;
            const loser = teamRecords.get(loserId) || { wins: 0, losses: 0 };
            loser.losses += 1;
            teamRecords.set(loserId, loser);
          }
        }

        // Update team records
        for (const [teamId, record] of teamRecords.entries()) {
          await tx
            .update(tournamentTeams)
            .set(record)
            .where(eq(tournamentTeams.id, teamId));
        }

        // Handle winner advancement
        if (match.advancesToMatchId) {
          const [nextMatch] = await tx
            .select()
            .from(tournamentMatches)
            .where(eq(tournamentMatches.id, match.advancesToMatchId));

          if (nextMatch) {
            const updateSlot: any = {};
            
            // Replace previous winner if they were in the next match
            if (previousWinnerId && previousWinnerId !== winnerId) {
              if (nextMatch.team1Id === previousWinnerId) {
                updateSlot.team1Id = winnerId;
              } else if (nextMatch.team2Id === previousWinnerId) {
                updateSlot.team2Id = winnerId;
              }
            }
            
            // Or fill first empty slot if no replacement needed
            if (Object.keys(updateSlot).length === 0 && winnerId) {
              if (!nextMatch.team1Id) {
                updateSlot.team1Id = winnerId;
              } else if (!nextMatch.team2Id) {
                updateSlot.team2Id = winnerId;
              }
            }

            if (Object.keys(updateSlot).length > 0) {
              await tx
                .update(tournamentMatches)
                .set(updateSlot)
                .where(eq(tournamentMatches.id, match.advancesToMatchId));
            }
          }
        }

        // Handle custom bracket winner advancement (update settings JSON)
        if (isCustomBracket && settings?.customBracket?.matchups) {
          const matchup = settings.customBracket.matchups.find((m: any) => m.id === matchId);
          if (matchup) {
            // Determine winning team name from custom bracket settings
            const winningTeamName = team1Score > team2Score ? matchup.team1 : matchup.team2;
            const losingTeamName = team1Score > team2Score ? matchup.team2 : matchup.team1;
            const gameNumber = matchup.gameNumber; // e.g., "Play-in-game", "Game 1", etc.
            
            // Create placeholders to search for
            const winnerPlaceholder = `winner:${gameNumber}`;
            const loserPlaceholder = `loser:${gameNumber}`;
            
            // Update all downstream matchups that reference this match
            let updatedMatchups = settings.customBracket.matchups.map((m: any) => {
              let updated = { ...m };
              
              // Replace winner placeholder with winning team name
              if (m.team1 === winnerPlaceholder) {
                updated.team1 = winningTeamName;
              }
              if (m.team2 === winnerPlaceholder) {
                updated.team2 = winningTeamName;
              }
              
              // Replace loser placeholder with losing team name (for consolation/losers brackets)
              if (m.team1 === loserPlaceholder) {
                updated.team1 = losingTeamName;
              }
              if (m.team2 === loserPlaceholder) {
                updated.team2 = losingTeamName;
              }
              
              return updated;
            });
            
            // Update tournament settings with modified matchups
            const updatedSettings = {
              ...settings,
              customBracket: {
                ...settings.customBracket,
                matchups: updatedMatchups
              }
            };
            
            await tx
              .update(tournaments)
              .set({ settings: updatedSettings })
              .where(eq(tournaments.id, tournamentId));
          }
        }

        // Handle player stats - simple accumulation
        if (playerStats && Array.isArray(playerStats) && playerStats.length > 0) {
          for (const stat of playerStats) {
            const { userId, teamId, goals, assists, penaltyMinutes } = stat;

            // Skip zero stats
            if (goals === 0 && assists === 0 && penaltyMinutes === 0) continue;

            const [existing] = await tx
              .select()
              .from(tournamentStats)
              .where(and(
                eq(tournamentStats.tournamentId, tournamentId),
                eq(tournamentStats.userId, userId),
                eq(tournamentStats.teamId, teamId)
              ));

            if (existing) {
              await tx
                .update(tournamentStats)
                .set({
                  goals: sql`${tournamentStats.goals} + ${goals}`,
                  assists: sql`${tournamentStats.assists} + ${assists}`,
                  points: sql`${tournamentStats.points} + ${goals + assists}`,
                  penaltyMinutes: sql`${tournamentStats.penaltyMinutes} + ${penaltyMinutes}`,
                  gamesPlayed: sql`${tournamentStats.gamesPlayed} + 1`,
                  updatedAt: new Date()
                })
                .where(eq(tournamentStats.id, existing.id));
            } else {
              await tx
                .insert(tournamentStats)
                .values({
                  tournamentId,
                  userId,
                  teamId,
                  goals,
                  assists,
                  points: goals + assists,
                  penaltyMinutes,
                  gamesPlayed: 1
                });
            }
          }
        }

        return updatedMatch;
      });

      res.json({ 
        match: result,
        message: "Match scored successfully"
      });
    } catch (error) {
      console.error("Error scoring match:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to score match";
      res.status(500).json({ message: errorMessage });
    }
  });

  // Helper function to generate unique tournament ID
  async function generateUniqueTournamentId(): Promise<string> {
    let uniqueId: string;
    let attempts = 0;
    const maxAttempts = 10;
    
    do {
      uniqueId = nanoid(8).toUpperCase();
      const [existing] = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.uniqueTournamentId, uniqueId))
        .limit(1);
      
      if (!existing) {
        return uniqueId;
      }
      
      attempts++;
    } while (attempts < maxAttempts);
    
    throw new Error('Unable to generate unique tournament ID');
  }

  // Helper function to calculate tournament access windows
  function calculateAccessWindows(matches: any[]) {
    if (!matches || matches.length === 0) {
      return { accessStartDate: null, accessEndDate: null };
    }

    const matchDates = matches
      .filter(m => m.scheduledTime)
      .map(m => new Date(m.scheduledTime))
      .sort((a, b) => a.getTime() - b.getTime());

    if (matchDates.length === 0) {
      return { accessStartDate: null, accessEndDate: null };
    }

    const firstMatchDate = matchDates[0];
    const lastMatchDate = matchDates[matchDates.length - 1];

    // Access starts 14 days (2 weeks) before first match
    const accessStartDate = new Date(firstMatchDate);
    accessStartDate.setDate(accessStartDate.getDate() - 14);

    // Access ends 7 days (1 week) after last match
    const accessEndDate = new Date(lastMatchDate);
    accessEndDate.setDate(accessEndDate.getDate() + 7);

    return { accessStartDate, accessEndDate };
  }

  // Helper function to calculate tournament payment amount
  async function calculateTournamentPayment(tournamentId: string): Promise<number> {
    const teamCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(tournamentTeams)
      .where(eq(tournamentTeams.tournamentId, tournamentId));
    
    const count = Number(teamCount[0]?.count || 0);
    // $5 per team = 500 cents (stored as cents for frontend display)
    return count * 500;
  }

  // Create tournament
  app.post('/api/tournaments', isAuthenticated, loadUserPermissions, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { type } = req.body;
      
      // For league tournaments, require league management permissions
      // For standalone tournaments, allow any authenticated user
      if (type !== 'standalone') {
        const user = req.userWithPermissions;
        if (!user) {
          return res.status(401).json({ message: "User permissions not loaded" });
        }

        const userRole = user.role || 'free_tier';
        const hasAdmin = user.specialPermissions && user.specialPermissions.includes('admin');
        
        // Check if user has global permissions or is a commissioner of any league
        const hasGlobalPermissions = user.isPrimaryCommissioner || hasAdmin || (roleHierarchy[userRole] >= roleHierarchy['secondary_commissioner']);
        let isCommissioner = false;
        
        if (!hasGlobalPermissions) {
          try {
            const userLeagues = await storage.getLeaguesByCommissioner(user.id);
            isCommissioner = userLeagues && userLeagues.length > 0;
          } catch (error) {
            console.error("Error checking league commissioner status:", error);
          }
        }

        if (!hasGlobalPermissions && !isCommissioner) {
          return res.status(403).json({ 
            message: "Access denied. League tournament creation requires commissioner or admin permissions" 
          });
        }
      }
      
      // Generate unique tournament ID
      const uniqueTournamentId = await generateUniqueTournamentId();
      
      // Parse string dates to Date objects before Zod validation
      const rawBody = { ...req.body };

      // For standalone tournaments, the form provides a single firstGameDate
      // as a "YYYY-MM-DD" string. We derive accessStartDate (= firstGameDate - 14 days)
      // and set startDate. accessEndDate is left null until matches are scheduled,
      // at which point calculateAccessWindows populates it (= last match + 7 days).
      if (rawBody.type === 'standalone') {
        if (!rawBody.firstGameDate) {
          return res.status(400).json({ message: "Standalone tournaments require a first game date" });
        }

        // Parse the date as local-midnight (avoid UTC-offset bugs from `new Date('YYYY-MM-DD')`)
        // and reject malformed/impossible calendar dates (e.g. "2026-02-31").
        let firstGameDate: Date | null = null;
        if (typeof rawBody.firstGameDate === 'string') {
          const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawBody.firstGameDate);
          if (m) {
            const yr = Number(m[1]);
            const mo = Number(m[2]);
            const dy = Number(m[3]);
            const candidate = new Date(yr, mo - 1, dy);
            if (
              !Number.isNaN(candidate.getTime()) &&
              candidate.getFullYear() === yr &&
              candidate.getMonth() === mo - 1 &&
              candidate.getDate() === dy
            ) {
              firstGameDate = candidate;
            }
          }
        } else if (rawBody.firstGameDate instanceof Date && !Number.isNaN(rawBody.firstGameDate.getTime())) {
          firstGameDate = rawBody.firstGameDate;
        }

        if (!firstGameDate) {
          return res.status(400).json({ message: "First game date is invalid. Please provide a valid date in YYYY-MM-DD format." });
        }
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        if (firstGameDate.getTime() < todayStart.getTime()) {
          return res.status(400).json({ message: "First game date cannot be in the past" });
        }
        const derivedAccessStart = new Date(firstGameDate);
        derivedAccessStart.setDate(derivedAccessStart.getDate() - 14);
        rawBody.startDate = firstGameDate;
        rawBody.accessStartDate = derivedAccessStart;
        rawBody.accessEndDate = null;
        delete rawBody.firstGameDate;
      } else {
        // Non-standalone tournaments may still pass these dates explicitly
        if (rawBody.accessStartDate && typeof rawBody.accessStartDate === 'string') {
          rawBody.accessStartDate = new Date(rawBody.accessStartDate);
        } else if (!rawBody.accessStartDate) {
          rawBody.accessStartDate = null;
        }
        if (rawBody.accessEndDate && typeof rawBody.accessEndDate === 'string') {
          rawBody.accessEndDate = new Date(rawBody.accessEndDate);
        } else if (!rawBody.accessEndDate) {
          rawBody.accessEndDate = null;
        }
      }

      const validatedData = insertTournamentSchema.parse({
        ...rawBody,
        createdBy: userId,
        uniqueTournamentId,
        paymentStatus: 'unpaid',
        paymentAmount: 0 // Will be updated when teams are added
      });

      // Create tournament
      const [tournament] = await db
        .insert(tournaments)
        .values(validatedData)
        .returning();

      res.status(201).json(tournament);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ 
          message: "Invalid tournament data", 
          errors: error.errors 
        });
      }
      console.error("Error creating tournament:", error);
      res.status(500).json({ message: "Failed to create tournament" });
    }
  });

  // Update tournament (draft only)
  app.patch('/api/tournaments/:id', isAuthenticated, loadUserPermissions, requireLeagueManagement, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { name, type, seasonId, format, description, teams, settings, firstGameDate, shiftScheduledMatches } = req.body;

      // Check tournament exists and is draft
      const [tournament] = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, id));

      if (!tournament) {
        return res.status(404).json({ message: "Tournament not found" });
      }

      if (tournament.status !== 'draft') {
        return res.status(400).json({ message: "Cannot edit tournament after it has started" });
      }

      // For standalone tournaments, allow updating the first game date which
      // re-derives startDate (= firstGameDate) and accessStartDate
      // (= firstGameDate - 14 days), mirroring the create flow.
      let derivedStartDate: Date | undefined;
      let derivedAccessStartDate: Date | undefined;
      const effectiveType = type || tournament.type;
      if (firstGameDate !== undefined && firstGameDate !== null && firstGameDate !== '') {
        if (effectiveType !== 'standalone') {
          return res.status(400).json({ message: "First game date can only be set on standalone tournaments" });
        }

        let parsedFirstGameDate: Date | null = null;
        if (typeof firstGameDate === 'string') {
          const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(firstGameDate);
          if (m) {
            const yr = Number(m[1]);
            const mo = Number(m[2]);
            const dy = Number(m[3]);
            const candidate = new Date(yr, mo - 1, dy);
            if (
              !Number.isNaN(candidate.getTime()) &&
              candidate.getFullYear() === yr &&
              candidate.getMonth() === mo - 1 &&
              candidate.getDate() === dy
            ) {
              parsedFirstGameDate = candidate;
            }
          }
        } else if (firstGameDate instanceof Date && !Number.isNaN(firstGameDate.getTime())) {
          parsedFirstGameDate = firstGameDate;
        }

        if (!parsedFirstGameDate) {
          return res.status(400).json({ message: "First game date is invalid. Please provide a valid date in YYYY-MM-DD format." });
        }

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        if (parsedFirstGameDate.getTime() < todayStart.getTime()) {
          return res.status(400).json({ message: "First game date cannot be in the past" });
        }

        derivedStartDate = parsedFirstGameDate;
        derivedAccessStartDate = new Date(parsedFirstGameDate);
        derivedAccessStartDate.setDate(derivedAccessStartDate.getDate() - 14);
      }

      // If the commissioner asked to shift scheduled matches by the same delta
      // as the first-game-date change, compute the day-delta now and apply it
      // to every scheduled tournament match. We then recalculate accessEndDate
      // from the new last-match time.
      let derivedAccessEndDate: Date | undefined;
      if (
        shiftScheduledMatches === true &&
        derivedStartDate !== undefined &&
        tournament.startDate
      ) {
        const oldStart = new Date(tournament.startDate);
        const oldStartDayUtc = Date.UTC(
          oldStart.getFullYear(),
          oldStart.getMonth(),
          oldStart.getDate()
        );
        const newStartDayUtc = Date.UTC(
          derivedStartDate.getFullYear(),
          derivedStartDate.getMonth(),
          derivedStartDate.getDate()
        );
        const dayDelta = Math.round((newStartDayUtc - oldStartDayUtc) / (24 * 60 * 60 * 1000));

        if (dayDelta !== 0) {
          // Load all matches with a scheduled time and shift them by dayDelta.
          const existingMatches = await db
            .select()
            .from(tournamentMatches)
            .where(eq(tournamentMatches.tournamentId, id));

          // Shift while preserving the local wall-clock time of day (e.g. a 7pm
          // match remains 7pm after the shift, even across DST boundaries).
          const shiftedMatches: { id: string; scheduledTime: Date }[] = [];
          for (const m of existingMatches) {
            if (m.scheduledTime) {
              const old = new Date(m.scheduledTime);
              const newTime = new Date(
                old.getFullYear(),
                old.getMonth(),
                old.getDate() + dayDelta,
                old.getHours(),
                old.getMinutes(),
                old.getSeconds(),
                old.getMilliseconds()
              );
              shiftedMatches.push({ id: m.id, scheduledTime: newTime });
            }
          }

          for (const sm of shiftedMatches) {
            await db
              .update(tournamentMatches)
              .set({ scheduledTime: sm.scheduledTime })
              .where(eq(tournamentMatches.id, sm.id));
          }

          // Recompute the access window's end from the new last-match time.
          const reloaded = await db
            .select()
            .from(tournamentMatches)
            .where(eq(tournamentMatches.tournamentId, id));
          const { accessEndDate: recomputedEnd } = calculateAccessWindows(reloaded);
          derivedAccessEndDate = recomputedEnd ?? undefined;
        }
      }

      // Merge settings if provided
      const mergedSettings = settings 
        ? { ...(tournament.settings as any || {}), ...settings }
        : tournament.settings;

      // Update tournament metadata
      const [updated] = await db
        .update(tournaments)
        .set({
          name: name || tournament.name,
          type: type || tournament.type,
          seasonId: type === 'season_playoff' ? seasonId : null,
          format: format || tournament.format,
          description: description !== undefined ? description : tournament.description,
          numTeams: teams ? teams.length : tournament.numTeams,
          settings: mergedSettings,
          ...(derivedStartDate !== undefined ? { startDate: derivedStartDate } : {}),
          ...(derivedAccessStartDate !== undefined ? { accessStartDate: derivedAccessStartDate } : {}),
          ...(derivedAccessEndDate !== undefined ? { accessEndDate: derivedAccessEndDate } : {}),
          updatedAt: new Date()
        })
        .where(eq(tournaments.id, id))
        .returning();

      // If custom bracket with matchups is being saved, create/update tournament_matches
      if (settings?.customBracket?.matchups && Array.isArray(settings.customBracket.matchups)) {
        const matchups = settings.customBracket.matchups;
        
        // Get existing matches to preserve scheduledTime, location, notes, gameId
        const existingMatches = await db
          .select()
          .from(tournamentMatches)
          .where(eq(tournamentMatches.tournamentId, id));
        
        // Build a map of existing match data by ID to preserve important fields
        const existingMatchMap = new Map(existingMatches.map(m => [m.id, m]));
        
        if (existingMatches.length > 0) {
          const matchIds = existingMatches.map(m => m.id);
          // Delete RSVPs first (foreign key constraint)
          await db.delete(tournamentMatchRsvps).where(inArray(tournamentMatchRsvps.matchId, matchIds));
        }
        
        // Clear existing matches for this tournament
        await db.delete(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
        
        // Get existing teams for the tournament to map team names to IDs
        const existingTeams = await db
          .select()
          .from(tournamentTeams)
          .where(eq(tournamentTeams.tournamentId, id));
        
        const teamNameToId = new Map(existingTeams.map(t => [t.teamName, t.id]));
        
        // Create tournament_matches from matchups
        const matchesToInsert = matchups.map((matchup: any, index: number) => {
          // Extract game number from string like "Game 1" -> 1
          const matchNumber = parseInt(matchup.gameNumber?.replace(/\D/g, '') || String(index + 1));
          
          // Get existing match data to preserve scheduledTime, location, notes, gameId
          const existingMatch = existingMatchMap.get(matchup.id);
          
          return {
            id: matchup.id,
            tournamentId: id,
            round: matchup.type === 'losers' ? 'Losers Bracket' : 'Winners Bracket',
            matchNumber,
            team1Id: teamNameToId.get(matchup.team1) || null,
            team2Id: teamNameToId.get(matchup.team2) || null,
            team1Score: matchup.score1,
            team2Score: matchup.score2,
            winnerId: matchup.winner ? teamNameToId.get(matchup.winner) : null,
            status: matchup.winner ? 'completed' : 'pending',
            scheduledTime: existingMatch?.scheduledTime || matchup.scheduledTime || null,
            location: existingMatch?.location || null,
            notes: existingMatch?.notes || null,
            gameId: existingMatch?.gameId || null
          };
        });
        
        if (matchesToInsert.length > 0) {
          await db.insert(tournamentMatches).values(matchesToInsert);
        }
      }

      // If teams provided, check if we need to regenerate bracket or just add new teams
      if (teams && teams.length > 0) {
        const existingTeams = await db
          .select()
          .from(tournamentTeams)
          .where(eq(tournamentTeams.tournamentId, id));

        const existingTeamIds = new Set(existingTeams.map(t => t.teamId));
        const incomingTeamIds = new Set(teams.map((t: any) => t.teamId));

        const formatChanged = format && format !== tournament.format;
        const teamsRemoved = [...existingTeamIds].some(id => !incomingTeamIds.has(id));
        const teamsAdded = teams.filter((t: any) => !existingTeamIds.has(t.teamId));
        const teamsUnchanged = !teamsRemoved && teamsAdded.length === 0;
        const addOnly = !formatChanged && !teamsRemoved && teamsAdded.length > 0;
        const skipRegeneration = teamsUnchanged || addOnly || req.body.regenerateBracket === false;

        if (!formatChanged && skipRegeneration) {
          if (teamsAdded.length > 0) {
            const maxSeed = existingTeams.reduce((max, t) => Math.max(max, t.seed || 0), 0);
            await db
              .insert(tournamentTeams)
              .values(teamsAdded.map((team: any, idx: number) => ({
                ...team,
                seed: maxSeed + idx + 1,
                tournamentId: id
              })));
          }

          const newTotal = existingTeams.length + teamsAdded.length;
          await db
            .update(tournaments)
            .set({
              numTeams: newTotal,
              updatedAt: new Date()
            })
            .where(eq(tournaments.id, id));

          const [finalUpdated] = await db
            .select()
            .from(tournaments)
            .where(eq(tournaments.id, id));

          return res.json(finalUpdated);
        }

        // Full regeneration: clear existing teams and matches
        await db.delete(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
        await db.delete(tournamentTeams).where(eq(tournamentTeams.tournamentId, id));

        // Insert new teams
        const insertedTeams = await db
          .insert(tournamentTeams)
          .values(teams.map((team: any) => ({
            ...team,
            tournamentId: id
          })))
          .returning();

        // Generate bracket based on format
        const finalFormat = format || tournament.format;
        let bracketResult;
        switch (finalFormat) {
          case 'single_elimination':
            bracketResult = generateSingleElimination(insertedTeams, id);
            break;
          case 'double_elimination':
            bracketResult = generateDoubleElimination(insertedTeams, id);
            break;
          case 'round_robin':
            bracketResult = generateRoundRobin(insertedTeams, id);
            break;
          case 'round_robin_split':
            bracketResult = generateRoundRobinSplit(insertedTeams, id);
            break;
          case 'three_game_guarantee':
            bracketResult = generateThreeGameGuarantee(insertedTeams, id, mergedSettings);
            break;
          case 'custom_bracket':
            return res.json(updated);
          default:
            return res.status(400).json({ message: "Invalid tournament format" });
        }

        // Insert generated matches
        if (bracketResult.matches.length > 0) {
          // First insert without advancesToMatchId to get actual IDs
          const matchesWithoutAdvances = bracketResult.matches.map(m => ({
            ...m,
            advancesToMatchId: null // Clear temporarily
          }));
          
          const insertedMatches = await db.insert(tournamentMatches).values(matchesWithoutAdvances).returning();
          
          // Build mapping from match_N to actual database ID
          const matchNumberToId = new Map<string, string>();
          insertedMatches.forEach(m => {
            matchNumberToId.set(`match_${m.matchNumber}`, m.id);
          });
          
          // Update advancesToMatchId with actual database IDs
          for (const originalMatch of bracketResult.matches) {
            if (originalMatch.advancesToMatchId && originalMatch.advancesToMatchId.startsWith('match_')) {
              const actualNextMatchId = matchNumberToId.get(originalMatch.advancesToMatchId);
              if (actualNextMatchId) {
                const currentMatch = insertedMatches.find(m => m.matchNumber === originalMatch.matchNumber);
                if (currentMatch) {
                  await db.update(tournamentMatches)
                    .set({ advancesToMatchId: actualNextMatchId })
                    .where(eq(tournamentMatches.id, currentMatch.id));
                }
              }
            }
          }
          
          // Calculate access windows based on match dates (only backfill if creator hasn't set dates)
          const accessWindows = calculateAccessWindows(bracketResult.matches);
          
          // Calculate payment amount based on team count
          const paymentAmount = await calculateTournamentPayment(id);

          // Fetch current tournament to check if creator has already set access dates
          const [currentTournament] = await db
            .select({ accessStartDate: tournaments.accessStartDate, accessEndDate: tournaments.accessEndDate })
            .from(tournaments)
            .where(eq(tournaments.id, id));
          
          // Update tournament with access windows and payment amount
          await db
            .update(tournaments)
            .set({
              // Only use auto-calculated dates if creator hasn't already set them
              accessStartDate: currentTournament?.accessStartDate ?? accessWindows.accessStartDate,
              accessEndDate: currentTournament?.accessEndDate ?? accessWindows.accessEndDate,
              paymentAmount,
              updatedAt: new Date()
            })
            .where(eq(tournaments.id, id));
          
          // Fetch updated tournament to return
          const [finalUpdated] = await db
            .select()
            .from(tournaments)
            .where(eq(tournaments.id, id));
          
          return res.json(finalUpdated);
        }
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating tournament:", error);
      res.status(500).json({ message: "Failed to update tournament" });
    }
  });

  // Toggle tournament visibility to league members
  app.patch('/api/tournaments/:id/visibility', isAuthenticated, loadUserPermissions, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { isVisibleToLeague } = req.body;
      const userId = req.user.claims.sub;

      const [tournament] = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, id));

      if (!tournament) {
        return res.status(404).json({ message: "Tournament not found" });
      }

      // Check commissioner access
      let isCommissioner = tournament.createdBy === userId;
      
      if (!isCommissioner && tournament.leagueId) {
        const user = await storage.getUser(userId);
        if (user) {
          const { canManageLeagueSpecific } = await import('./permissionMiddleware');
          isCommissioner = await canManageLeagueSpecific(user as any, tournament.leagueId);
        }
      }

      if (!isCommissioner) {
        return res.status(403).json({ message: 'Only commissioners can toggle tournament visibility' });
      }

      // Update visibility
      const [updated] = await db
        .update(tournaments)
        .set({
          isVisibleToLeague: isVisibleToLeague,
          visibleToLeagueAt: isVisibleToLeague ? new Date() : null,
          updatedAt: new Date()
        })
        .where(eq(tournaments.id, id))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Error updating tournament visibility:", error);
      res.status(500).json({ message: "Failed to update tournament visibility" });
    }
  });

  // Get visible tournaments for a league (for league members to see on schedule)
  app.get('/api/leagues/:leagueId/visible-tournaments', isAuthenticated, async (req: any, res) => {
    try {
      const { leagueId } = req.params;
      const userId = req.user.claims.sub;

      // Check if user is a member of this league
      const [membership] = await db
        .select()
        .from(leagueMemberships)
        .where(
          and(
            eq(leagueMemberships.leagueId, leagueId),
            eq(leagueMemberships.userId, userId),
            eq(leagueMemberships.status, 'approved')
          )
        );

      if (!membership) {
        return res.status(403).json({ message: 'You must be a league member to view tournaments' });
      }

      // Get visible tournaments that haven't expired (30 days after final match)
      const visibleTournaments = await db
        .select()
        .from(tournaments)
        .where(
          and(
            eq(tournaments.leagueId, leagueId),
            eq(tournaments.isVisibleToLeague, true)
          )
        );

      // Filter out tournaments where the final match was more than 30 days ago
      const now = new Date();
      const validTournaments = [];
      
      for (const tournament of visibleTournaments) {
        // Get the latest match date for this tournament
        const latestMatch = await db
          .select({ scheduledTime: tournamentMatches.scheduledTime })
          .from(tournamentMatches)
          .where(eq(tournamentMatches.tournamentId, tournament.id))
          .orderBy(sql`scheduled_time DESC NULLS LAST`)
          .limit(1);

        let isExpired = false;
        if (latestMatch.length > 0 && latestMatch[0].scheduledTime) {
          const expiryDate = new Date(latestMatch[0].scheduledTime);
          expiryDate.setDate(expiryDate.getDate() + 30);
          isExpired = now > expiryDate;
        }

        if (!isExpired) {
          validTournaments.push(tournament);
        }
      }

      res.json(validTournaments);
    } catch (error) {
      console.error("Error fetching visible tournaments:", error);
      res.status(500).json({ message: "Failed to fetch visible tournaments" });
    }
  });

  // Add teams to tournament and generate bracket
  app.post('/api/tournaments/:id/generate-bracket', isAuthenticated, loadUserPermissions, async (req: any, res) => {
    try {
      const { id: tournamentId } = req.params;
      const { teams: teamData, format, settings: requestSettings } = req.body;
      const userId = req.user.claims.sub;

      // Validate tournament exists and is in draft status
      const [tournament] = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, tournamentId));

      if (!tournament) {
        return res.status(404).json({ message: "Tournament not found" });
      }

      if (tournament.status !== 'draft') {
        return res.status(400).json({ message: "Cannot modify tournament after it has started" });
      }

      // For league tournaments, require league management permissions
      // For standalone tournaments, allow the creator only
      if (tournament.type !== 'standalone') {
        const user = req.userWithPermissions;
        if (!user) {
          return res.status(401).json({ message: "User permissions not loaded" });
        }

        const userRole = user.role || 'free_tier';
        const hasAdmin = user.specialPermissions && user.specialPermissions.includes('admin');
        
        const hasGlobalPermissions = user.isPrimaryCommissioner || hasAdmin || (roleHierarchy[userRole] >= roleHierarchy['secondary_commissioner']);
        let isCommissioner = false;
        
        if (!hasGlobalPermissions) {
          try {
            const userLeagues = await storage.getLeaguesByCommissioner(user.id);
            isCommissioner = userLeagues && userLeagues.length > 0;
          } catch (error) {
            console.error("Error checking league commissioner status:", error);
          }
        }

        if (!hasGlobalPermissions && !isCommissioner) {
          return res.status(403).json({ 
            message: "Access denied. League tournament modification requires commissioner or admin permissions" 
          });
        }
      } else {
        // For standalone tournaments, only the creator can modify
        if (tournament.createdBy !== userId) {
          return res.status(403).json({ 
            message: "Access denied. Only the tournament creator can modify this tournament" 
          });
        }
      }

      // Validate team count (3-128 teams)
      if (!teamData || teamData.length < 3 || teamData.length > 128) {
        return res.status(400).json({ 
          message: `Invalid team count. Tournaments must have between 3 and 128 teams (received ${teamData?.length || 0})` 
        });
      }

      // Clear existing teams and matches
      await db.delete(tournamentMatches).where(eq(tournamentMatches.tournamentId, tournamentId));
      await db.delete(tournamentTeams).where(eq(tournamentTeams.tournamentId, tournamentId));

      // Merge tournament settings with request settings (request settings take precedence)
      // Also include tournament type so bracket generator knows if this is standalone
      const settings = { 
        ...(tournament.settings as any || {}), 
        ...(requestSettings || {}),
        tournamentType: tournament.type  // Pass tournament type to bracket generator
      };
      
      // SERVER-SIDE SEEDING: For season playoff tournaments, sort teams by standings
      let seededTeamData = [...teamData];
      if (tournament.type === 'season_playoff' && tournament.leagueId) {
        try {
          
          // First try season-specific standings
          let standingsData = await storage.getLeagueStandings(tournament.leagueId, tournament.seasonId || undefined);
          
          // Check if standings have real data (not all zeros)
          const hasRealData = standingsData.some((s: any) => s.wins > 0 || s.losses > 0 || s.points > 0);
          
          if (!hasRealData && tournament.seasonId) {
            standingsData = await storage.getLeagueStandings(tournament.leagueId, undefined);
          }
          
          
          if (standingsData.length > 0) {
            // Create a map of teamId -> standings rank (0-indexed)
            const standingsRankMap = new Map<string, number>();
            standingsData.forEach((s: any, index: number) => {
              standingsRankMap.set(s.teamId, index);
            });
            
            // Sort teams by their standings position
            seededTeamData.sort((a: any, b: any) => {
              const rankA = standingsRankMap.get(a.teamId) ?? 999;
              const rankB = standingsRankMap.get(b.teamId) ?? 999;
              return rankA - rankB;
            });
            
            // Re-assign seeds based on sorted order
            seededTeamData = seededTeamData.map((team: any, index: number) => ({
              ...team,
              seed: index + 1
            }));
            
          }
        } catch (standingsError) {
          console.warn('🏆 [SERVER] Failed to fetch standings for seeding, using client order:', standingsError);
        }
      }
      
      // Apply bracket type (seeded or blind_draw) to determine team order and seeds
      const bracketType = settings.bracketType || 'seeded';
      const orderedTeamData = applyBracketType(seededTeamData, bracketType);

      // Insert teams with updated seeds
      const insertedTeams = await db
        .insert(tournamentTeams)
        .values(orderedTeamData.map((team: any) => ({
          ...team,
          tournamentId
        })))
        .returning();

      // For custom brackets, just return teams without generating matches
      if (format === 'custom_bracket') {
        return res.json({ 
          teams: insertedTeams, 
          matches: [],
          rounds: []
        });
      }

      // Generate bracket based on format
      let bracketResult;
      
      switch (format) {
        case 'single_elimination':
          bracketResult = generateSingleElimination(insertedTeams, tournamentId, settings);
          break;
        case 'double_elimination':
          bracketResult = generateDoubleElimination(insertedTeams, tournamentId, settings);
          break;
        case 'three_game_guarantee':
          bracketResult = generateThreeGameGuarantee(insertedTeams, tournamentId, settings);
          break;
        case 'round_robin':
          bracketResult = generateRoundRobin(insertedTeams, tournamentId);
          break;
        case 'round_robin_split':
          bracketResult = generateRoundRobinSplit(insertedTeams, tournamentId);
          break;
        default:
          return res.status(400).json({ message: "Invalid tournament format" });
      }

      // Insert matches - first without advancesToMatchId to get actual IDs
      const matchesWithoutAdvances = bracketResult.matches.map(m => ({
        ...m,
        advancesToMatchId: null // Clear temporarily
      }));
      
      if (matchesWithoutAdvances.length === 0) {
        // Safety guard: no matches were generated (e.g. empty bracket config)
        const safePayment = await calculateTournamentPayment(tournamentId);
        await db.update(tournaments).set({ paymentAmount: safePayment, numTeams: insertedTeams.length, updatedAt: new Date() }).where(eq(tournaments.id, tournamentId));
        return res.json({ teams: insertedTeams, matches: [], rounds: bracketResult.rounds });
      }

      const insertedMatches = await db
        .insert(tournamentMatches)
        .values(matchesWithoutAdvances)
        .returning();
      
      // Build mapping from match_N to actual database ID
      const matchNumberToId = new Map<string, string>();
      insertedMatches.forEach(m => {
        matchNumberToId.set(`match_${m.matchNumber}`, m.id);
      });
      
      // Update advancesToMatchId with actual database IDs
      for (const originalMatch of bracketResult.matches) {
        if (originalMatch.advancesToMatchId && originalMatch.advancesToMatchId.startsWith('match_')) {
          const actualNextMatchId = matchNumberToId.get(originalMatch.advancesToMatchId);
          if (actualNextMatchId) {
            const currentMatch = insertedMatches.find(m => m.matchNumber === originalMatch.matchNumber);
            if (currentMatch) {
              await db.update(tournamentMatches)
                .set({ advancesToMatchId: actualNextMatchId })
                .where(eq(tournamentMatches.id, currentMatch.id));
              // Also update the in-memory version for the response
              currentMatch.advancesToMatchId = actualNextMatchId;
            }
          }
        }
      }

      // Calculate and update payment amount and numTeams on the tournament
      const paymentAmount = await calculateTournamentPayment(tournamentId);
      await db
        .update(tournaments)
        .set({
          paymentAmount,
          numTeams: insertedTeams.length,
          updatedAt: new Date()
        })
        .where(eq(tournaments.id, tournamentId));

      res.json({ 
        teams: insertedTeams, 
        matches: insertedMatches,
        rounds: bracketResult.rounds
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ 
          message: "Invalid bracket data", 
          errors: error.errors 
        });
      }
      console.error("Error generating bracket:", error);
      const errMsg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: `Failed to generate bracket: ${errMsg}` });
    }
  });

  // Update tournament match (scheduling, scores, etc.)
  app.patch('/api/tournament-matches/:id', isAuthenticated, loadUserPermissions, requireLeagueManagement, async (req: any, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const [updatedMatch] = await db
        .update(tournamentMatches)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(tournamentMatches.id, id))
        .returning();

      if (!updatedMatch) {
        return res.status(404).json({ message: "Match not found" });
      }

      // If this match is completed and has a winner, update wins/losses
      if (updates.winnerId && updates.status === 'completed') {
        const loserId = updatedMatch.team1Id === updates.winnerId 
          ? updatedMatch.team2Id 
          : updatedMatch.team1Id;

        if (updates.winnerId) {
          await db
            .update(tournamentTeams)
            .set({ wins: sql`${tournamentTeams.wins} + 1` })
            .where(eq(tournamentTeams.id, updates.winnerId));
        }

        if (loserId) {
          await db
            .update(tournamentTeams)
            .set({ losses: sql`${tournamentTeams.losses} + 1` })
            .where(eq(tournamentTeams.id, loserId));
        }
      }

      res.json(updatedMatch);
    } catch (error) {
      console.error("Error updating match:", error);
      res.status(500).json({ message: "Failed to update match" });
    }
  });

  // Start tournament (lock bracket)
  app.post('/api/tournaments/:id/start', isAuthenticated, loadUserPermissions, requireLeagueManagement, async (req: any, res) => {
    try {
      const { id } = req.params;

      const [updated] = await db
        .update(tournaments)
        .set({ 
          status: 'active',
          updatedAt: new Date()
        })
        .where(and(
          eq(tournaments.id, id),
          eq(tournaments.status, 'draft')
        ))
        .returning();

      if (!updated) {
        return res.status(400).json({ message: "Tournament not found or already started" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error starting tournament:", error);
      res.status(500).json({ message: "Failed to start tournament" });
    }
  });

  // Seed playoffs for Round Robin + Playoffs tournament
  app.post('/api/tournaments/:id/seed-playoffs', isAuthenticated, loadUserPermissions, requireLeagueManagement, async (req: any, res) => {
    try {
      const { id } = req.params;

      // Get tournament
      const [tournament] = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, id));

      if (!tournament) {
        return res.status(404).json({ message: "Tournament not found" });
      }

      if (tournament.format !== 'round_robin_split') {
        return res.status(400).json({ message: "This endpoint is only for Round Robin + Playoffs tournaments" });
      }

      // Get all teams and matches
      const allTeams = await db
        .select()
        .from(tournamentTeams)
        .where(eq(tournamentTeams.tournamentId, id));

      const allMatches = await db
        .select()
        .from(tournamentMatches)
        .where(eq(tournamentMatches.tournamentId, id));

      // Get Round Robin matches
      const roundRobinMatches = allMatches.filter(m => m.round === 'Round Robin');

      // Validate that all Round Robin matches are completed
      if (roundRobinMatches.length === 0) {
        return res.status(400).json({ message: "No Round Robin matches found" });
      }

      const allRRCompleted = roundRobinMatches.every(m => m.status === 'completed');
      if (!allRRCompleted) {
        return res.status(400).json({ 
          message: "All Round Robin matches must be completed before seeding playoffs",
          completedMatches: roundRobinMatches.filter(m => m.status === 'completed').length,
          totalMatches: roundRobinMatches.length
        });
      }

      // Get playoff matches (sorted by match number for proper seeding)
      const playoffMatches = allMatches
        .filter(m => m.round !== 'Round Robin')
        .sort((a, b) => a.matchNumber - b.matchNumber);

      if (playoffMatches.length === 0) {
        return res.status(400).json({ message: "No playoff matches found" });
      }

      // Check if ANY playoff match (all rounds) is already seeded or in progress (prevent reseeding)
      const playoffsInProgress = playoffMatches.some(m => 
        m.team1Id !== null || m.team2Id !== null || m.status !== 'scheduled'
      );
      if (playoffsInProgress) {
        const seededMatches = playoffMatches.filter(m => m.team1Id !== null || m.team2Id !== null);
        return res.status(409).json({ 
          message: "Playoffs are already seeded or in progress. Cannot reseed once teams have been assigned or matches have started.",
          seededMatchCount: seededMatches.length,
          totalPlayoffMatches: playoffMatches.length,
          hint: "Delete and recreate the tournament if you need to change the seeding."
        });
      }

      // Calculate standings from completed Round Robin matches
      const { calculateStandings } = await import("./tournaments/bracketGenerator");
      const standings = calculateStandings(roundRobinMatches, allTeams);

      // Determine playoff teams (exclude lowest seed if odd number)
      let numPlayoffTeams = allTeams.length;
      if (numPlayoffTeams % 2 === 1) {
        numPlayoffTeams = allTeams.length - 1; // Exclude lowest seed
      }

      const playoffTeams = standings.slice(0, numPlayoffTeams);

      // Seed the first round of playoffs using standard tournament seeding
      // 1 vs numPlayoffTeams, 2 vs (numPlayoffTeams-1), etc.
      const firstRoundMatches = playoffMatches.filter(m => 
        m.round === playoffMatches[0].round // First playoff round
      );

      // Validate playoff bracket structure matches seeding expectations
      const expectedFirstRoundMatches = Math.floor(numPlayoffTeams / 2);
      if (firstRoundMatches.length !== expectedFirstRoundMatches) {
        return res.status(400).json({ 
          message: "Playoff bracket structure mismatch",
          expected: expectedFirstRoundMatches,
          actual: firstRoundMatches.length,
          hint: "The bracket may be corrupted. Please recreate the tournament."
        });
      }

      // Validate that we have the correct number of playoff teams for the bracket
      if (playoffTeams.length !== numPlayoffTeams) {
        return res.status(400).json({ 
          message: "Playoff team count mismatch",
          expected: numPlayoffTeams,
          actual: playoffTeams.length,
          hint: "Not enough teams qualified for playoffs based on standings. The tournament may need to be reconfigured."
        });
      }

      const updates = [];
      for (let i = 0; i < firstRoundMatches.length; i++) {
        const highSeed = i;
        const lowSeed = numPlayoffTeams - 1 - i;

        const match = firstRoundMatches[i];
        const team1Standing = playoffTeams[highSeed];
        const team2Standing = playoffTeams[lowSeed];

        if (team1Standing && team2Standing) {
          // Find the actual tournament team records by their ID (standings use tournament team ID)
          const team1 = allTeams.find(t => t.id === team1Standing.teamId);
          const team2 = allTeams.find(t => t.id === team2Standing.teamId);

          if (team1 && team2) {
            updates.push(
              db.update(tournamentMatches)
                .set({
                  team1Id: team1.id, // Tournament team ID from standings
                  team2Id: team2.id, // Tournament team ID from standings
                  notes: `Seed #${highSeed + 1} (${team1Standing.teamName}) vs Seed #${lowSeed + 1} (${team2Standing.teamName}) - Based on Round Robin standings`,
                  updatedAt: new Date()
                })
                .where(eq(tournamentMatches.id, match.id))
            );
          }
        }
      }

      // Execute all updates
      await Promise.all(updates);

      // Return updated matches
      const updatedMatches = await db
        .select()
        .from(tournamentMatches)
        .where(eq(tournamentMatches.tournamentId, id));

      res.json({ 
        success: true, 
        message: "Playoffs seeded successfully",
        standings,
        playoffTeams: playoffTeams.map((t, i) => ({ ...t, seed: i + 1 })),
        matches: updatedMatches
      });
    } catch (error) {
      console.error("Error seeding playoffs:", error);
      res.status(500).json({ message: "Failed to seed playoffs" });
    }
  });

  // Generate matches from custom bracket
  app.post('/api/tournaments/:id/generate-custom-matches', isAuthenticated, loadUserPermissions, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { bracketData } = req.body;
      const userId = req.user.claims.sub;

      // Validate inputs
      if (!bracketData || !bracketData.matchups || !Array.isArray(bracketData.matchups)) {
        return res.status(400).json({ message: "Invalid bracket data: matchups array is required" });
      }

      if (bracketData.matchups.length === 0) {
        return res.status(400).json({ message: "No matchups provided in bracket data" });
      }

      // Get tournament
      const [tournament] = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, id));

      if (!tournament) {
        return res.status(404).json({ message: "Tournament not found" });
      }

      if (tournament.format !== 'custom_bracket') {
        return res.status(400).json({ message: "This endpoint is only for custom bracket tournaments" });
      }

      // Check if user has commissioner/co-commissioner permissions for this tournament
      let hasPermission = tournament.createdBy === userId;
      
      if (!hasPermission && tournament.leagueId) {
        const user = await storage.getUser(userId);
        if (user) {
          const { canManageLeagueSpecific } = await import('./permissionMiddleware');
          hasPermission = await canManageLeagueSpecific(user as any, tournament.leagueId);
        }
      }

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied. Only league commissioners can generate tournament matches" });
      }

      // Get tournament teams
      const tournamentTeamsData = await db
        .select()
        .from(tournamentTeams)
        .where(eq(tournamentTeams.tournamentId, id));

      if (tournamentTeamsData.length === 0) {
        return res.status(400).json({ message: "No teams found for this tournament" });
      }

      // Validate all matchups have valid teams or winner references
      const { matchups } = bracketData;
      const errors: string[] = [];
      
      for (let i = 0; i < matchups.length; i++) {
        const matchup = matchups[i];
        
        if (!matchup.team1 || !matchup.team2) {
          errors.push(`Matchup ${i + 1} (${matchup.gameNumber || `Game ${i + 1}`}): Both teams must be assigned`);
          continue;
        }

        // Check if team1 is a winner reference or actual team
        if (!matchup.team1.startsWith('winner:')) {
          const team1 = tournamentTeamsData.find((t: any) => t.teamName === matchup.team1);
          if (!team1) {
            errors.push(`Matchup ${i + 1}: Team "${matchup.team1}" not found in tournament`);
          }
        }

        // Check if team2 is a winner reference or actual team
        if (!matchup.team2.startsWith('winner:')) {
          const team2 = tournamentTeamsData.find((t: any) => t.teamName === matchup.team2);
          if (!team2) {
            errors.push(`Matchup ${i + 1}: Team "${matchup.team2}" not found in tournament`);
          }
        }
      }

      if (errors.length > 0) {
        return res.status(400).json({ 
          message: "Invalid matchup data", 
          errors 
        });
      }

      // Use a transaction to ensure atomic operation
      await db.transaction(async (tx) => {
        // Clear existing matches for this tournament
        await tx.delete(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));

        // Create matches from custom bracket
        const matchesToInsert = [];

        for (let i = 0; i < matchups.length; i++) {
          const matchup = matchups[i];
          
          // Handle team1 - could be actual team or winner/loser reference
          let team1Id = null;
          if (matchup.team1.startsWith('winner:') || matchup.team1.startsWith('loser:')) {
            // Leave as null - will be filled when the referenced match completes
            team1Id = null;
          } else {
            const team1 = tournamentTeamsData.find((t: any) => t.teamName === matchup.team1);
            team1Id = team1 ? team1.id : null;
          }

          // Handle team2 - could be actual team or winner/loser reference
          let team2Id = null;
          if (matchup.team2.startsWith('winner:') || matchup.team2.startsWith('loser:')) {
            // Leave as null - will be filled when the referenced match completes
            team2Id = null;
          } else {
            const team2 = tournamentTeamsData.find((t: any) => t.teamName === matchup.team2);
            team2Id = team2 ? team2.id : null;
          }

          matchesToInsert.push({
            tournamentId: id,
            matchNumber: i + 1,
            round: matchup.gameNumber || `Game ${i + 1}`,
            bracketType: matchup.type === 'losers' ? 'losers' : 'winners',
            team1Id,
            team2Id,
            team1Score: null,
            team2Score: null,
            winnerId: null,
            status: 'scheduled',
            scheduledTime: null,
            location: null,
            gameId: null, // Will be linked when match is scheduled with date/time
            advancesToMatchId: null, // Custom brackets don't use automatic advancement
            notes: null
          });
        }

        // Insert all matches
        await tx.insert(tournamentMatches).values(matchesToInsert);

        // Save bracket data to tournament settings
        const updatedSettings = {
          ...(tournament.settings as any || {}),
          customBracket: bracketData
        };

        await tx
          .update(tournaments)
          .set({ 
            settings: updatedSettings,
            updatedAt: new Date()
          })
          .where(eq(tournaments.id, id));
      });

      // Fetch the inserted matches to return
      const insertedMatches = await db
        .select()
        .from(tournamentMatches)
        .where(eq(tournamentMatches.tournamentId, id))
        .orderBy(tournamentMatches.matchNumber);

      res.json({ 
        success: true,
        message: `Successfully generated ${insertedMatches.length} match${insertedMatches.length !== 1 ? 'es' : ''} from custom bracket`,
        matchCount: insertedMatches.length,
        matches: insertedMatches
      });
    } catch (error) {
      console.error("Error generating custom matches:", error);
      res.status(500).json({ message: "Failed to generate matches from custom bracket", error: String(error) });
    }
  });

  // Delete tournament (draft only)
  app.delete('/api/tournaments/:id', isAuthenticated, loadUserPermissions, requireLeagueManagement, async (req: any, res) => {
    try {
      const { id } = req.params;

      // Only allow deleting draft tournaments
      const [tournament] = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, id));

      if (!tournament) {
        return res.status(404).json({ message: "Tournament not found" });
      }

      if (tournament.status !== 'draft') {
        return res.status(400).json({ message: "Cannot delete tournament after it has started" });
      }

      // Get all games associated with this tournament's matches
      const matchesWithGames = await db
        .select({ gameId: tournamentMatches.gameId })
        .from(tournamentMatches)
        .where(eq(tournamentMatches.tournamentId, id));

      const gameIds = matchesWithGames.map(m => m.gameId).filter((id): id is string => id !== null);

      // IMPORTANT: Delete in correct order to respect foreign key constraints
      // 1. Delete tournament_matches first (they reference games)
      await db.delete(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
      
      // 2. Now delete the games (no longer referenced by tournament_matches)
      if (gameIds.length > 0) {
        await db.delete(games).where(inArray(games.id, gameIds));
      }

      // 3. Delete other related data (must delete participants before teams due to FK)
      await db.delete(tournamentParticipants).where(eq(tournamentParticipants.tournamentId, id));
      await db.delete(tournamentTeams).where(eq(tournamentTeams.tournamentId, id));
      await db.delete(tournamentStats).where(eq(tournamentStats.tournamentId, id));
      
      // 4. Finally delete the tournament itself
      await db.delete(tournaments).where(eq(tournaments.id, id));

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting tournament:", error);
      res.status(500).json({ message: "Failed to delete tournament" });
    }
  });

  // Import tournament players from CSV
  app.post('/api/tournaments/:tournamentId/players/import', isAuthenticated, (req: any, res, next) => {
    upload.single('playerFile')(req, res, (err) => {
      if (err) {
        console.error('Multer error:', err);
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: 'File size exceeds 5MB limit' });
          }
          return res.status(400).json({ message: err.message });
        }
        return res.status(400).json({ message: err.message || 'File upload error' });
      }
      next();
    });
  }, async (req: any, res) => {
    try {
      const tournamentId = req.params.tournamentId;
      const userId = req.user.claims.sub;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      // Get tournament and verify access
      const [tournament] = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, tournamentId));

      if (!tournament) {
        return res.status(404).json({ message: 'Tournament not found' });
      }

      // Check permissions
      let hasPermission = false;
      
      if (tournament.type === 'standalone') {
        // For standalone tournaments, check if user is the creator
        hasPermission = tournament.createdBy === userId;
      } else if (tournament.type === 'season_playoff' && tournament.leagueId) {
        // For league tournaments, check league management permissions
        // Load user data first
        const user = await storage.getUser(userId);
        if (user) {
          const { canManageLeagueSpecific } = await import('./permissionMiddleware');
          hasPermission = await canManageLeagueSpecific(user, tournament.leagueId);
        }
      }

      if (!hasPermission) {
        return res.status(403).json({ message: 'Only tournament creators or league commissioners can import players' });
      }

      // Read and parse the CSV file
      let fileContent = fs.readFileSync(file.path, 'utf8');
      
      // Skip first 3 instruction lines if they exist
      const lines = fileContent.split('\n');
      if (lines.length > 3 && lines[0].toUpperCase().includes('INSTRUCTION')) {
        fileContent = lines.slice(3).join('\n');
      }
      
      const parseResults = Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => {
          const normalized = header.toLowerCase().trim().replace(/\*/g, '');
          const mapping: Record<string, string> = {
            // Player name fields
            'player full name': 'fullName',
            'full name': 'fullName',
            'name': 'fullName',
            'player': 'fullName',
            'player name': 'fullName',
            // Team fields
            'team': 'teamName',
            'team name': 'teamName',
            // Contact fields
            'email': 'email',
            'phone': 'phoneNumber',
            'phone number': 'phoneNumber',
            // Jersey and position
            'jersey #': 'jerseyNumber',
            'jersey number': 'jerseyNumber',
            'jersey': 'jerseyNumber',
            'position': 'position',
            // Skill level
            'skill level': 'skillLevel',
            'skill rating': 'skillLevel',
            'rating': 'skillLevel',
            // Player type (goalie/skater)
            'player type': 'playerType',
            'type': 'playerType',
            'role': 'playerType',
            // Legacy support
            'first name': 'firstName',
            'firstname': 'firstName',
            'last name': 'lastName',
            'lastname': 'lastName',
            'notes': 'notes'
          };
          return mapping[normalized] || header;
        }
      });

      if (parseResults.errors.length > 0) {
        return res.status(400).json({ 
          message: 'Error parsing CSV file', 
          errors: parseResults.errors 
        });
      }

      // Get existing tournament teams
      const existingTeams = await db
        .select()
        .from(tournamentTeams)
        .where(eq(tournamentTeams.tournamentId, tournamentId));
      
      const teamLookup = new Map<string, string>();
      existingTeams.forEach(team => {
        teamLookup.set(team.teamName.toLowerCase().trim(), team.id);
      });

      // Helper functions
      const isValidEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
      };

      const parseFullName = (fullName: string): { firstName: string; lastName: string } => {
        const trimmed = fullName.trim();
        if (trimmed.includes(',')) {
          const parts = trimmed.split(',').map(p => p.trim());
          return { lastName: parts[0] || '', firstName: parts.slice(1).join(' ') || '' };
        }
        const nameParts = trimmed.split(/\s+/);
        if (nameParts.length === 0) return { firstName: '', lastName: '' };
        if (nameParts.length === 1) return { firstName: nameParts[0], lastName: '' };
        return { firstName: nameParts.slice(0, -1).join(' '), lastName: nameParts[nameParts.length - 1] };
      };

      const normalizePlayerType = (type: string | null | undefined): boolean => {
        if (!type) return false;
        const normalized = type.toLowerCase().trim();
        return normalized === 'goalie' || normalized === 'g';
      };

      // Process data
      const teamsToCreate: Set<string> = new Set();
      const playersToImport: any[] = [];
      const errors: string[] = [];

      parseResults.data.forEach((row: any, index: number) => {
        if (!row.fullName?.trim() && !row.firstName?.trim()) return;

        let firstName = '';
        let lastName = '';
        
        if (row.fullName) {
          const parsed = parseFullName(row.fullName);
          firstName = parsed.firstName;
          lastName = parsed.lastName;
        } else {
          firstName = row.firstName?.trim() || '';
          lastName = row.lastName?.trim() || '';
        }

        if (!firstName) {
          errors.push(`Row ${index + 1}: Player Full Name is required but missing`);
          return;
        }

        const email = row.email?.trim() || null;
        if (email && !isValidEmail(email)) {
          errors.push(`Row ${index + 1}: Invalid email "${email}"`);
          return;
        }

        const teamName = row.teamName?.trim();
        if (!teamName) {
          errors.push(`Row ${index + 1}: Missing team name for ${firstName} ${lastName}`);
          return;
        }

        // Parse jersey number
        let jerseyNumber = null;
        if (row.jerseyNumber) {
          const parsed = parseInt(row.jerseyNumber.toString().trim());
          if (!isNaN(parsed)) {
            jerseyNumber = parsed;
          }
        }

        // Normalize player type (Skater or Goalie)
        const isGoalie = normalizePlayerType(row.playerType);

        // Track teams that need to be created
        const teamKey = teamName.toLowerCase().trim();
        if (!teamLookup.has(teamKey)) {
          teamsToCreate.add(teamName);
        }

        playersToImport.push({
          firstName,
          lastName,
          email,
          teamName,
          jerseyNumber,
          position: row.position?.trim() || null,
          skillLevel: row.skillLevel?.trim() || null,
          phoneNumber: row.phoneNumber?.trim() || null,
          notes: row.notes?.trim() || null,
          isGoalie
        });
      });

      // Check if tournament is paid and if adding new teams requires additional payment
      if (tournament.type === 'standalone' && tournament.paymentStatus === 'paid' && teamsToCreate.size > 0) {
        const currentTeamCount = existingTeams.length;
        const paidTeamCount = tournament.paidTeamCount || 0;
        const newTeamCount = teamsToCreate.size;
        const totalTeamsAfterImport = currentTeamCount + newTeamCount;
        
        // Check if we're adding more teams than what's been paid for
        if (totalTeamsAfterImport > paidTeamCount) {
          const additionalTeamsNeeded = totalTeamsAfterImport - paidTeamCount;
          const additionalFee = additionalTeamsNeeded * 1000; // $10 per team in cents
          
          // Clean up uploaded file
          if (file.path) {
            try {
              fs.unlinkSync(file.path);
            } catch (e) {}
          }
          
          return res.status(402).json({ 
            message: 'Additional payment required',
            additionalTeamsCount: additionalTeamsNeeded,
            additionalFee: additionalFee,
            requiresPayment: true,
            newTeamsDetected: Array.from(teamsToCreate)
          });
        }
      }

      // Create missing teams with auto-incrementing seeds
      // Assign one seed per unique team (not per player)
      const currentMaxSeed = existingTeams.length > 0 
        ? Math.max(...existingTeams.map(t => t.seed || 0))
        : 0;
      const teamSeedMap = new Map<string, number>();
      let nextSeed = currentMaxSeed + 1;
      
      for (const teamName of teamsToCreate) {
        const teamKey = teamName.toLowerCase().trim();
        
        // Assign seed once per unique team
        if (!teamSeedMap.has(teamKey)) {
          teamSeedMap.set(teamKey, nextSeed++);
        }
        
        const [newTeam] = await db
          .insert(tournamentTeams)
          .values({
            tournamentId,
            teamName,
            seed: teamSeedMap.get(teamKey)!
          })
          .returning();
        
        teamLookup.set(teamKey, newTeam.id);
      }

      // Import players
      let successCount = 0;
      let placeholderCount = 0;

      for (const player of playersToImport) {
        const tournamentTeamId = teamLookup.get(player.teamName.toLowerCase().trim());
        if (!tournamentTeamId) continue;

        // Check if user exists
        let user = player.email ? await storage.getUserByEmail(player.email) : null;
        let userId: string;

        if (user) {
          // User exists - check if already a participant
          const [existing] = await db
            .select()
            .from(tournamentParticipants)
            .where(and(
              eq(tournamentParticipants.tournamentId, tournamentId),
              eq(tournamentParticipants.userId, user.id)
            ));

          if (existing) {
            // Update team assignment
            await db
              .update(tournamentParticipants)
              .set({ tournamentTeamId })
              .where(eq(tournamentParticipants.id, existing.id));
          } else {
            // Create new participant
            await db
              .insert(tournamentParticipants)
              .values({
                tournamentId,
                userId: user.id,
                tournamentTeamId,
                role: player.isGoalie ? 'player' : 'player',
                status: 'approved',
                expiresAt: tournament.accessEndDate || null
              });
          }
          successCount++;
        } else {
          // Create or find placeholder user account with imported player data
          try {
            let userId: string;
            const normalizedFirstName = player.firstName.toLowerCase().trim();
            const normalizedLastName = player.lastName.toLowerCase().trim();
            
            // First, check if a participant with this name + team already exists in this tournament
            // This prevents duplicates when email is missing
            const existingParticipantsWithName = await db
              .select({
                participantId: tournamentParticipants.id,
                userId: tournamentParticipants.userId,
                user: users
              })
              .from(tournamentParticipants)
              .innerJoin(users, eq(tournamentParticipants.userId, users.id))
              .where(and(
                eq(tournamentParticipants.tournamentId, tournamentId),
                eq(tournamentParticipants.tournamentTeamId, tournamentTeamId),
                sql`LOWER(TRIM(${users.firstName})) = ${normalizedFirstName}`,
                sql`LOWER(TRIM(${users.lastName})) = ${normalizedLastName}`
              ));

            if (existingParticipantsWithName.length > 0) {
              // Participant with this name already exists on this team - skip
              continue;
            }
            
            if (player.email) {
              // Case-insensitive email lookup
              const normalizedEmail = player.email.toLowerCase().trim();
              const [existingUser] = await db
                .select()
                .from(users)
                .where(sql`LOWER(TRIM(${users.email})) = ${normalizedEmail}`);

              if (existingUser) {
                userId = existingUser.id;
              } else {
                // Create new user with email
                const [newUser] = await db
                  .insert(users)
                  .values({
                    firstName: player.firstName,
                    lastName: player.lastName,
                    email: normalizedEmail,
                    role: 'free_tier'
                  })
                  .returning();
                userId = newUser.id;
                placeholderCount++;
              }
            } else {
              // No email - try to find existing user by name
              const [existingUserByName] = await db
                .select()
                .from(users)
                .where(and(
                  sql`LOWER(TRIM(${users.firstName})) = ${normalizedFirstName}`,
                  sql`LOWER(TRIM(${users.lastName})) = ${normalizedLastName}`
                ))
                .limit(1);

              if (existingUserByName) {
                userId = existingUserByName.id;
              } else {
                // Create placeholder with generated email
                const placeholderEmail = `placeholder_${normalizedFirstName}_${normalizedLastName}_${Date.now()}@pending.local`;
                const [newUser] = await db
                  .insert(users)
                  .values({
                    firstName: player.firstName,
                    lastName: player.lastName,
                    email: placeholderEmail,
                    role: 'free_tier'
                  })
                  .returning();
                userId = newUser.id;
                placeholderCount++;
              }
            }

            // Check if participant already exists for this tournament (by userId)
            const [existingParticipant] = await db
              .select()
              .from(tournamentParticipants)
              .where(and(
                eq(tournamentParticipants.tournamentId, tournamentId),
                eq(tournamentParticipants.userId, userId)
              ));

            if (existingParticipant) {
              // Update team assignment if different
              if (existingParticipant.tournamentTeamId !== tournamentTeamId) {
                await db
                  .update(tournamentParticipants)
                  .set({ tournamentTeamId })
                  .where(eq(tournamentParticipants.id, existingParticipant.id));
              }
            } else {
              // Create new tournament participant
              await db
                .insert(tournamentParticipants)
                .values({
                  tournamentId,
                  userId,
                  tournamentTeamId,
                  role: 'player',
                  status: 'approved',
                  expiresAt: tournament.accessEndDate || null
                });
            }

            successCount++;
          } catch (error) {
            console.error(`Error creating placeholder for ${player.firstName} ${player.lastName}:`, error);
            errors.push(`Failed to create user for ${player.firstName} ${player.lastName}`);
          }
        }
      }

      // Update payment amount for standalone tournaments ($10 per team)
      if (tournament.type === 'standalone') {
        const totalTeams = await db
          .select({ count: sql<number>`count(*)` })
          .from(tournamentTeams)
          .where(eq(tournamentTeams.tournamentId, tournamentId));
        
        const teamCount = Number(totalTeams[0]?.count || 0);
        const paymentAmount = teamCount * 500; // $5 per team = 500 cents
        
        await db
          .update(tournaments)
          .set({ paymentAmount })
          .where(eq(tournaments.id, tournamentId));
        
      }

      // Clean up file
      if (req.file?.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          console.error('Error cleaning up file:', cleanupError);
        }
      }

      res.json({
        success: true,
        message: `Imported ${successCount} players (${placeholderCount} placeholders)`,
        successCount,
        placeholderCount,
        teamsCreated: teamsToCreate.size,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      console.error("Error importing tournament players:", error);
      
      // Clean up file
      if (req.file?.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          console.error('Error cleaning up file:', cleanupError);
        }
      }
      
      res.status(500).json({ message: 'Failed to import players' });
    }
  });

  // Search tournament by unique ID
  app.get('/api/tournaments/search/:uniqueTournamentId', isAuthenticated, async (req: any, res) => {
    try {
      const { uniqueTournamentId } = req.params;
      
      const [tournament] = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.uniqueTournamentId, uniqueTournamentId.toUpperCase()));
      
      if (!tournament) {
        return res.status(404).json({ message: "Tournament not found" });
      }

      // Get team count
      const teamCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(tournamentTeams)
        .where(eq(tournamentTeams.tournamentId, tournament.id));
      
      // Get league info
      const [league] = await db
        .select()
        .from(leagues)
        .where(eq(leagues.id, tournament.leagueId));

      res.json({
        ...tournament,
        teamCount: Number(teamCount[0]?.count || 0),
        leagueName: league?.name,
        sport: league?.sport
      });
    } catch (error) {
      console.error("Error searching tournament:", error);
      res.status(500).json({ message: "Failed to search tournament" });
    }
  });

  // Request to join tournament
  app.post('/api/tournaments/:tournamentId/join', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tournamentId } = req.params;
      const { message } = req.body;

      // Validate tournament exists
      const [tournament] = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, tournamentId));

      if (!tournament) {
        return res.status(404).json({ message: "Tournament not found" });
      }

      // Check if user is already a participant
      const [existingParticipant] = await db
        .select()
        .from(tournamentParticipants)
        .where(and(
          eq(tournamentParticipants.tournamentId, tournamentId),
          eq(tournamentParticipants.userId, userId)
        ));

      if (existingParticipant) {
        if (existingParticipant.status === 'approved') {
          return res.status(400).json({ message: "You are already a participant in this tournament" });
        }
        if (existingParticipant.status === 'pending') {
          return res.status(400).json({ message: "You already have a pending request for this tournament" });
        }
        // If rejected or expired, allow re-request by updating status
        const [updated] = await db
          .update(tournamentParticipants)
          .set({
            status: 'pending',
            message: message || null,
            joinedAt: new Date()
          })
          .where(eq(tournamentParticipants.id, existingParticipant.id))
          .returning();

        return res.json(updated);
      }

      // Create new participant request
      const [participant] = await db
        .insert(tournamentParticipants)
        .values({
          tournamentId,
          userId,
          role: 'player',
          status: 'pending',
          message: message || null,
          expiresAt: tournament.accessEndDate || null
        })
        .returning();

      res.status(201).json(participant);
    } catch (error) {
      console.error("Error joining tournament:", error);
      res.status(500).json({ message: "Failed to join tournament" });
    }
  });

  // Get current user's participation status for a tournament
  app.get('/api/tournaments/:tournamentId/my-participation', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tournamentId } = req.params;

      const [participant] = await db
        .select()
        .from(tournamentParticipants)
        .where(and(
          eq(tournamentParticipants.tournamentId, tournamentId),
          eq(tournamentParticipants.userId, userId)
        ));

      if (!participant) {
        return res.status(404).json({ message: "No participation record found" });
      }

      res.json(participant);
    } catch (error) {
      console.error("Error fetching participation:", error);
      res.status(500).json({ message: "Failed to fetch participation status" });
    }
  });

  // Get tournament standings (calculated from matches)
  app.get('/api/tournaments/:tournamentId/standings', async (req: any, res) => {
    try {
      const { tournamentId } = req.params;

      // Get all teams in this tournament
      const teams = await db
        .select()
        .from(tournamentTeams)
        .where(eq(tournamentTeams.tournamentId, tournamentId));

      // Get all completed matches
      const matches = await db
        .select()
        .from(tournamentMatches)
        .where(and(
          eq(tournamentMatches.tournamentId, tournamentId),
          eq(tournamentMatches.status, 'completed')
        ));

      // Calculate standings for each team
      // Note: matches reference league team IDs via team1Id/team2Id, or tournament team IDs
      // We need to match against both team.id (tournament team) and team.teamId (linked league team)
      const standings = teams.map(team => {
        let wins = 0;
        let losses = 0;
        let ties = 0;
        let goalsFor = 0;
        let goalsAgainst = 0;
        
        // Match IDs can reference either league team ID or tournament team ID
        const matchIds = [team.id, team.teamId].filter(Boolean);

        matches.forEach(match => {
          const isTeam1 = matchIds.includes(match.team1Id);
          const isTeam2 = matchIds.includes(match.team2Id);
          
          if (isTeam1 || isTeam2) {
            const teamScore = isTeam1 ? match.team1Score : match.team2Score;
            const opponentScore = isTeam1 ? match.team2Score : match.team1Score;

            if (teamScore !== null && opponentScore !== null) {
              goalsFor += teamScore;
              goalsAgainst += opponentScore;

              if (matchIds.includes(match.winnerId)) {
                wins++;
              } else if (match.winnerId && !matchIds.includes(match.winnerId)) {
                losses++;
              } else {
                ties++;
              }
            }
          }
        });

        const points = (wins * 2) + ties;
        const goalDifferential = goalsFor - goalsAgainst;

        return {
          teamId: team.id,
          teamName: team.teamName,
          wins,
          losses,
          ties,
          goalsFor,
          goalsAgainst,
          goalDifferential,
          points
        };
      });

      // Sort by points, then goal differential
      standings.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return b.goalDifferential - a.goalDifferential;
      });

      res.json(standings);
    } catch (error) {
      console.error("Error fetching tournament standings:", error);
      res.status(500).json({ message: "Failed to fetch tournament standings" });
    }
  });

  // Get tournament stats for all players
  app.get('/api/tournaments/:tournamentId/stats', async (req: any, res) => {
    try {
      const { tournamentId } = req.params;

      const stats = await db
        .select({
          id: tournamentStats.id,
          tournamentId: tournamentStats.tournamentId,
          userId: tournamentStats.userId,
          teamId: tournamentStats.teamId,
          gamesPlayed: tournamentStats.gamesPlayed,
          goals: tournamentStats.goals,
          assists: tournamentStats.assists,
          points: tournamentStats.points,
          penaltyMinutes: tournamentStats.penaltyMinutes,
          user: {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            profileImageUrl: users.profileImageUrl
          }
        })
        .from(tournamentStats)
        .innerJoin(users, eq(tournamentStats.userId, users.id))
        .where(eq(tournamentStats.tournamentId, tournamentId));

      res.json(stats);
    } catch (error) {
      console.error("Error fetching tournament stats:", error);
      res.status(500).json({ message: "Failed to fetch tournament stats" });
    }
  });

  // Update tournament team (name, logo) - commissioner or captain only
  app.patch('/api/tournament-teams/:teamId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { teamId } = req.params;
      const { teamName, logoUrl } = req.body;

      // Get the tournament team
      const [team] = await db
        .select()
        .from(tournamentTeams)
        .where(eq(tournamentTeams.id, teamId));

      if (!team) {
        return res.status(404).json({ message: "Tournament team not found" });
      }

      // Check if user is commissioner or team captain
      const [tournament] = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, team.tournamentId));

      if (!tournament) {
        return res.status(404).json({ message: "Tournament not found" });
      }

      // Check commissioner access - via league commissioner/co-commissioner OR tournament creator
      let isCommissioner = tournament.createdBy === userId;
      
      // For league-based tournaments, check if user can manage the league (commissioner or co-commissioner)
      if (!isCommissioner && tournament.leagueId) {
        const user = await storage.getUser(userId);
        if (user) {
          const { canManageLeagueSpecific } = await import('./permissionMiddleware');
          isCommissioner = await canManageLeagueSpecific(user as any, tournament.leagueId);
        }
      }
      
      // Check captain access - either via linked league team OR tournament participant captain
      let isCaptain = false;
      
      // First check linked league team captain (for league-based tournaments)
      if (team.teamId) {
        const [linkedTeam] = await db
          .select()
          .from(teams)
          .where(eq(teams.id, team.teamId));
        isCaptain = linkedTeam?.captainId === userId;
      }
      
      // For standalone tournaments (no linked team), check tournament participant captain
      if (!isCaptain && !team.teamId) {
        const [captainParticipant] = await db
          .select()
          .from(tournamentParticipants)
          .where(and(
            eq(tournamentParticipants.tournamentId, tournament.id),
            eq(tournamentParticipants.userId, userId),
            eq(tournamentParticipants.tournamentTeamId, team.id),
            eq(tournamentParticipants.role, 'captain'),
            eq(tournamentParticipants.status, 'approved')
          ));
        isCaptain = !!captainParticipant;
      }

      if (!isCommissioner && !isCaptain) {
        return res.status(403).json({ message: "Only the commissioner or team captain can update this team" });
      }

      // Build update object
      const updateData: any = {};
      if (teamName !== undefined) updateData.teamName = teamName;
      if (logoUrl !== undefined) updateData.logoUrl = logoUrl;

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      const [updated] = await db
        .update(tournamentTeams)
        .set(updateData)
        .where(eq(tournamentTeams.id, teamId))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("Error updating tournament team:", error);
      res.status(500).json({ message: "Failed to update tournament team" });
    }
  });

  // Get team members for a tournament team
  app.get('/api/tournaments/:tournamentId/teams/:teamId/members', async (req: any, res) => {
    try {
      const { tournamentId, teamId } = req.params;

      // Get participants assigned to this team
      const members = await db
        .select({
          id: tournamentParticipants.id,
          userId: tournamentParticipants.userId,
          role: tournamentParticipants.role,
          status: tournamentParticipants.status,
          user: {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            profileImageUrl: users.profileImageUrl
          }
        })
        .from(tournamentParticipants)
        .innerJoin(users, eq(tournamentParticipants.userId, users.id))
        .where(and(
          eq(tournamentParticipants.tournamentId, tournamentId),
          eq(tournamentParticipants.tournamentTeamId, teamId),
          eq(tournamentParticipants.status, 'approved')
        ));

      res.json(members);
    } catch (error) {
      console.error("Error fetching tournament team members:", error);
      res.status(500).json({ message: "Failed to fetch tournament team members" });
    }
  });

  // Get pending participants for a tournament (commissioner only)
  app.get('/api/tournaments/:tournamentId/participants/pending', isAuthenticated, loadUserPermissions, requireLeagueManagement, async (req: any, res) => {
    try {
      const { tournamentId } = req.params;

      const participants = await db
        .select({
          participant: tournamentParticipants,
          user: users
        })
        .from(tournamentParticipants)
        .innerJoin(users, eq(tournamentParticipants.userId, users.id))
        .where(and(
          eq(tournamentParticipants.tournamentId, tournamentId),
          eq(tournamentParticipants.status, 'pending')
        ));

      res.json(participants.map(p => ({
        ...p.participant,
        user: {
          id: p.user.id,
          firstName: p.user.firstName,
          lastName: p.user.lastName,
          email: p.user.email
        }
      })));
    } catch (error) {
      console.error("Error fetching pending participants:", error);
      res.status(500).json({ message: "Failed to fetch pending participants" });
    }
  });

  // Approve participant (commissioner only)
  app.patch('/api/tournament-participants/:id/approve', isAuthenticated, loadUserPermissions, requireLeagueManagement, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id: participantId } = req.params;
      const { tournamentTeamId } = req.body;

      const [updated] = await db
        .update(tournamentParticipants)
        .set({
          status: 'approved',
          approvedBy: userId,
          approvedAt: new Date(),
          tournamentTeamId: tournamentTeamId || null
        })
        .where(eq(tournamentParticipants.id, participantId))
        .returning();

      if (!updated) {
        return res.status(404).json({ message: "Participant not found" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error approving participant:", error);
      res.status(500).json({ message: "Failed to approve participant" });
    }
  });

  // Reject participant (commissioner only)
  app.patch('/api/tournament-participants/:id/reject', isAuthenticated, loadUserPermissions, requireLeagueManagement, async (req: any, res) => {
    try {
      const { id: participantId } = req.params;

      const [updated] = await db
        .update(tournamentParticipants)
        .set({
          status: 'rejected'
        })
        .where(eq(tournamentParticipants.id, participantId))
        .returning();

      if (!updated) {
        return res.status(404).json({ message: "Participant not found" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error rejecting participant:", error);
      res.status(500).json({ message: "Failed to reject participant" });
    }
  });

  // Merge tournament participant (commissioner only)
  app.post('/api/tournaments/:tournamentId/merge-participant', isAuthenticated, loadUserPermissions, requireLeagueManagement, async (req: any, res) => {
    try {
      const { tournamentId } = req.params;
      const { fromUserId, toUserId } = req.body;
      const userId = req.user.claims.sub;

      // Validate input
      const mergeRequestSchema = z.object({
        fromUserId: z.string(),
        toUserId: z.string(),
      });

      const validatedData = mergeRequestSchema.parse({ fromUserId, toUserId });

      if (validatedData.fromUserId === validatedData.toUserId) {
        return res.status(400).json({ message: 'Cannot merge user with themselves' });
      }

      // Check tournament commissioner access
      const tournament = await storage.getTournament(tournamentId);
      if (!tournament) {
        return res.status(404).json({ message: 'Tournament not found' });
      }

      // Check if user is commissioner of the tournament's league
      const league = await storage.getLeague(tournament.leagueId);
      if (!league || league.commissionerId !== userId) {
        return res.status(403).json({ message: 'Unauthorized - only league commissioner can merge participants' });
      }

      // Verify both users exist
      const [fromUser, toUser] = await Promise.all([
        storage.getUserById(validatedData.fromUserId),
        storage.getUserById(validatedData.toUserId)
      ]);

      if (!fromUser) {
        return res.status(404).json({ message: 'Source user not found' });
      }

      if (!toUser) {
        return res.status(404).json({ message: 'Target user not found' });
      }

      // Perform the merge
      const mergedParticipant = await storage.mergeUsersInTournament(
        tournamentId,
        validatedData.fromUserId,
        validatedData.toUserId
      );

      res.json({
        message: 'Participants merged successfully',
        participant: mergedParticipant,
      });

    } catch (error) {
      console.error('Failed to merge tournament participants:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: 'Invalid request data', 
          errors: error.errors 
        });
      }
      res.status(500).json({ message: 'Failed to merge tournament participants' });
    }
  });

  // Team photo routes
  app.get("/api/team-photos/:teamId", isAuthenticated, async (req: any, res) => {
    try {
      const { teamId } = req.params;
      res.json([]);
    } catch (error) {
      console.error("Error fetching team photos:", error);
      res.json([]);
    }
  });

  app.post("/api/team-photos/upload", isAuthenticated, async (req: any, res) => {
    try {
      const { teamId } = req.body;
      if (!teamId) {
        return res.status(400).json({ error: "Team ID is required" });
      }
      res.json({ uploadURL: "", path: "" });
    } catch (error) {
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  app.post("/api/team-photos", isAuthenticated, async (req: any, res) => {
    try {
      res.json({ id: "", teamId: "", uploadedBy: "", fileUrl: "", fileName: "", fileSize: 0 });
    } catch (error) {
      res.status(500).json({ error: "Failed to create photo" });
    }
  });

  app.delete("/api/team-photos/:id", isAuthenticated, async (req: any, res) => {
    try {
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete photo" });
    }
  });

  // Start the unified event reminder job (games and scrimmages)
  startEventReminderJob();
  
  // Start the scrimmage invitation job (for recurring scrimmage invites)
  startScrimmageInviteJob();

  // Start the tournament access window job (emails on open, push 24h before close)
  startTournamentAccessJob();

  // IMPORTANT: Catch-all for unmatched API routes - must return JSON 404 instead of HTML
  // This prevents the static file handler from serving index.html for API routes
  app.all('/api/*', (req, res) => {
    res.status(404).json({ message: 'API endpoint not found', path: req.originalUrl });
  });

  return httpServer;
}
