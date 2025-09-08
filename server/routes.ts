import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import {
  insertLeagueSchema,
  insertTeamSchema,
  insertLeagueMembershipSchema,
  insertTeamMembershipSchema,
  insertGameSchema,
  insertMessageSchema,
} from "@shared/schema";
import Stripe from "stripe";
import multer from "multer";
import Papa from "papaparse";
import * as fs from 'fs';
import * as path from 'path';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-08-27.basil",
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

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

  app.patch('/api/auth/user/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { firstName, lastName, city, age, phoneNumber } = req.body;
      
      const profileData: any = {};
      if (firstName !== undefined) profileData.firstName = firstName;
      if (lastName !== undefined) profileData.lastName = lastName;
      if (city !== undefined) profileData.city = city;
      if (age !== undefined) profileData.age = parseInt(age);
      if (phoneNumber !== undefined) profileData.phoneNumber = phoneNumber;

      const user = await storage.updateUserProfile(userId, profileData);
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

  // Object storage routes for profile images  
  app.post("/api/profile-images/upload", isAuthenticated, async (req: any, res) => {
    try {
      const { ObjectStorageService } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getProfileImageUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting profile image upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // Serve profile images
  app.get("/profile-images/:objectPath(*)", async (req, res) => {
    try {
      const { ObjectStorageService, ObjectNotFoundError } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      const fullPath = `/profile-images/${req.params.objectPath}`;
      const objectFile = await objectStorageService.getProfileImageFile(fullPath);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving profile image:", error);
      if (error.name === 'ObjectNotFoundError') {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Team logo upload and serving routes
  app.post("/api/team-logos/upload", isAuthenticated, async (req: any, res) => {
    try {
      const { ObjectStorageService } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getTeamLogoUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting team logo upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // Serve team logos
  app.get("/team-logos/:objectPath(*)", async (req, res) => {
    try {
      const { ObjectStorageService, ObjectNotFoundError } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      const fullPath = `/team-logos/${req.params.objectPath}`;
      const objectFile = await objectStorageService.getTeamLogoFile(fullPath);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving team logo:", error);
      if (error.name === 'ObjectNotFoundError') {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
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
      res.json(leagues);
    } catch (error) {
      console.error("Error fetching leagues:", error);
      res.status(500).json({ message: "Failed to fetch leagues" });
    }
  });

  app.get("/api/leagues/commissioner", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || user.subscriptionTier !== 'commissioner') {
        return res.status(403).json({ message: "Commissioner access required" });
      }
      
      const leagues = await storage.getLeaguesByCommissioner(userId);
      res.json(leagues);
    } catch (error) {
      console.error("Error fetching commissioner leagues:", error);
      res.status(500).json({ message: "Failed to fetch leagues" });
    }
  });

  app.post("/api/leagues", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Check if user has commissioner tier
      if (!user || user.subscriptionTier !== 'commissioner') {
        return res.status(403).json({ message: "Commissioner tier required to create leagues" });
      }
      
      const leagueData = insertLeagueSchema.parse({
        ...req.body,
        commissionerId: userId
      });
      
      // Generate unique league ID if not provided
      if (!leagueData.uniqueLeagueId) {
        leagueData.uniqueLeagueId = `${leagueData.name.toLowerCase().replace(/\s+/g, '-')}-${Math.random().toString(36).substring(2, 8)}`;
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
      
      if (!user || user.subscriptionTier !== 'commissioner') {
        return res.status(403).json({ message: "Commissioner access required" });
      }
      
      // Verify that the user owns the league
      const league = await storage.getLeague(leagueId);
      if (!league || league.commissionerId !== userId) {
        return res.status(403).json({ message: "You can only edit your own leagues" });
      }
      
      const result = await storage.updateLeague(leagueId, req.body);
      res.json(result);
    } catch (error) {
      console.error("Error updating league:", error);
      res.status(500).json({ message: "Failed to update league" });
    }
  });

  app.get("/api/leagues/:id", async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.id);
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
      
      if (!user || user.subscriptionTier !== 'commissioner') {
        return res.status(403).json({ message: "Commissioner access required" });
      }
      
      // Verify that the user owns the league
      const league = await storage.getLeague(leagueId);
      if (!league || league.commissionerId !== userId) {
        return res.status(403).json({ message: "You can only delete your own leagues" });
      }
      
      await storage.deleteLeague(leagueId);
      res.json({ message: "League deleted successfully" });
    } catch (error) {
      console.error("Error deleting league:", error);
      res.status(500).json({ message: "Failed to delete league" });
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
      
      if (!user || user.subscriptionTier !== 'commissioner') {
        return res.status(403).json({ message: "Commissioner access required" });
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
      
      // Check if already a member
      const existingMembership = await storage.getUserLeagueMembership(userId, leagueId);
      if (existingMembership) {
        return res.status(400).json({ message: "Already requested or member" });
      }

      const membership = await storage.requestLeagueMembership({
        userId,
        leagueId,
      });
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
      if (!league || !user || (league.commissionerId !== userId && user.subscriptionTier !== 'commissioner')) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const updates = req.body;
      const updatedMember = await storage.updateLeagueMember(memberId, updates);
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
      if (!league || !user || (league.commissionerId !== userId && user.subscriptionTier !== 'commissioner')) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const members = await storage.getLeagueMembers(leagueId);
      res.json(members);
    } catch (error) {
      console.error("Error fetching league members:", error);
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
      if (!league || !user || (league.commissionerId !== userId && user.subscriptionTier !== 'commissioner')) {
        return res.status(403).json({ message: "Access denied" });
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
      
      if (!user || user.subscriptionTier !== 'commissioner') {
        return res.status(403).json({ message: "Commissioner access required" });
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
      
      if (!user || user.subscriptionTier !== 'commissioner') {
        return res.status(403).json({ message: "Commissioner access required" });
      }
      
      const membership = await storage.rejectLeagueMembership(membershipId, userId);
      res.json(membership);
    } catch (error) {
      console.error("Error rejecting membership:", error);
      res.status(500).json({ message: "Failed to reject membership" });
    }
  });

  app.patch("/api/league-memberships/:id/skill-rating", isAuthenticated, async (req: any, res) => {
    try {
      const membershipId = req.params.id;
      const { skillRating } = req.body;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || user.subscriptionTier !== 'commissioner') {
        return res.status(403).json({ message: "Commissioner access required" });
      }
      
      if (skillRating < 1 || skillRating > 10) {
        return res.status(400).json({ message: "Skill rating must be between 1 and 10" });
      }
      
      const membership = await storage.updatePlayerSkillRating(membershipId, skillRating);
      res.json(membership);
    } catch (error) {
      console.error("Error updating skill rating:", error);
      res.status(500).json({ message: "Failed to update skill rating" });
    }
  });

  app.delete("/api/league-memberships/:id", isAuthenticated, async (req: any, res) => {
    try {
      const membershipId = req.params.id;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || user.subscriptionTier !== 'commissioner') {
        return res.status(403).json({ message: "Commissioner access required" });
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
      res.json(games);
    } catch (error) {
      console.error("Error fetching league games:", error);
      res.status(500).json({ message: "Failed to fetch league games" });
    }
  });

  // Team routes
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
      const isCommissioner = user && user.subscriptionTier === 'commissioner';
      
      // Also check if user is a league member captain for this team's league
      let isLeagueMemberCaptain = false;
      if (team) {
        const leagueMemberships = await storage.getUserLeagueMemberships(userId);
        isLeagueMemberCaptain = leagueMemberships.some(membership => 
          membership.leagueId === team.leagueId && 
          membership.isCaptain === true &&
          membership.assignedTeamId === teamId
        );
      }
      
      if (!team || (!isTeamCaptain && !isLeagueMemberCaptain && !isCommissioner)) {
        return res.status(403).json({ message: "Only team captains and commissioners can update team logos" });
      }

      const updatedTeam = await storage.updateTeamLogo(teamId, logoUrl);
      res.json(updatedTeam);
    } catch (error) {
      console.error("Error updating team logo:", error);
      res.status(500).json({ message: "Failed to update team logo" });
    }
  });

  app.get("/api/teams/:id/members", async (req, res) => {
    try {
      const members = await storage.getTeamMembers(req.params.id);
      res.json(members);
    } catch (error) {
      console.error("Error fetching team members:", error);
      res.status(500).json({ message: "Failed to fetch team members" });
    }
  });

  app.get("/api/user/teams", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const teams = await storage.getUserTeams(userId);
      res.json(teams);
    } catch (error) {
      console.error("Error fetching user teams:", error);
      res.status(500).json({ message: "Failed to fetch teams" });
    }
  });

  // Game routes
  app.get("/api/user/games/upcoming", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const games = await storage.getUpcomingGames(userId);
      res.json(games);
    } catch (error) {
      console.error("Error fetching upcoming games:", error);
      res.status(500).json({ message: "Failed to fetch upcoming games" });
    }
  });

  app.post("/api/games", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user || user.subscriptionTier !== 'commissioner') {
        return res.status(403).json({ message: "Commissioner access required" });
      }
      
      const gameData = insertGameSchema.parse(req.body);
      const game = await storage.createGame(gameData);
      res.json(game);
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
      
      if (!user || user.subscriptionTier !== 'commissioner') {
        return res.status(403).json({ message: "Commissioner access required" });
      }

      // Verify that the game exists and the user has permission to edit it
      const existingGame = await storage.getGameById(gameId);
      if (!existingGame) {
        return res.status(404).json({ message: "Game not found" });
      }

      const updates = req.body;
      
      // Convert scheduledAt string to Date object if present
      if (updates.scheduledAt) {
        updates.scheduledAt = new Date(updates.scheduledAt);
      }
      
      const updatedGame = await storage.updateGame(gameId, updates);
      res.json(updatedGame);
    } catch (error) {
      console.error("Error updating game:", error);
      res.status(500).json({ message: "Failed to update game" });
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

  // Attendance routes
  app.post('/api/games/:gameId/check-in', isAuthenticated, async (req: any, res) => {
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

      const attendance = await storage.checkInToGame(gameId, userId, teamId);
      res.json(attendance);
    } catch (error) {
      console.error('Error checking in to game:', error);
      res.status(500).json({ message: 'Failed to check in' });
    }
  });

  app.post('/api/games/:gameId/check-out', isAuthenticated, async (req: any, res) => {
    try {
      const gameId = req.params.gameId;
      const userId = req.user.claims.sub;
      
      if (!userId) {
        return res.status(401).json({ message: 'User ID not found' });
      }

      const attendance = await storage.checkOutFromGame(gameId, userId);
      res.json(attendance);
    } catch (error) {
      console.error('Error checking out from game:', error);
      res.status(500).json({ message: 'Failed to check out' });
    }
  });

  app.get('/api/games/:gameId/attendance', isAuthenticated, async (req: any, res) => {
    try {
      const gameId = req.params.gameId;
      const attendance = await storage.getGameAttendance(gameId);
      res.json(attendance);
    } catch (error) {
      console.error('Error fetching game attendance:', error);
      res.status(500).json({ message: 'Failed to fetch attendance' });
    }
  });

  app.get('/api/games/attendance/captain-overview', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const captainOverview = await storage.getCaptainAttendanceOverview(userId);
      res.json(captainOverview);
    } catch (error) {
      console.error('Error fetching captain attendance overview:', error);
      res.status(500).json({ message: 'Failed to fetch attendance overview' });
    }
  });

  app.get('/api/user/attendance-statuses', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const statuses = await storage.getUserAttendanceStatuses(userId);
      res.json(statuses);
    } catch (error) {
      console.error('Error fetching user attendance statuses:', error);
      res.status(500).json({ message: 'Failed to fetch attendance statuses' });
    }
  });

  // Get specific game details
  app.get('/api/games/:gameId', isAuthenticated, async (req: any, res) => {
    try {
      const gameId = req.params.gameId;
      const game = await storage.getGameById(gameId);
      if (!game) {
        return res.status(404).json({ message: 'Game not found' });
      }
      res.json(game);
    } catch (error) {
      console.error('Error fetching game details:', error);
      res.status(500).json({ message: 'Failed to fetch game details' });
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

  // Message routes (Player Plus feature)
  app.get("/api/teams/:id/messages", isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (!user || user.subscriptionTier === "free") {
        return res.status(403).json({ message: "Upgrade to Player Plus required" });
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
      if (!user || user.subscriptionTier === "free") {
        return res.status(403).json({ message: "Upgrade to Player Plus required" });
      }

      const messageData = insertMessageSchema.parse(req.body);
      const message = await storage.sendMessage({
        ...messageData,
        senderId: req.user.claims.sub,
        teamId: req.params.id,
      });
      res.json(message);
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // Stripe subscription routes
  app.post('/api/create-subscription', isAuthenticated, async (req: any, res) => {
    const userId = req.user.claims.sub;
    let user = await storage.getUser(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.stripeSubscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      res.json({
        subscriptionId: subscription.id,
        clientSecret: (subscription.latest_invoice as any)?.payment_intent?.client_secret,
      });
      return;
    }
    
    if (!user.email) {
      return res.status(400).json({ message: 'Email required for subscription' });
    }

    try {
      let customer;
      if (user.stripeCustomerId) {
        customer = await stripe.customers.retrieve(user.stripeCustomerId);
      } else {
        customer = await stripe.customers.create({
          email: user.email,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        });
        user = await storage.updateUserStripeInfo(user.id, customer.id, '');
      }

      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{
          price: process.env.STRIPE_PRICE_ID || 'price_1234567890', // Placeholder price ID
        }],
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payment_intent'],
      });

      await storage.updateUserStripeInfo(user.id, customer.id, subscription.id);
      await storage.updateUserSubscription(user.id, 'player_plus');
  
      res.json({
        subscriptionId: subscription.id,
        clientSecret: (subscription.latest_invoice as any)?.payment_intent?.client_secret,
      });
    } catch (error: any) {
      console.error("Error creating subscription:", error);
      return res.status(400).json({ error: { message: error.message } });
    }
  });

  // Change subscription tier (free for testing)
  app.post('/api/change-tier', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tier } = req.body;

      if (!tier || !['free', 'player_plus', 'commissioner'].includes(tier)) {
        return res.status(400).json({ message: 'Invalid tier specified' });
      }

      await storage.updateUserSubscription(userId, tier);
      
      res.json({ 
        message: 'Subscription tier updated successfully',
        tier: tier 
      });
    } catch (error: any) {
      console.error("Error updating subscription tier:", error);
      return res.status(500).json({ message: "Failed to update subscription tier" });
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

  // Bulk Player Import Routes
  app.post('/api/leagues/:leagueId/players/import', isAuthenticated, upload.single('playerFile'), async (req: any, res) => {
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
      const fileContent = fs.readFileSync(file.path, 'utf8');
      const parseResults = Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => {
          // Normalize header names
          const normalized = header.toLowerCase().trim();
          const mapping: Record<string, string> = {
            'first name': 'firstName',
            'firstname': 'firstName',
            'last name': 'lastName', 
            'lastname': 'lastName',
            'email': 'email',
            'phone': 'phoneNumber',
            'phone number': 'phoneNumber',
            'position': 'position',
            'jersey number': 'jerseyNumber',
            'jersey': 'jerseyNumber',
            'team': 'teamName',
            'team name': 'teamName',
            'skill rating': 'skillRating',
            'rating': 'skillRating',
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

      parseResults.data.forEach((row: any, index: number) => {
        if (!row.firstName || !row.lastName) {
          errors.push(`Row ${index + 1}: First name and last name are required`);
          return;
        }

        const player = {
          firstName: row.firstName?.trim(),
          lastName: row.lastName?.trim(),
          email: row.email?.trim() || null,
          phoneNumber: row.phoneNumber?.trim() || null,
          position: row.position?.trim() || null,
          jerseyNumber: row.jerseyNumber ? parseInt(row.jerseyNumber) : null,
          skillRating: row.skillRating ? parseInt(row.skillRating) : 5,
          teamName: row.teamName?.trim() || null,
          teamId: null as string | null,
          notes: row.notes?.trim() || null
        };

        // Validate skill rating
        if (player.skillRating < 1 || player.skillRating > 10) {
          player.skillRating = 5;
        }

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
      for (const teamName of teamsToCreate) {
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

      // Create import record and imported players
      const importRecord = await storage.createPlayerImport({
        leagueId,
        importedBy: userId,
        fileName: file.originalname,
        totalRecords: parseResults.data.length,
        successfulRecords: validPlayers.length,
        failedRecords: errors.length
      });

      // Create imported player records with team assignments
      if (validPlayers.length > 0) {
        await storage.createImportedPlayersWithTeams(importRecord.id, leagueId, validPlayers);
      }

      // Clean up uploaded file
      fs.unlinkSync(file.path);

      res.json({
        importId: importRecord.id,
        totalRecords: parseResults.data.length,
        successfulRecords: validPlayers.length,
        failedRecords: errors.length,
        teamsCreated: createdTeams.size,
        errors
      });

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

  const httpServer = createServer(app);
  return httpServer;
}
