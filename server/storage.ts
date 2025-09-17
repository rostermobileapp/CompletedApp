import {
  users,
  leagues,
  seasons,
  teams,
  leagueMemberships,
  teamMemberships,
  games,
  gameScoreSubmissions,
  gameRsvps,
  substituteRequests,
  substitutionApprovals,
  messages,
  announcements,
  announcementReadStatus,
  announcementVisibility,
  announcementAttachments,
  announcementReactions,
  announcementPolls,
  announcementPollVotes,
  scrimmages,
  scrimmageRequests,
  playerImports,
  importedPlayers,
  playerMergeRequests,
  scheduleImports,
  importedSchedules,
  type User,
  type UpsertUser,
  type League,
  type InsertLeague,
  type Season,
  type InsertSeason,
  type Team,
  type InsertTeam,
  type LeagueMembership,
  type InsertLeagueMembership,
  type TeamMembership,
  type InsertTeamMembership,
  type Game,
  type InsertGame,
  type GameScoreSubmission,
  type InsertGameScoreSubmission,
  type GameRsvp,
  type InsertGameRsvp,
  type SubstituteRequest,
  type InsertSubstituteRequest,
  type SubstitutionApproval,
  type InsertSubstitutionApproval,
  type Message,
  type InsertMessage,
  type Announcement,
  type InsertAnnouncement,
  type AnnouncementAttachment,
  type InsertAnnouncementAttachment,
  type AnnouncementReaction,
  type InsertAnnouncementReaction,
  type AnnouncementPoll,
  type InsertAnnouncementPoll,
  type AnnouncementPollVote,
  type InsertAnnouncementPollVote,
  type Scrimmage,
  type InsertScrimmage,
  type ScrimmageRequest,
  type InsertScrimmageRequest,
  type PlayerImport,
  type InsertPlayerImport,
  type ImportedPlayer,
  type InsertImportedPlayer,
  type PlayerMergeRequest,
  type InsertPlayerMergeRequest,
  type ScheduleImport,
  type InsertScheduleImport,
  type ImportedSchedule,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, ilike, or, gte, lte, inArray, asc, isNull, not } from "drizzle-orm";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserProfile(id: string, profileData: Partial<Pick<User, 'firstName' | 'lastName' | 'city' | 'age' | 'phoneNumber'>>): Promise<User>;
  updateUserImage(id: string, profileImageUrl: string): Promise<User>;
  updateUserSubscription(id: string, tier: string): Promise<User>;
  updateUserStripeInfo(id: string, customerId: string, subscriptionId: string): Promise<User>;
  
  // League operations
  createLeague(league: InsertLeague): Promise<League>;
  getLeagues(sport?: string, search?: string): Promise<League[]>;
  getLeague(id: string): Promise<League | undefined>;
  getUserLeagues(userId: string): Promise<League[]>;
  getLeaguesByCommissioner(commissionerId: string): Promise<League[]>;
  getLeagueByUniqueId(uniqueLeagueId: string): Promise<League | undefined>;
  updateLeague(id: string, updates: Partial<League>): Promise<League>;
  deleteLeague(id: string): Promise<void>;

  // Season operations
  createSeason(season: InsertSeason): Promise<Season>;
  getSeasonsByLeague(leagueId: string): Promise<Season[]>;
  getSeason(id: string): Promise<Season | undefined>;
  updateSeason(id: string, updates: Partial<Season>): Promise<Season>;
  deleteSeason(id: string): Promise<void>;
  
  // Team operations
  createTeam(team: InsertTeam): Promise<Team>;
  getTeamsByLeague(leagueId: string): Promise<Team[]>;
  getTeam(id: string): Promise<Team | undefined>;
  getUserTeams(userId: string): Promise<Team[]>;
  updateTeamLogo(id: string, logoUrl: string): Promise<Team>;
  setTeamCaptain(teamId: string, captainId: string | null): Promise<Team>;
  
  // Membership operations
  requestLeagueMembership(membership: InsertLeagueMembership): Promise<LeagueMembership>;
  approveLeagueMembership(membershipId: string, approverId: string): Promise<LeagueMembership>;
  rejectLeagueMembership(membershipId: string, approverId: string): Promise<LeagueMembership>;
  getUserLeagueMembership(userId: string, leagueId: string): Promise<LeagueMembership | undefined>;
  getLeagueMembers(leagueId: string): Promise<(LeagueMembership & { user: User })[]>;
  getPendingLeagueMembers(leagueId: string): Promise<(LeagueMembership & { user: User })[]>;
  updatePlayerSkillRating(membershipId: string, skillRating: number): Promise<LeagueMembership>;
  deleteLeagueMembership(membershipId: string): Promise<void>;
  leaveLeague(userId: string, leagueId: string): Promise<void>;
  requestTeamMembership(membership: InsertTeamMembership): Promise<TeamMembership>;
  approveTeamMembership(membershipId: string, approverId: string): Promise<TeamMembership>;
  getTeamMembers(teamId: string): Promise<(TeamMembership & { user: User })[]>;
  
  // Game operations
  createGame(game: InsertGame): Promise<Game>;
  findExistingGame(leagueId: string, homeTeamId: string, awayTeamId: string, scheduledAt: Date): Promise<Game | null>;
  getUpcomingGames(userId: string): Promise<(Game & { homeTeam: Team; awayTeam: Team })[]>;
  getTeamGames(teamId: string): Promise<(Game & { homeTeam: Team; awayTeam: Team })[]>;
  getGamesByLeague(leagueId: string): Promise<(Game & { homeTeam: Team; awayTeam: Team })[]>;
  getGameById(gameId: string): Promise<(Game & { homeTeam: Team; awayTeam: Team }) | undefined>;
  claimBeverageDuty(gameId: string, userId: string, teamId: string): Promise<Game>;
  releaseBeverageDuty(gameId: string, userId: string, teamId: string): Promise<Game>;
  saveGameNotes(gameId: string, userId: string, teamId: string, notes: string): Promise<any>;
  deleteGame(id: string): Promise<void>;
  
  // RSVP operations
  createOrUpdateRsvp(rsvp: InsertGameRsvp): Promise<GameRsvp>;
  getGameRsvp(gameId: string, userId: string): Promise<GameRsvp | undefined>;
  getUserTeamRsvp(gameId: string, userId: string, teamId: string): Promise<GameRsvp | undefined>;
  getUserGameRsvps(gameId: string, userId: string): Promise<GameRsvp[]>;
  getGameRsvpSummary(gameId: string): Promise<{ attending: (GameRsvp & { user: User })[]; notAttending: (GameRsvp & { user: User })[]; noResponse: User[] }>;
  getTeamRsvpSummary(gameId: string, teamId: string): Promise<{ attending: (GameRsvp & { user: User })[]; notAttending: (GameRsvp & { user: User })[]; noResponse: User[] }>;
  getGameRsvpSummaryByTeams(gameId: string): Promise<{ homeTeam: { teamId: string; attending: (GameRsvp & { user: User })[]; notAttending: (GameRsvp & { user: User })[]; noResponse: User[] }; awayTeam: { teamId: string; attending: (GameRsvp & { user: User })[]; notAttending: (GameRsvp & { user: User })[]; noResponse: User[] } }>;
  getAvailablePlayers(date: Date, leagueId: string): Promise<User[]>;
  
  // Substitute request operations (enhanced for multi-level approval)
  createSubstituteRequest(request: InsertSubstituteRequest): Promise<SubstituteRequest>;
  getSubstituteRequests(options?: { status?: string; gameId?: string; userId?: string; requestingTeamId?: string; leagueIds?: string[] }): Promise<(SubstituteRequest & { game: Game & { homeTeam: Team; awayTeam: Team }; originalPlayer: User; substitutePlayer?: User; requestedByUser: User; requestingTeam?: Team; approvals: SubstitutionApproval[] })[]>;
  getSubstituteRequest(requestId: string): Promise<(SubstituteRequest & { game: Game & { homeTeam: Team; awayTeam: Team }; originalPlayer: User; substitutePlayer?: User; requestedByUser: User; requestingTeam?: Team; approvals: SubstitutionApproval[] }) | undefined>;
  expireSubstituteRequests(leagueIds?: string[]): Promise<SubstituteRequest[]>;
  
  // Controlled substitute request updates (SECURITY: No direct status updates allowed)
  updateSubstituteRequestNonStatusFields(requestId: string, updates: { reason?: string; expiresAt?: Date; substitutePlayerId?: string }): Promise<SubstituteRequest>;
  
  // Substitution approval operations
  createSubstitutionApproval(approval: InsertSubstitutionApproval): Promise<SubstitutionApproval>;
  getSubstitutionApprovals(requestId: string): Promise<(SubstitutionApproval & { approver: User })[]>;
  getUserPendingApprovals(userId: string, approverType?: 'opposing_captain' | 'commissioner' | 'substitute_player'): Promise<(SubstitutionApproval & { substitutionRequest: SubstituteRequest & { game: Game & { homeTeam: Team; awayTeam: Team }; originalPlayer: User; substitutePlayer?: User } })[]>;
  processApproval(requestId: string, approverId: string, approverType: 'opposing_captain' | 'commissioner' | 'substitute_player', status: 'approved' | 'denied', comments?: string): Promise<{ approval: SubstitutionApproval; updatedRequest: SubstituteRequest }>;
  
  
  // Message operations
  sendMessage(message: InsertMessage): Promise<Message>;
  getTeamMessages(teamId: string): Promise<(Message & { sender: User })[]>;
  getDirectMessages(userId1: string, userId2: string): Promise<(Message & { sender: User })[]>;

  // Announcement operations
  createAnnouncement(announcement: InsertAnnouncement): Promise<Announcement>;
  getLeagueAnnouncements(leagueId: string, options?: { limit?: number; offset?: number; orderBy?: string; orderDirection?: 'asc' | 'desc' }, userId?: string): Promise<{ announcements: (Announcement & { author: User; attachments: AnnouncementAttachment[]; reactions: (AnnouncementReaction & { user: User })[]; polls: (AnnouncementPoll & { votes: (AnnouncementPollVote & { user: User })[] })[] })[]; total: number }>;
  getAnnouncement(id: string): Promise<(Announcement & { author: User; attachments: AnnouncementAttachment[]; reactions: (AnnouncementReaction & { user: User })[]; polls: (AnnouncementPoll & { votes: (AnnouncementPollVote & { user: User })[] })[] }) | undefined>;
  updateAnnouncement(id: string, updates: Partial<Announcement>): Promise<Announcement>;
  deleteAnnouncement(id: string): Promise<void>;
  
  // Announcement attachment operations
  createAnnouncementAttachment(attachment: InsertAnnouncementAttachment): Promise<AnnouncementAttachment>;
  deleteAnnouncementAttachment(id: string): Promise<void>;
  
  // Announcement reaction operations
  addAnnouncementReaction(reaction: InsertAnnouncementReaction): Promise<AnnouncementReaction>;
  removeAnnouncementReaction(announcementId: string, userId: string, emoji: string): Promise<void>;
  
  // Announcement read status operations
  markAnnouncementAsRead(announcementId: string, userId: string): Promise<void>;
  getUnreadAnnouncementCount(leagueId: string, userId: string): Promise<number>;
  
  // Announcement poll operations
  createAnnouncementPoll(poll: InsertAnnouncementPoll): Promise<AnnouncementPoll>;
  voteOnPoll(vote: InsertAnnouncementPollVote): Promise<AnnouncementPollVote>;
  getPollResults(pollId: string): Promise<(AnnouncementPollVote & { user: User })[]>;
  
  // Announcement visibility operations (for targeted announcements)
  createAnnouncementVisibility(announcementId: string, userIds: string[]): Promise<void>;
  getAnnouncementVisibility(announcementId: string): Promise<string[]>;
  isAnnouncementVisibleToUser(announcementId: string, userId: string): Promise<boolean>;
  
  // Bulk import operations
  createPlayerImport(importData: InsertPlayerImport): Promise<PlayerImport>;
  createImportedPlayers(importId: string, leagueId: string, players: any[]): Promise<ImportedPlayer[]>;
  createImportedPlayersWithTeams(importId: string, leagueId: string, players: any[]): Promise<ImportedPlayer[]>;
  getPlayerImports(leagueId: string): Promise<PlayerImport[]>;
  getPlayerMergeRequests(leagueId: string): Promise<PlayerMergeRequest[]>;
  updateMergeRequestStatus(requestId: string, status: string, reviewerId: string): Promise<PlayerMergeRequest>;
  findPotentialMatches(leagueId: string, firstName: string, lastName: string): Promise<ImportedPlayer[]>;
  
  // Schedule import operations
  createScheduleImport(importData: InsertScheduleImport): Promise<ScheduleImport>;
  createImportedSchedules(importId: string, leagueId: string, schedules: any[]): Promise<ImportedSchedule[]>;
  getScheduleImports(leagueId: string): Promise<ScheduleImport[]>;
  getImportedSchedules(importId: string): Promise<ImportedSchedule[]>;

  // Scrimmage operations
  createScrimmage(scrimmageData: InsertScrimmage): Promise<Scrimmage>;
  getScrimmage(scrimmageId: string): Promise<Scrimmage | undefined>;
  getLeagueScrimmages(leagueId: string): Promise<(Scrimmage & { creator: User; requestCount: number })[]>;
  getUserScrimmages(userId: string): Promise<(Scrimmage & { creator: User; requestCount: number })[]>;
  updateScrimmage(scrimmageId: string, updates: Partial<InsertScrimmage>): Promise<Scrimmage>;
  deleteScrimmage(scrimmageId: string): Promise<void>;
  
  // Scrimmage request operations
  createScrimmageRequest(requestData: InsertScrimmageRequest): Promise<ScrimmageRequest>;
  getScrimmageRequests(scrimmageId: string): Promise<(ScrimmageRequest & { player: User })[]>;
  getScrimmageRequest(scrimmageId: string, playerId: string): Promise<ScrimmageRequest | undefined>;
  updateScrimmageRequestStatus(requestId: string, status: 'approved' | 'dismissed', timestamp?: Date): Promise<ScrimmageRequest>;
  deleteScrimmageRequest(requestId: string): Promise<void>;
  getScrimmageRequestsByPlayer(playerId: string): Promise<(ScrimmageRequest & { scrimmage: Scrimmage & { creator: User } })[]>;
  
  // Player merge operations
  mergeUsersInLeague(leagueId: string, fromUserId: string, toUserId: string, preserveName?: boolean): Promise<LeagueMembership>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async updateUserSubscription(id: string, tier: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ 
        subscriptionTier: tier as any,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserStripeInfo(id: string, customerId: string, subscriptionId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserProfile(id: string, profileData: Partial<Pick<User, 'firstName' | 'lastName' | 'city' | 'age' | 'phoneNumber'>>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        ...profileData,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserImage(id: string, profileImageUrl: string): Promise<User> {
    // Try to normalize the profile image path for local serving
    let normalizedUrl = profileImageUrl;
    try {
      const { ObjectStorageService } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      normalizedUrl = objectStorageService.normalizeProfileImagePath(profileImageUrl);
    } catch (error) {
      // If normalization fails, use original URL
      console.warn('Failed to normalize profile image path:', error);
    }
    
    const [user] = await db
      .update(users)
      .set({
        profileImageUrl: normalizedUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // League operations
  async createLeague(league: InsertLeague): Promise<League> {
    const [newLeague] = await db.insert(leagues).values(league).returning();
    return newLeague;
  }

  async getLeagues(sport?: string, search?: string): Promise<League[]> {
    let conditions: any[] = [];
    
    if (sport && sport !== "all") {
      conditions.push(eq(leagues.sport, sport as any));
    }
    
    if (search) {
      conditions.push(
        or(
          ilike(leagues.name, `%${search}%`),
          ilike(leagues.location, `%${search}%`)
        )
      );
    }
    
    if (conditions.length > 0) {
      return await db
        .select()
        .from(leagues)
        .where(and(...conditions))
        .orderBy(desc(leagues.createdAt));
    }
    
    return await db
      .select()
      .from(leagues)
      .orderBy(desc(leagues.createdAt));
  }

  async getLeague(id: string): Promise<League | undefined> {
    const [league] = await db.select().from(leagues).where(eq(leagues.id, id));
    return league;
  }

  async getUserLeagues(userId: string): Promise<League[]> {
    const result = await db
      .select({ league: leagues })
      .from(leagues)
      .innerJoin(leagueMemberships, eq(leagues.id, leagueMemberships.leagueId))
      .where(
        and(
          eq(leagueMemberships.userId, userId),
          eq(leagueMemberships.status, "approved")
        )
      );
    return result.map(r => r.league);
  }

  async getUserLeagueMemberships(userId: string): Promise<LeagueMembership[]> {
    const memberships = await db
      .select()
      .from(leagueMemberships)
      .where(
        and(
          eq(leagueMemberships.userId, userId),
          eq(leagueMemberships.status, "approved")
        )
      );
    
    return memberships;
  }

  async getLeaguesByCommissioner(commissionerId: string): Promise<League[]> {
    const result = await db
      .select()
      .from(leagues)
      .where(eq(leagues.commissionerId, commissionerId));
    return result;
  }

  async getCommissionerLeagues(userId: string): Promise<League[]> {
    return await db
      .select()
      .from(leagues)
      .where(eq(leagues.commissionerId, userId));
  }

  async getLeagueByUniqueId(uniqueLeagueId: string): Promise<League | undefined> {
    const [league] = await db.select().from(leagues).where(eq(leagues.uniqueLeagueId, uniqueLeagueId));
    return league;
  }

  async updateLeague(id: string, updates: Partial<League>): Promise<League> {
    const [league] = await db
      .update(leagues)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(leagues.id, id))
      .returning();
    return league;
  }

  async deleteLeague(id: string): Promise<void> {
    // TODO: Implement cascade deletion of related data (teams, games, memberships)
    await db.delete(leagues).where(eq(leagues.id, id));
  }

  // Season operations
  async createSeason(season: InsertSeason): Promise<Season> {
    const [newSeason] = await db
      .insert(seasons)
      .values(season)
      .returning();
    return newSeason;
  }

  async getSeasonsByLeague(leagueId: string): Promise<Season[]> {
    const result = await db
      .select()
      .from(seasons)
      .where(eq(seasons.leagueId, leagueId))
      .orderBy(desc(seasons.createdAt));
    return result;
  }

  async getSeason(id: string): Promise<Season | undefined> {
    const [season] = await db
      .select()
      .from(seasons)
      .where(eq(seasons.id, id));
    return season;
  }

  async updateSeason(id: string, updates: Partial<Season>): Promise<Season> {
    const [season] = await db
      .update(seasons)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(seasons.id, id))
      .returning();
    return season;
  }

  async deleteSeason(id: string): Promise<void> {
    // TODO: Implement cascade deletion of related data (teams, games)
    await db.delete(seasons).where(eq(seasons.id, id));
  }

  // Team operations
  async createTeam(team: InsertTeam): Promise<Team> {
    const [newTeam] = await db.insert(teams).values(team).returning();
    return newTeam;
  }

  async getTeamsByLeague(leagueId: string): Promise<Team[]> {
    return await db.select().from(teams).where(eq(teams.leagueId, leagueId));
  }

  async setTeamCaptain(teamId: string, captainId: string | null): Promise<Team> {
    const [team] = await db
      .update(teams)
      .set({ captainId })
      .where(eq(teams.id, teamId))
      .returning();
    return team;
  }

  async getTeam(id: string): Promise<Team | undefined> {
    const [team] = await db.select().from(teams).where(eq(teams.id, id));
    return team;
  }

  async getUserTeams(userId: string): Promise<Team[]> {
    // Get teams from direct team memberships (these take priority)
    const teamMembershipResult = await db
      .select({ team: teams })
      .from(teams)
      .innerJoin(teamMemberships, eq(teams.id, teamMemberships.teamId))
      .where(
        and(
          eq(teamMemberships.userId, userId),
          eq(teamMemberships.status, "approved")
        )
      );

    // If user has direct team memberships, use those exclusively
    if (teamMembershipResult.length > 0) {
      return teamMembershipResult.map(r => r.team);
    }

    // Fallback to teams from league memberships with assigned teams (only if no direct memberships)
    const leagueMembershipResult = await db
      .select({ team: teams })
      .from(teams)
      .innerJoin(leagueMemberships, eq(teams.id, leagueMemberships.assignedTeamId))
      .where(
        and(
          eq(leagueMemberships.userId, userId),
          eq(leagueMemberships.status, "approved")
        )
      );

    return leagueMembershipResult.map(r => r.team);
  }

  async updateTeamLogo(id: string, logoUrl: string): Promise<Team> {
    // Try to normalize the team logo path for local serving
    let normalizedUrl = logoUrl;
    try {
      const { ObjectStorageService } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      normalizedUrl = objectStorageService.normalizeTeamLogoPath(logoUrl);
    } catch (error) {
      // If normalization fails, use original URL
      console.warn('Failed to normalize team logo path:', error);
    }

    const [team] = await db
      .update(teams)
      .set({
        logoUrl: normalizedUrl,
        updatedAt: new Date(),
      })
      .where(eq(teams.id, id))
      .returning();
    return team;
  }

  // Membership operations
  async requestLeagueMembership(membership: InsertLeagueMembership): Promise<LeagueMembership> {
    const [newMembership] = await db.insert(leagueMemberships).values(membership).returning();
    return newMembership;
  }

  async approveLeagueMembership(membershipId: string, approverId: string): Promise<LeagueMembership> {
    return await db.transaction(async (tx) => {
      // First approve the membership
      const [membership] = await tx
        .update(leagueMemberships)
        .set({
          status: "approved",
          approvedAt: new Date(),
          approvedBy: approverId,
        })
        .where(eq(leagueMemberships.id, membershipId))
        .returning();

      // Check if this user was previously merged with an imported player in this league
      const [importedPlayer] = await tx
        .select()
        .from(importedPlayers)
        .where(
          and(
            eq(importedPlayers.leagueId, membership.leagueId),
            eq(importedPlayers.mergedWithUserId, membership.userId)
          )
        )
        .limit(1);

      // If found, auto-assign to the team from the imported player
      if (importedPlayer && (importedPlayer.teamId || importedPlayer.teamName)) {
        let team = null;
        
        // First try using teamId if available (more robust)
        if (importedPlayer.teamId) {
          const [teamById] = await tx
            .select()
            .from(teams)
            .where(eq(teams.id, importedPlayer.teamId))
            .limit(1);
          team = teamById;
        }
        
        // Fallback to team name if teamId lookup failed or wasn't available
        if (!team && importedPlayer.teamName) {
          const [teamByName] = await tx
            .select()
            .from(teams)
            .where(
              and(
                eq(teams.leagueId, membership.leagueId),
                eq(teams.name, importedPlayer.teamName)
              )
            )
            .limit(1);
          team = teamByName;
        }

        // If team exists, assign the user to it
        if (team) {
          await tx
            .update(leagueMemberships)
            .set({ assignedTeamId: team.id })
            .where(eq(leagueMemberships.id, membershipId));
          
          // Return the updated membership
          const [updatedMembership] = await tx
            .select()
            .from(leagueMemberships)
            .where(eq(leagueMemberships.id, membershipId))
            .limit(1);
          
          return updatedMembership;
        }
      }

      return membership;
    });
  }

  async getUserLeagueMembership(userId: string, leagueId: string): Promise<LeagueMembership | undefined> {
    const [membership] = await db
      .select()
      .from(leagueMemberships)
      .where(
        and(
          eq(leagueMemberships.userId, userId),
          eq(leagueMemberships.leagueId, leagueId)
        )
      );
    return membership;
  }

  async rejectLeagueMembership(membershipId: string, approverId: string): Promise<LeagueMembership> {
    const [membership] = await db
      .update(leagueMemberships)
      .set({
        status: "rejected",
        approvedAt: new Date(),
        approvedBy: approverId,
      })
      .where(eq(leagueMemberships.id, membershipId))
      .returning();
    return membership;
  }

  async updateLeagueMembershipStatus(membershipId: string, newStatus: 'pending' | 'approved' | 'rejected' | 'inactive'): Promise<LeagueMembership> {
    const [membership] = await db
      .update(leagueMemberships)
      .set({
        status: newStatus,
        // Reset approval fields when changing to pending
        ...(newStatus === 'pending' && {
          approvedAt: null,
          approvedBy: null
        })
      })
      .where(eq(leagueMemberships.id, membershipId))
      .returning();
    return membership;
  }

  async getLeagueMembers(leagueId: string): Promise<(LeagueMembership & { user: User })[]> {
    const result = await db
      .select()
      .from(leagueMemberships)
      .innerJoin(users, eq(leagueMemberships.userId, users.id))
      .where(
        and(
          eq(leagueMemberships.leagueId, leagueId),
          eq(leagueMemberships.status, "approved")
        )
      );
    return result.map(r => ({ ...r.league_memberships, user: r.users }));
  }

  async getPendingLeagueMembers(leagueId: string): Promise<(LeagueMembership & { user: User })[]> {
    const result = await db
      .select()
      .from(leagueMemberships)
      .innerJoin(users, eq(leagueMemberships.userId, users.id))
      .where(
        and(
          eq(leagueMemberships.leagueId, leagueId),
          eq(leagueMemberships.status, "pending")
        )
      );
    return result.map(r => ({ ...r.league_memberships, user: r.users }));
  }

  async updatePlayerSkillLevel(membershipId: string, skillLevel: string | null): Promise<LeagueMembership> {
    const [membership] = await db
      .update(leagueMemberships)
      .set({ skillLevel })
      .where(eq(leagueMemberships.id, membershipId))
      .returning();
    return membership;
  }

  async updatePlayerSkillRating(membershipId: string, skillRating: number): Promise<LeagueMembership> {
    const [membership] = await db
      .update(leagueMemberships)
      .set({ skillLevel: skillRating.toString() })
      .where(eq(leagueMemberships.id, membershipId))
      .returning();
    return membership;
  }

  // Helper method to batch lookup skill levels for users in a league
  private async fetchUserSkills(userIds: string[], leagueId: string): Promise<Map<string, string | null>> {
    if (userIds.length === 0) {
      return new Map();
    }

    const skillData = await db
      .select({
        userId: leagueMemberships.userId,
        skillLevel: leagueMemberships.skillLevel,
      })
      .from(leagueMemberships)
      .where(
        and(
          eq(leagueMemberships.leagueId, leagueId),
          eq(leagueMemberships.status, "approved"),
          inArray(leagueMemberships.userId, userIds)
        )
      );

    const skillMap = new Map<string, string | null>();
    skillData.forEach(skill => {
      skillMap.set(skill.userId, skill.skillLevel);
    });

    return skillMap;
  }

  async deleteLeagueMembership(membershipId: string): Promise<void> {
    // First, get the membership to find the user ID and team ID
    const [membership] = await db
      .select()
      .from(leagueMemberships)
      .where(eq(leagueMemberships.id, membershipId));
    
    if (!membership) {
      throw new Error('Membership not found');
    }
    
    // Get all teams in this league to clean up direct team memberships
    const leagueTeams = await db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.leagueId, membership.leagueId));
    
    const leagueTeamIds = leagueTeams.map(t => t.id);
    
    // Clean up direct team memberships for this user in this league's teams
    if (leagueTeamIds.length > 0) {
      await db
        .delete(teamMemberships)
        .where(
          and(
            eq(teamMemberships.userId, membership.userId),
            inArray(teamMemberships.teamId, leagueTeamIds)
          )
        );
    }
    
    // Clean up attendance records for this user's games in this league
    if (membership.assignedTeamId) {
      // Get all games for this team in this league
      const teamGames = await db
        .select({ id: games.id })
        .from(games)
        .where(
          and(
            eq(games.leagueId, membership.leagueId),
            or(
              eq(games.homeTeamId, membership.assignedTeamId),
              eq(games.awayTeamId, membership.assignedTeamId)
            ),
            gte(games.scheduledAt, new Date()) // Only future games
          )
        );
      
      const gameIds = teamGames.map(g => g.id);
      
      if (gameIds.length > 0) {
        // Remove RSVP records for these games
        await db
          .delete(gameRsvps)
          .where(
            and(
              eq(gameRsvps.userId, membership.userId),
              inArray(gameRsvps.gameId, gameIds)
            )
          );
        
        // Remove beverage duty assignments for this user in these games
        await db
          .update(games)
          .set({
            homeBeverageDutyUserId: null,
            homeBeverageDutyClaimedAt: null
          })
          .where(
            and(
              inArray(games.id, gameIds),
              eq(games.homeBeverageDutyUserId, membership.userId)
            )
          );
        
        await db
          .update(games)
          .set({
            awayBeverageDutyUserId: null,
            awayBeverageDutyClaimedAt: null
          })
          .where(
            and(
              inArray(games.id, gameIds),
              eq(games.awayBeverageDutyUserId, membership.userId)
            )
          );
      }
    }
    
    // Finally, delete the membership
    await db
      .delete(leagueMemberships)
      .where(eq(leagueMemberships.id, membershipId));
  }

  async leaveLeague(userId: string, leagueId: string): Promise<void> {
    return await db.transaction(async (tx) => {
      // Find the user's league membership
      const [membership] = await tx
        .select()
        .from(leagueMemberships)
        .where(
          and(
            eq(leagueMemberships.userId, userId),
            eq(leagueMemberships.leagueId, leagueId)
          )
        );

      if (!membership) {
        throw new Error('MEMBERSHIP_NOT_FOUND');
      }

      // Find the imported player record that was merged with this user in this league
      const [importedPlayer] = await tx
        .select()
        .from(importedPlayers)
        .where(
          and(
            eq(importedPlayers.leagueId, leagueId),
            eq(importedPlayers.mergedWithUserId, userId)
          )
        );

      // Note: We intentionally DO NOT unmerge the imported player when leaving
      // This preserves the merge relationship so if the user rejoins, 
      // they can be automatically re-assigned to their original team
      // The imported player keeps its mergedWithUserId intact

      // Get all teams in this league to clean up direct team memberships
      const leagueTeams = await tx
        .select({ id: teams.id })
        .from(teams)
        .where(eq(teams.leagueId, leagueId));

      const leagueTeamIds = leagueTeams.map(t => t.id);

      // Clean up direct team memberships for this user in this league's teams
      if (leagueTeamIds.length > 0) {
        await tx
          .delete(teamMemberships)
          .where(
            and(
              eq(teamMemberships.userId, userId),
              inArray(teamMemberships.teamId, leagueTeamIds)
            )
          );
      }

      // Clean up ALL user data across the entire league (not just assigned team)
      // Get all future games in this league
      const leagueGames = await tx
        .select({ id: games.id })
        .from(games)
        .where(
          and(
            eq(games.leagueId, leagueId),
            gte(games.scheduledAt, new Date()) // Only future games
          )
        );

      const leagueGameIds = leagueGames.map(g => g.id);

      if (leagueGameIds.length > 0) {
        // Remove ALL RSVP records for this user in any game in this league
        await tx
          .delete(gameRsvps)
          .where(
            and(
              eq(gameRsvps.userId, userId),
              inArray(gameRsvps.gameId, leagueGameIds)
            )
          );
      }

      // Remove ALL beverage duty assignments for this user in this league (both home and away)
      await tx
        .update(games)
        .set({
          homeBeverageDutyUserId: null,
          homeBeverageDutyClaimedAt: null
        })
        .where(
          and(
            eq(games.leagueId, leagueId),
            eq(games.homeBeverageDutyUserId, userId),
            gte(games.scheduledAt, new Date())
          )
        );

      await tx
        .update(games)
        .set({
          awayBeverageDutyUserId: null,
          awayBeverageDutyClaimedAt: null
        })
        .where(
          and(
            eq(games.leagueId, leagueId),
            eq(games.awayBeverageDutyUserId, userId),
            gte(games.scheduledAt, new Date())
          )
        );

      // Finally, delete the league membership
      await tx
        .delete(leagueMemberships)
        .where(eq(leagueMemberships.id, membership.id));
    });
  }

  async updateLeagueMember(membershipId: string, updates: Partial<LeagueMembership>): Promise<LeagueMembership> {
    const [membership] = await db
      .update(leagueMemberships)
      .set(updates)
      .where(eq(leagueMemberships.id, membershipId))
      .returning();
    return membership;
  }

  async requestTeamMembership(membership: InsertTeamMembership): Promise<TeamMembership> {
    const [newMembership] = await db.insert(teamMemberships).values(membership).returning();
    return newMembership;
  }

  async approveTeamMembership(membershipId: string, approverId: string): Promise<TeamMembership> {
    const [membership] = await db
      .update(teamMemberships)
      .set({
        status: "approved",
        approvedBy: approverId,
      })
      .where(eq(teamMemberships.id, membershipId))
      .returning();
    return membership;
  }

  async getTeamMembers(teamId: string): Promise<(TeamMembership & { user: User })[]> {
    // Get members from direct team memberships
    const directMemberships = await db
      .select({
        team_memberships: teamMemberships,
        users: users
      })
      .from(teamMemberships)
      .innerJoin(users, eq(teamMemberships.userId, users.id))
      .where(
        and(
          eq(teamMemberships.teamId, teamId),
          eq(teamMemberships.status, "approved")
        )
      );

    // Get members from league memberships assigned to this team
    const leagueMembershipResults = await db
      .select({
        team_memberships: {
          id: leagueMemberships.id,
          userId: leagueMemberships.userId,
          teamId: sql<string>`${leagueMemberships.assignedTeamId}`,
          position: leagueMemberships.position,
          jerseyNumber: leagueMemberships.jerseyNumber,
          status: leagueMemberships.status,
          joinedAt: leagueMemberships.requestedAt,
          approvedBy: leagueMemberships.approvedBy,
          skillLevel: leagueMemberships.skillLevel
        },
        users: users
      })
      .from(leagueMemberships)
      .innerJoin(users, eq(leagueMemberships.userId, users.id))
      .where(
        and(
          eq(leagueMemberships.assignedTeamId, teamId),
          eq(leagueMemberships.status, "approved"),
          not(isNull(leagueMemberships.assignedTeamId))
        )
      );

    // Combine and deduplicate members (in case a user appears in both sources)
    const allMembers = [
      ...directMemberships.map(r => ({ ...r.team_memberships, user: r.users })),
      ...leagueMembershipResults.map(r => ({ ...r.team_memberships, user: r.users }))
    ];

    // Remove duplicates based on userId
    const uniqueMembers = allMembers.filter((member, index, arr) => 
      arr.findIndex(m => m.userId === member.userId) === index
    );

    return uniqueMembers;
  }

  // Game operations
  async createGame(game: InsertGame): Promise<Game> {
    const [newGame] = await db.insert(games).values(game).returning();
    return newGame;
  }

  async findExistingGame(leagueId: string, homeTeamId: string, awayTeamId: string, scheduledAt: Date): Promise<Game | null> {
    // Check for a game with same teams and scheduled time (within 30 minutes)
    const timeBuffer = 30 * 60 * 1000; // 30 minutes in milliseconds
    const startTime = new Date(scheduledAt.getTime() - timeBuffer);
    const endTime = new Date(scheduledAt.getTime() + timeBuffer);
    
    const [existingGame] = await db
      .select()
      .from(games)
      .where(
        and(
          eq(games.leagueId, leagueId),
          or(
            and(eq(games.homeTeamId, homeTeamId), eq(games.awayTeamId, awayTeamId)),
            and(eq(games.homeTeamId, awayTeamId), eq(games.awayTeamId, homeTeamId))
          ),
          and(
            gte(games.scheduledAt, startTime),
            lte(games.scheduledAt, endTime)
          )
        )
      )
      .limit(1);

    return existingGame || null;
  }

  async getUpcomingGames(userId: string): Promise<(Game & { homeTeam: Team; awayTeam: Team })[]> {
    const userTeams = await this.getUserTeams(userId);
    const teamIds = userTeams.map(t => t.id);
    
    // Also get leagues where user is a member (for commissioners who may not be on teams)
    const userLeagues = await this.getUserLeagues(userId);
    const leagueIds = userLeagues.map(l => l.id);
    
    // If user has neither teams nor league memberships, return empty
    if (teamIds.length === 0 && leagueIds.length === 0) return [];

    // Get all games first, then join with teams
    const gamesResult = await db
      .select()
      .from(games)
      .where(
        and(
          gte(games.scheduledAt, new Date()),
          or(
            teamIds.length > 0 ? or(
              inArray(games.homeTeamId, teamIds),
              inArray(games.awayTeamId, teamIds)
            ) : undefined,
            leagueIds.length > 0 ? inArray(games.leagueId, leagueIds) : undefined
          )
        )
      )
      .orderBy(asc(games.scheduledAt));

    // Get team data for each game
    const gamesWithTeams = [];
    for (const game of gamesResult) {
      const [homeTeam] = await db.select().from(teams).where(eq(teams.id, game.homeTeamId));
      const [awayTeam] = await db.select().from(teams).where(eq(teams.id, game.awayTeamId));
      
      gamesWithTeams.push({
        ...game,
        homeTeam,
        awayTeam,
      });
    }

    // Get approved scrimmages for the user
    const approvedScrimmages = await db
      .select({
        scrimmage: scrimmages,
        creator: users
      })
      .from(scrimmageRequests)
      .innerJoin(scrimmages, eq(scrimmageRequests.scrimmageId, scrimmages.id))
      .innerJoin(users, eq(scrimmages.creatorId, users.id))
      .where(
        and(
          eq(scrimmageRequests.playerId, userId),
          eq(scrimmageRequests.status, 'approved'),
          gte(scrimmages.dateTime, new Date()),
          // Only roster_confirmed scrimmages should show on schedule
          eq(scrimmages.status, 'roster_confirmed')
        )
      )
      .orderBy(asc(scrimmages.dateTime));

    // Convert approved scrimmages to game-like format
    const scrimmagesAsGames = approvedScrimmages.map(({ scrimmage, creator }) => ({
      id: scrimmage.id,
      createdAt: scrimmage.createdAt,
      leagueId: scrimmage.leagueId,
      seasonId: null,
      homeTeamId: '',
      awayTeamId: '',
      scheduledAt: scrimmage.dateTime,
      venue: scrimmage.location,
      lockerRoom: null,
      homeTeamLockerRoom: null,
      awayTeamLockerRoom: null,
      homeScore: null,
      awayScore: null,
      isCompleted: false,
      homeBeverageDutyUserId: null,
      homeBeverageDutyClaimedAt: null,
      awayBeverageDutyUserId: null,
      awayBeverageDutyClaimedAt: null,
      updatedAt: scrimmage.updatedAt,
      // Create pseudo teams for display
      homeTeam: {
        id: 'scrimmage-creator',
        name: creator.firstName ? `${creator.firstName} ${creator.lastName || ''}`.trim() : creator.email || 'Creator',
        leagueId: scrimmage.leagueId,
        seasonId: null,
        captainId: null,
        logoUrl: null,
        wins: 0,
        losses: 0,
        ties: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      awayTeam: {
        id: 'scrimmage-participant',
        name: 'Scrimmage',
        leagueId: scrimmage.leagueId,
        seasonId: null,
        captainId: null,
        logoUrl: null,
        wins: 0,
        losses: 0,
        ties: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      // Mark as scrimmage for frontend identification
      isScrimmage: true,
      scrimmageTitle: scrimmage.title
    }));

    // Combine regular games and scrimmages, then sort by scheduled time
    const allEvents = [...gamesWithTeams, ...scrimmagesAsGames];
    return allEvents.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  }

  async getAllUserGames(userId: string): Promise<(Game & { homeTeam: Team; awayTeam: Team })[]> {
    const userTeams = await this.getUserTeams(userId);
    const teamIds = userTeams.map(t => t.id);
    
    // Also get leagues where user is a member (for commissioners who may not be on teams)
    const userLeagues = await this.getUserLeagues(userId);
    const leagueIds = userLeagues.map(l => l.id);
    
    // If user has neither teams nor league memberships, return empty
    if (teamIds.length === 0 && leagueIds.length === 0) return [];

    // Get all games (past and future) - removed the date filter from getUpcomingGames
    const gamesResult = await db
      .select()
      .from(games)
      .where(
        or(
          teamIds.length > 0 ? or(
            inArray(games.homeTeamId, teamIds),
            inArray(games.awayTeamId, teamIds)
          ) : undefined,
          leagueIds.length > 0 ? inArray(games.leagueId, leagueIds) : undefined
        )
      )
      .orderBy(asc(games.scheduledAt)); // Chronological order

    // Get team data for each game
    const gamesWithTeams = [];
    for (const game of gamesResult) {
      const [homeTeam] = await db.select().from(teams).where(eq(teams.id, game.homeTeamId));
      const [awayTeam] = await db.select().from(teams).where(eq(teams.id, game.awayTeamId));
      
      gamesWithTeams.push({
        ...game,
        homeTeam,
        awayTeam,
      });
    }
    
    return gamesWithTeams;
  }

  async getTeamRecord(teamId: string): Promise<{ wins: number; losses: number; ties: number; gamesPlayed: number; gamesRemaining: number }> {
    // Get all games for this team
    const teamGames = await this.getTeamGames(teamId);
    
    let wins = 0;
    let losses = 0;
    let ties = 0;
    let gamesPlayed = 0;
    
    for (const game of teamGames) {
      // Only count completed games with scores
      if (game.isCompleted || (game.homeScore !== null && game.awayScore !== null)) {
        gamesPlayed++;
        
        const isHomeTeam = game.homeTeamId === teamId;
        const teamScore = isHomeTeam ? game.homeScore : game.awayScore;
        const opponentScore = isHomeTeam ? game.awayScore : game.homeScore;
        
        if (teamScore !== null && opponentScore !== null) {
          if (teamScore > opponentScore) {
            wins++;
          } else if (teamScore < opponentScore) {
            losses++;
          } else {
            ties++;
          }
        }
      }
    }
    
    const gamesRemaining = teamGames.length - gamesPlayed;
    
    return {
      wins,
      losses,
      ties,
      gamesPlayed,
      gamesRemaining
    };
  }

  async getLeagueStandings(leagueId: string): Promise<Array<{
    teamId: string;
    teamName: string;
    gamesPlayed: number;
    wins: number;
    losses: number;
    ties: number;
    shootoutLosses: number;
    points: number;
    goalsFor: number;
    goalsAgainst: number;
  }>> {
    // Get all teams in the league
    const teams = await this.getTeamsByLeague(leagueId);
    
    // Get all completed games in the league
    const games = await this.getGamesByLeague(leagueId);
    const completedGames = games.filter(game => 
      game.isCompleted || (game.homeScore !== null && game.awayScore !== null)
    );

    // Calculate standings for each team
    const standings = [];
    
    for (const team of teams) {
      let gamesPlayed = 0;
      let wins = 0;
      let losses = 0;
      let ties = 0;
      let shootoutLosses = 0; // For now, this will be 0 until we add shootout data
      let goalsFor = 0;
      let goalsAgainst = 0;

      // Process each completed game
      for (const game of completedGames) {
        if (game.homeTeamId === team.id || game.awayTeamId === team.id) {
          gamesPlayed++;
          
          const isHomeTeam = game.homeTeamId === team.id;
          const teamScore = isHomeTeam ? game.homeScore : game.awayScore;
          const opponentScore = isHomeTeam ? game.awayScore : game.homeScore;
          
          // Add to goals for/against
          goalsFor += teamScore || 0;
          goalsAgainst += opponentScore || 0;
          
          // Determine win/loss/tie
          if (teamScore !== null && opponentScore !== null) {
            if (teamScore > opponentScore) {
              wins++;
            } else if (teamScore < opponentScore) {
              losses++;
            } else {
              ties++;
            }
          }
        }
      }

      // Calculate points: Wins = 2 points, Ties = 1 point, SOL = 1 point, Losses = 0
      const points = (wins * 2) + (ties * 1) + (shootoutLosses * 1);

      standings.push({
        teamId: team.id,
        teamName: team.name,
        gamesPlayed,
        wins,
        losses,
        ties,
        shootoutLosses,
        points,
        goalsFor,
        goalsAgainst
      });
    }

    // Sort by points (descending), then by goal differential (descending)
    standings.sort((a, b) => {
      if (b.points !== a.points) {
        return b.points - a.points;
      }
      // If points are tied, sort by goal differential
      const goalDiffA = a.goalsFor - a.goalsAgainst;
      const goalDiffB = b.goalsFor - b.goalsAgainst;
      return goalDiffB - goalDiffA;
    });

    return standings;
  }

  async getGameById(gameId: string): Promise<(Game & { homeTeam: Team; awayTeam: Team }) | undefined> {
    const result = await db.execute(sql`
      SELECT 
        g.*,
        ht.id as home_team_id, ht.name as home_team_name, ht.logo_url as home_team_logo_url,
        ht.league_id as home_team_league_id, ht.season_id as home_team_season_id,
        ht.captain_id as home_team_captain_id, ht.wins as home_team_wins, ht.losses as home_team_losses,
        ht.ties as home_team_ties, ht.goals_for as home_team_goals_for, ht.goals_against as home_team_goals_against,
        ht.created_at as home_team_created_at, ht.updated_at as home_team_updated_at,
        at.id as away_team_id, at.name as away_team_name, at.logo_url as away_team_logo_url,
        at.league_id as away_team_league_id, at.season_id as away_team_season_id,
        at.captain_id as away_team_captain_id, at.wins as away_team_wins, at.losses as away_team_losses,
        at.ties as away_team_ties, at.goals_for as away_team_goals_for, at.goals_against as away_team_goals_against,
        at.created_at as away_team_created_at, at.updated_at as away_team_updated_at
      FROM games g
      INNER JOIN teams ht ON g.home_team_id = ht.id
      INNER JOIN teams at ON g.away_team_id = at.id
      WHERE g.id = ${gameId}
    `);
    
    if (!result.rows.length) {
      return undefined;
    }
    
    const row = result.rows[0];
    return {
      id: row.id as string,
      leagueId: row.league_id as string,
      seasonId: row.season_id as string | null,
      homeTeamId: row.home_team_id as string,
      awayTeamId: row.away_team_id as string,
      scheduledAt: row.scheduled_at as Date,
      venue: row.venue as string | null,
      lockerRoom: row.locker_room as string | null,
      homeTeamLockerRoom: row.home_team_locker_room as string | null,
      awayTeamLockerRoom: row.away_team_locker_room as string | null,
      homeScore: row.home_score as number | null,
      awayScore: row.away_score as number | null,
      isCompleted: row.is_completed as boolean,
      homeBeverageDutyUserId: row.home_beverage_duty_user_id as string | null,
      homeBeverageDutyClaimedAt: row.home_beverage_duty_claimed_at as Date | null,
      awayBeverageDutyUserId: row.away_beverage_duty_user_id as string | null,
      awayBeverageDutyClaimedAt: row.away_beverage_duty_claimed_at as Date | null,
      createdAt: row.created_at as Date,
      homeTeam: {
        id: row.home_team_id as string,
        name: row.home_team_name as string,
        logoUrl: row.home_team_logo_url as string | null,
        leagueId: row.home_team_league_id as string,
        seasonId: row.home_team_season_id as string | null,
        captainId: row.home_team_captain_id as string | null,
        wins: row.home_team_wins as number,
        losses: row.home_team_losses as number,
        ties: row.home_team_ties as number,
        goalsFor: row.home_team_goals_for as number,
        goalsAgainst: row.home_team_goals_against as number,
        createdAt: row.home_team_created_at as Date,
        updatedAt: row.home_team_updated_at as Date,
      },
      awayTeam: {
        id: row.away_team_id as string,
        name: row.away_team_name as string,
        logoUrl: row.away_team_logo_url as string | null,
        leagueId: row.away_team_league_id as string,
        seasonId: row.away_team_season_id as string | null,
        captainId: row.away_team_captain_id as string | null,
        wins: row.away_team_wins as number,
        losses: row.away_team_losses as number,
        ties: row.away_team_ties as number,
        goalsFor: row.away_team_goals_for as number,
        goalsAgainst: row.away_team_goals_against as number,
        createdAt: row.away_team_created_at as Date,
        updatedAt: row.away_team_updated_at as Date,
      },
    };
  }

  async claimBeverageDuty(gameId: string, userId: string, teamId: string): Promise<Game> {
    // First, get the game to determine if the user's team is home or away
    const [game] = await db.select().from(games).where(eq(games.id, gameId));
    
    if (!game) {
      throw new Error(`Game with id ${gameId} not found`);
    }

    const isHomeTeam = game.homeTeamId === teamId;
    const updateData = isHomeTeam 
      ? { 
          homeBeverageDutyUserId: userId,
          homeBeverageDutyClaimedAt: new Date()
        }
      : { 
          awayBeverageDutyUserId: userId,
          awayBeverageDutyClaimedAt: new Date()
        };

    const [updatedGame] = await db
      .update(games)
      .set(updateData)
      .where(eq(games.id, gameId))
      .returning();
    
    if (!updatedGame) {
      throw new Error(`Game with id ${gameId} not found`);
    }
    
    return updatedGame;
  }

  async releaseBeverageDuty(gameId: string, userId: string, teamId: string): Promise<Game> {
    // First, get the game to determine if the user's team is home or away
    const [game] = await db.select().from(games).where(eq(games.id, gameId));
    
    if (!game) {
      throw new Error(`Game with id ${gameId} not found`);
    }

    const isHomeTeam = game.homeTeamId === teamId;
    const updateData = isHomeTeam 
      ? { 
          homeBeverageDutyUserId: null,
          homeBeverageDutyClaimedAt: null
        }
      : { 
          awayBeverageDutyUserId: null,
          awayBeverageDutyClaimedAt: null
        };

    const [updatedGame] = await db
      .update(games)
      .set(updateData)
      .where(eq(games.id, gameId))
      .returning();
    
    if (!updatedGame) {
      throw new Error(`Game with id ${gameId} not found`);
    }
    
    return updatedGame;
  }

  async saveGameNotes(gameId: string, userId: string, teamId: string, notes: string): Promise<any> {
    // For now, we'll just return success - notes feature can be implemented later with a proper schema
    return { success: true, notes, gameId, userId, teamId };
  }

  async updateGame(gameId: string, updates: Partial<InsertGame>): Promise<Game> {
    const [updatedGame] = await db
      .update(games)
      .set(updates)
      .where(eq(games.id, gameId))
      .returning();
    
    if (!updatedGame) {
      throw new Error(`Game with id ${gameId} not found`);
    }
    
    return updatedGame;
  }








  async getTeamGames(teamId: string): Promise<(Game & { homeTeam: Team; awayTeam: Team })[]> {
    const result = await db.execute(sql`
      SELECT 
        g.*,
        ht.id as home_team_id, ht.name as home_team_name, ht.logo_url as home_team_logo_url,
        ht.league_id as home_team_league_id, ht.season_id as home_team_season_id,
        ht.captain_id as home_team_captain_id, ht.wins as home_team_wins, ht.losses as home_team_losses,
        ht.ties as home_team_ties, ht.goals_for as home_team_goals_for, ht.goals_against as home_team_goals_against,
        ht.created_at as home_team_created_at, ht.updated_at as home_team_updated_at,
        at.id as away_team_id, at.name as away_team_name, at.logo_url as away_team_logo_url,
        at.league_id as away_team_league_id, at.season_id as away_team_season_id,
        at.captain_id as away_team_captain_id, at.wins as away_team_wins, at.losses as away_team_losses,
        at.ties as away_team_ties, at.goals_for as away_team_goals_for, at.goals_against as away_team_goals_against,
        at.created_at as away_team_created_at, at.updated_at as away_team_updated_at
      FROM games g
      INNER JOIN teams ht ON g.home_team_id = ht.id
      INNER JOIN teams at ON g.away_team_id = at.id
      WHERE g.home_team_id = ${teamId} OR g.away_team_id = ${teamId}
      ORDER BY g.scheduled_at DESC
    `);

    return result.rows.map((row: any) => ({
      id: row.id as string,
      leagueId: row.league_id as string,
      seasonId: row.season_id as string | null,
      homeTeamId: row.home_team_id as string,
      awayTeamId: row.away_team_id as string,
      scheduledAt: row.scheduled_at as Date,
      venue: row.venue as string | null,
      lockerRoom: row.locker_room as string | null,
      homeTeamLockerRoom: row.home_team_locker_room as string | null,
      awayTeamLockerRoom: row.away_team_locker_room as string | null,
      homeScore: row.home_score as number | null,
      awayScore: row.away_score as number | null,
      isCompleted: row.is_completed as boolean,
      homeBeverageDutyUserId: row.home_beverage_duty_user_id as string | null,
      homeBeverageDutyClaimedAt: row.home_beverage_duty_claimed_at as Date | null,
      awayBeverageDutyUserId: row.away_beverage_duty_user_id as string | null,
      awayBeverageDutyClaimedAt: row.away_beverage_duty_claimed_at as Date | null,
      createdAt: row.created_at as Date,
      homeTeam: {
        id: row.home_team_id as string,
        name: row.home_team_name as string,
        logoUrl: row.home_team_logo_url as string | null,
        leagueId: row.home_team_league_id as string,
        seasonId: row.home_team_season_id as string | null,
        captainId: row.home_team_captain_id as string | null,
        wins: row.home_team_wins as number,
        losses: row.home_team_losses as number,
        ties: row.home_team_ties as number,
        goalsFor: row.home_team_goals_for as number,
        goalsAgainst: row.home_team_goals_against as number,
        createdAt: row.home_team_created_at as Date,
        updatedAt: row.home_team_updated_at as Date,
      },
      awayTeam: {
        id: row.away_team_id as string,
        name: row.away_team_name as string,
        logoUrl: row.away_team_logo_url as string | null,
        leagueId: row.away_team_league_id as string,
        seasonId: row.away_team_season_id as string | null,
        captainId: row.away_team_captain_id as string | null,
        wins: row.away_team_wins as number,
        losses: row.away_team_losses as number,
        ties: row.away_team_ties as number,
        goalsFor: row.away_team_goals_for as number,
        goalsAgainst: row.away_team_goals_against as number,
        createdAt: row.away_team_created_at as Date,
        updatedAt: row.away_team_updated_at as Date,
      },
    }));
  }

  async getGamesByLeague(leagueId: string): Promise<(Game & { homeTeam: Team; awayTeam: Team })[]> {
    const result = await db.execute(sql`
      SELECT 
        g.*,
        ht.id as home_team_id, ht.name as home_team_name, ht.logo_url as home_team_logo_url,
        ht.league_id as home_team_league_id, ht.season_id as home_team_season_id,
        ht.captain_id as home_team_captain_id, ht.wins as home_team_wins, ht.losses as home_team_losses,
        ht.ties as home_team_ties, ht.goals_for as home_team_goals_for, ht.goals_against as home_team_goals_against,
        ht.created_at as home_team_created_at, ht.updated_at as home_team_updated_at,
        at.id as away_team_id, at.name as away_team_name, at.logo_url as away_team_logo_url,
        at.league_id as away_team_league_id, at.season_id as away_team_season_id,
        at.captain_id as away_team_captain_id, at.wins as away_team_wins, at.losses as away_team_losses,
        at.ties as away_team_ties, at.goals_for as away_team_goals_for, at.goals_against as away_team_goals_against,
        at.created_at as away_team_created_at, at.updated_at as away_team_updated_at
      FROM games g
      INNER JOIN teams ht ON g.home_team_id = ht.id
      INNER JOIN teams at ON g.away_team_id = at.id
      WHERE g.league_id = ${leagueId}
      ORDER BY g.scheduled_at ASC
    `);

    return result.rows.map((row: any) => ({
      id: row.id as string,
      leagueId: row.league_id as string,
      seasonId: row.season_id as string | null,
      homeTeamId: row.home_team_id as string,
      awayTeamId: row.away_team_id as string,
      scheduledAt: row.scheduled_at as Date,
      venue: row.venue as string | null,
      lockerRoom: row.locker_room as string | null,
      homeTeamLockerRoom: row.home_team_locker_room as string | null,
      awayTeamLockerRoom: row.away_team_locker_room as string | null,
      homeScore: row.home_score as number | null,
      awayScore: row.away_score as number | null,
      isCompleted: row.is_completed as boolean,
      homeBeverageDutyUserId: row.home_beverage_duty_user_id as string | null,
      homeBeverageDutyClaimedAt: row.home_beverage_duty_claimed_at as Date | null,
      awayBeverageDutyUserId: row.away_beverage_duty_user_id as string | null,
      awayBeverageDutyClaimedAt: row.away_beverage_duty_claimed_at as Date | null,
      createdAt: row.created_at as Date,
      homeTeam: {
        id: row.home_team_id as string,
        name: row.home_team_name as string,
        logoUrl: row.home_team_logo_url as string | null,
        leagueId: row.home_team_league_id as string,
        seasonId: row.home_team_season_id as string | null,
        captainId: row.home_team_captain_id as string | null,
        wins: row.home_team_wins as number,
        losses: row.home_team_losses as number,
        ties: row.home_team_ties as number,
        goalsFor: row.home_team_goals_for as number,
        goalsAgainst: row.home_team_goals_against as number,
        createdAt: row.home_team_created_at as Date,
        updatedAt: row.home_team_updated_at as Date,
      },
      awayTeam: {
        id: row.away_team_id as string,
        name: row.away_team_name as string,
        logoUrl: row.away_team_logo_url as string | null,
        leagueId: row.away_team_league_id as string,
        seasonId: row.away_team_season_id as string | null,
        captainId: row.away_team_captain_id as string | null,
        wins: row.away_team_wins as number,
        losses: row.away_team_losses as number,
        ties: row.away_team_ties as number,
        goalsFor: row.away_team_goals_for as number,
        goalsAgainst: row.away_team_goals_against as number,
        createdAt: row.away_team_created_at as Date,
        updatedAt: row.away_team_updated_at as Date,
      },
    }));
  }

  // Message operations
  async sendMessage(message: InsertMessage): Promise<Message> {
    const [newMessage] = await db.insert(messages).values(message).returning();
    return newMessage;
  }

  async getTeamMessages(teamId: string): Promise<(Message & { sender: User })[]> {
    const result = await db
      .select()
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.teamId, teamId))
      .orderBy(desc(messages.createdAt));

    return result.map(r => ({ ...r.messages, sender: r.users }));
  }

  async getDirectMessages(userId1: string, userId2: string): Promise<(Message & { sender: User })[]> {
    const result = await db
      .select()
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(
        and(
          or(
            and(eq(messages.senderId, userId1), eq(messages.recipientId, userId2)),
            and(eq(messages.senderId, userId2), eq(messages.recipientId, userId1))
          ),
          sql`${messages.teamId} IS NULL`,
          sql`${messages.leagueId} IS NULL`
        )
      )
      .orderBy(desc(messages.createdAt));

    return result.map(r => ({ ...r.messages, sender: r.users }));
  }

  // Bulk import operations
  async createPlayerImport(importData: InsertPlayerImport): Promise<PlayerImport> {
    const [playerImport] = await db
      .insert(playerImports)
      .values(importData)
      .returning();
    return playerImport;
  }

  async createImportedPlayers(importId: string, leagueId: string, players: any[]): Promise<ImportedPlayer[]> {
    const playersToInsert = players.map(player => ({
      importId,
      leagueId,
      firstName: player.firstName,
      lastName: player.lastName,
      email: player.email,
      phoneNumber: player.phoneNumber,
      position: player.position,
      jerseyNumber: player.jerseyNumber,
      skillRating: player.skillRating,
      teamName: player.teamName,
      notes: player.notes,
      isPlaceholder: true,
    }));

    const importedPlayerRecords = await db
      .insert(importedPlayers)
      .values(playersToInsert)
      .returning();

    return importedPlayerRecords;
  }

  async createImportedPlayersWithTeams(importId: string, leagueId: string, players: any[]): Promise<ImportedPlayer[]> {
    const playersToInsert = players.map(player => ({
      importId,
      leagueId,
      firstName: player.firstName,
      lastName: player.lastName,
      email: player.email,
      phoneNumber: player.phoneNumber,
      position: player.position,
      jerseyNumber: player.jerseyNumber,
      skillRating: player.skillRating,
      teamName: player.teamName,
      teamId: player.teamId, // Include team ID reference
      notes: player.notes,
      isPlaceholder: true,
    }));

    const importedPlayerRecords = await db
      .insert(importedPlayers)
      .values(playersToInsert)
      .returning();

    return importedPlayerRecords;
  }

  async getPlayerImports(leagueId: string): Promise<PlayerImport[]> {
    const imports = await db
      .select()
      .from(playerImports)
      .where(eq(playerImports.leagueId, leagueId))
      .orderBy(desc(playerImports.createdAt));

    return imports;
  }

  async getPlayerMergeRequests(leagueId: string): Promise<PlayerMergeRequest[]> {
    const requests = await db
      .select()
      .from(playerMergeRequests)
      .where(eq(playerMergeRequests.leagueId, leagueId))
      .orderBy(desc(playerMergeRequests.createdAt));

    return requests;
  }

  async updateMergeRequestStatus(requestId: string, status: string, reviewerId: string): Promise<PlayerMergeRequest> {
    const [updatedRequest] = await db
      .update(playerMergeRequests)
      .set({
        status: status as any,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
      })
      .where(eq(playerMergeRequests.id, requestId))
      .returning();

    return updatedRequest;
  }

  async findPotentialMatches(leagueId: string, firstName: string, lastName: string): Promise<ImportedPlayer[]> {
    return await db.select()
      .from(importedPlayers)
      .where(
        and(
          eq(importedPlayers.leagueId, leagueId),
          eq(importedPlayers.isPlaceholder, true),
          isNull(importedPlayers.mergedWithUserId),
          or(
            and(
              ilike(importedPlayers.firstName, `%${firstName}%`),
              ilike(importedPlayers.lastName, `%${lastName}%`)
            ),
            and(
              ilike(importedPlayers.firstName, firstName),
              ilike(importedPlayers.lastName, lastName)
            )
          )
        )
      );
  }

  // Schedule import operations
  async createScheduleImport(importData: InsertScheduleImport): Promise<ScheduleImport> {
    const [scheduleImport] = await db
      .insert(scheduleImports)
      .values(importData)
      .returning();
    return scheduleImport;
  }

  async createImportedSchedules(importId: string, leagueId: string, schedules: any[]): Promise<ImportedSchedule[]> {
    if (schedules.length === 0) return [];
    
    const scheduleRecords = schedules.map(schedule => ({
      importId,
      leagueId,
      gameDate: schedule.gameDate,
      gameTime: schedule.gameTime,
      homeTeamName: schedule.homeTeamName,
      awayTeamName: schedule.awayTeamName,
      homeTeamId: schedule.homeTeamId,
      awayTeamId: schedule.awayTeamId,
      homeTeamLockerRoom: schedule.homeTeamLockerRoom,
      awayTeamLockerRoom: schedule.awayTeamLockerRoom,
    }));

    return await db.insert(importedSchedules)
      .values(scheduleRecords)
      .returning();
  }

  async getScheduleImports(leagueId: string): Promise<ScheduleImport[]> {
    return await db.select()
      .from(scheduleImports)
      .where(eq(scheduleImports.leagueId, leagueId))
      .orderBy(desc(scheduleImports.createdAt));
  }

  async getImportedSchedules(importId: string): Promise<ImportedSchedule[]> {
    return await db.select()
      .from(importedSchedules)
      .where(eq(importedSchedules.importId, importId))
      .orderBy(asc(importedSchedules.gameDate));
  }

  async deleteGame(id: string): Promise<void> {
    try {
      // Then delete the game
      console.log(`Deleting game ${id}`);
      const deletedGame = await db.delete(games).where(eq(games.id, id));
      console.log(`Deleted ${deletedGame.rowCount || 0} game records`);
      
      if (deletedGame.rowCount === 0) {
        throw new Error(`Game ${id} not found or already deleted`);
      }
    } catch (error) {
      console.error(`Error deleting game ${id}:`, error);
      throw error;
    }
  }

  async deleteTeam(teamId: string): Promise<void> {
    try {
      // Delete team memberships (players on the team)
      console.log(`Deleting team memberships for team ${teamId}`);
      const deletedMemberships = await db.delete(teamMemberships).where(eq(teamMemberships.teamId, teamId));
      console.log(`Deleted ${deletedMemberships.rowCount || 0} team memberships`);

      // Update league memberships to remove team assignment (set to null instead of delete)
      console.log(`Updating league memberships assigned to team ${teamId}`);
      const updatedLeagueMemberships = await db.update(leagueMemberships)
        .set({ assignedTeamId: null })
        .where(eq(leagueMemberships.assignedTeamId, teamId));
      console.log(`Updated ${updatedLeagueMemberships.rowCount || 0} league memberships`);

      // Delete games where this team is home or away team
      console.log(`Deleting games involving team ${teamId}`);
      const deletedGames = await db.delete(games).where(
        or(eq(games.homeTeamId, teamId), eq(games.awayTeamId, teamId))
      );
      console.log(`Deleted ${deletedGames.rowCount || 0} games involving team`);

      // Delete imported schedules where this team is home or away team
      console.log(`Deleting imported schedules involving team ${teamId}`);
      const deletedImportedSchedules = await db.delete(importedSchedules).where(
        or(eq(importedSchedules.homeTeamId, teamId), eq(importedSchedules.awayTeamId, teamId))
      );
      console.log(`Deleted ${deletedImportedSchedules.rowCount || 0} imported schedules involving team`);

      // Finally delete the team itself
      console.log(`Deleting team ${teamId}`);
      const deletedTeam = await db.delete(teams).where(eq(teams.id, teamId));
      console.log(`Deleted ${deletedTeam.rowCount || 0} team records`);

      if (deletedTeam.rowCount === 0) {
        throw new Error(`Team ${teamId} not found or already deleted`);
      }
    } catch (error) {
      console.error(`Error deleting team ${teamId}:`, error);
      throw error;
    }
  }

  // Game score submissions
  async submitGameScore(submission: InsertGameScoreSubmission): Promise<GameScoreSubmission> {
    const [newSubmission] = await db
      .insert(gameScoreSubmissions)
      .values(submission)
      .returning();
    return newSubmission;
  }

  async getGameScoreSubmissions(gameId: string): Promise<GameScoreSubmission[]> {
    return await db
      .select()
      .from(gameScoreSubmissions)
      .where(eq(gameScoreSubmissions.gameId, gameId))
      .orderBy(asc(gameScoreSubmissions.submittedAt));
  }

  async getCaptainScoreSubmissions(gameId: string): Promise<GameScoreSubmission[]> {
    return await db
      .select()
      .from(gameScoreSubmissions)
      .where(
        and(
          eq(gameScoreSubmissions.gameId, gameId),
          or(
            eq(gameScoreSubmissions.submitterRole, 'home_captain'),
            eq(gameScoreSubmissions.submitterRole, 'away_captain')
          )
        )
      )
      .orderBy(asc(gameScoreSubmissions.submittedAt));
  }

  async getCommissionerScoreSubmission(gameId: string): Promise<GameScoreSubmission | undefined> {
    const [submission] = await db
      .select()
      .from(gameScoreSubmissions)
      .where(
        and(
          eq(gameScoreSubmissions.gameId, gameId),
          eq(gameScoreSubmissions.submitterRole, 'commissioner')
        )
      )
      .orderBy(desc(gameScoreSubmissions.submittedAt))
      .limit(1);
    return submission;
  }

  async updateGameScore(gameId: string, homeScore: number, awayScore: number): Promise<Game> {
    const [updatedGame] = await db
      .update(games)
      .set({ 
        homeScore, 
        awayScore, 
        isCompleted: true 
      })
      .where(eq(games.id, gameId))
      .returning();
    return updatedGame;
  }

  async checkForMatchingCaptainScores(gameId: string): Promise<{
    isMatch: boolean;
    homeScore?: number;
    awayScore?: number;
  }> {
    const captainSubmissions = await this.getCaptainScoreSubmissions(gameId);
    
    if (captainSubmissions.length < 2) {
      return { isMatch: false };
    }

    // Get the latest submission from each captain
    const homeSubmission = captainSubmissions
      .filter(s => s.submitterRole === 'home_captain')
      .pop();
    const awaySubmission = captainSubmissions
      .filter(s => s.submitterRole === 'away_captain')
      .pop();

    if (!homeSubmission || !awaySubmission) {
      return { isMatch: false };
    }

    const isMatch = 
      homeSubmission.homeScore === awaySubmission.homeScore &&
      homeSubmission.awayScore === awaySubmission.awayScore;

    return {
      isMatch,
      homeScore: isMatch ? homeSubmission.homeScore : undefined,
      awayScore: isMatch ? homeSubmission.awayScore : undefined,
    };
  }

  // RSVP operations
  async createOrUpdateRsvp(rsvp: InsertGameRsvp): Promise<GameRsvp> {
    const [existingRsvp] = await db
      .select()
      .from(gameRsvps)
      .where(and(
        eq(gameRsvps.gameId, rsvp.gameId), 
        eq(gameRsvps.userId, rsvp.userId),
        eq(gameRsvps.teamId, rsvp.teamId)
      ))
      .limit(1);

    if (existingRsvp) {
      const [updatedRsvp] = await db
        .update(gameRsvps)
        .set({ status: rsvp.status, updatedAt: new Date() })
        .where(and(
          eq(gameRsvps.gameId, rsvp.gameId), 
          eq(gameRsvps.userId, rsvp.userId),
          eq(gameRsvps.teamId, rsvp.teamId)
        ))
        .returning();
      return updatedRsvp;
    } else {
      const [newRsvp] = await db
        .insert(gameRsvps)
        .values(rsvp)
        .returning();
      return newRsvp;
    }
  }

  async getGameRsvp(gameId: string, userId: string): Promise<GameRsvp | undefined> {
    const [rsvp] = await db
      .select()
      .from(gameRsvps)
      .where(and(eq(gameRsvps.gameId, gameId), eq(gameRsvps.userId, userId)))
      .limit(1);
    return rsvp;
  }

  async getGameRsvpSummary(gameId: string): Promise<{ attending: (GameRsvp & { user: User & { skillLevel?: string | null } })[]; notAttending: (GameRsvp & { user: User & { skillLevel?: string | null } })[]; noResponse: (User & { skillLevel?: string | null })[] }> {
    // Get all RSVPs for this game
    const rsvps = await db
      .select()
      .from(gameRsvps)
      .leftJoin(users, eq(gameRsvps.userId, users.id))
      .where(eq(gameRsvps.gameId, gameId));

    const attending = rsvps
      .filter(r => r.game_rsvps.status === 'attending')
      .map(r => ({ ...r.game_rsvps, user: r.users! }));

    const notAttending = rsvps
      .filter(r => r.game_rsvps.status === 'not_attending')
      .map(r => ({ ...r.game_rsvps, user: r.users! }));

    // Get all team members for this game to find no response users
    const game = await this.getGameById(gameId);
    if (!game) {
      return { attending, notAttending, noResponse: [] };
    }

    const homeTeamMembers = await this.getTeamMembers(game.homeTeamId);
    const awayTeamMembers = await this.getTeamMembers(game.awayTeamId);
    const allTeamMembers = [...homeTeamMembers, ...awayTeamMembers];

    const rsvpUserIds = rsvps.map(r => r.game_rsvps.userId);
    const noResponse = allTeamMembers
      .filter(member => !rsvpUserIds.includes(member.userId))
      .map(member => member.user);

    // Collect all unique user IDs and fetch skill levels
    const allUserIds = [
      ...attending.map(a => a.user.id),
      ...notAttending.map(n => n.user.id),
      ...noResponse.map(n => n.id)
    ];
    const uniqueUserIds = [...new Set(allUserIds)];
    const skillMap = await this.fetchUserSkills(uniqueUserIds, game.leagueId);

    // Attach skill levels to user objects
    attending.forEach(a => {
      (a.user as any).skillLevel = skillMap.get(a.user.id) ?? null;
    });
    
    notAttending.forEach(n => {
      (n.user as any).skillLevel = skillMap.get(n.user.id) ?? null;
    });

    const enhancedNoResponse = noResponse.map(user => ({
      ...user,
      skillLevel: skillMap.get(user.id) ?? null
    }));

    return { attending, notAttending, noResponse: enhancedNoResponse };
  }

  async getUserTeamRsvp(gameId: string, userId: string, teamId: string): Promise<GameRsvp | undefined> {
    const [rsvp] = await db
      .select()
      .from(gameRsvps)
      .where(and(
        eq(gameRsvps.gameId, gameId), 
        eq(gameRsvps.userId, userId),
        eq(gameRsvps.teamId, teamId)
      ))
      .limit(1);
    return rsvp;
  }

  async getUserGameRsvps(gameId: string, userId: string): Promise<GameRsvp[]> {
    const rsvps = await db
      .select()
      .from(gameRsvps)
      .where(and(
        eq(gameRsvps.gameId, gameId), 
        eq(gameRsvps.userId, userId)
      ));
    return rsvps;
  }

  async getTeamRsvpSummary(gameId: string, teamId: string): Promise<{ attending: (GameRsvp & { user: User & { skillLevel?: string | null } })[]; notAttending: (GameRsvp & { user: User & { skillLevel?: string | null } })[]; noResponse: (User & { skillLevel?: string | null })[] }> {
    // Get all RSVPs for this game and team
    const rsvps = await db
      .select()
      .from(gameRsvps)
      .leftJoin(users, eq(gameRsvps.userId, users.id))
      .where(and(
        eq(gameRsvps.gameId, gameId),
        eq(gameRsvps.teamId, teamId)
      ));

    const attending = rsvps
      .filter(r => r.game_rsvps.status === 'attending')
      .map(r => ({ ...r.game_rsvps, user: r.users! }));

    const notAttending = rsvps
      .filter(r => r.game_rsvps.status === 'not_attending')
      .map(r => ({ ...r.game_rsvps, user: r.users! }));

    // Get team members to find no response users
    const teamMembers = await this.getTeamMembers(teamId);
    const rsvpUserIds = rsvps.map(r => r.game_rsvps.userId);
    const noResponse = teamMembers
      .filter(member => !rsvpUserIds.includes(member.userId))
      .map(member => member.user);

    // Get game to find league ID for skill level lookup
    const game = await this.getGameById(gameId);
    if (!game) {
      return { attending, notAttending, noResponse };
    }

    // Collect all unique user IDs and fetch skill levels
    const allUserIds = [
      ...attending.map(a => a.user.id),
      ...notAttending.map(n => n.user.id),
      ...noResponse.map(n => n.id)
    ];
    const uniqueUserIds = [...new Set(allUserIds)];
    const skillMap = await this.fetchUserSkills(uniqueUserIds, game.leagueId);

    // Attach skill levels to user objects
    attending.forEach(a => {
      (a.user as any).skillLevel = skillMap.get(a.user.id) ?? null;
    });
    
    notAttending.forEach(n => {
      (n.user as any).skillLevel = skillMap.get(n.user.id) ?? null;
    });

    const enhancedNoResponse = noResponse.map(user => ({
      ...user,
      skillLevel: skillMap.get(user.id) ?? null
    }));

    return { attending, notAttending, noResponse: enhancedNoResponse };
  }

  async getGameRsvpSummaryByTeams(gameId: string): Promise<{ homeTeam: { teamId: string; attending: (GameRsvp & { user: User })[]; notAttending: (GameRsvp & { user: User })[]; noResponse: User[] }; awayTeam: { teamId: string; attending: (GameRsvp & { user: User })[]; notAttending: (GameRsvp & { user: User })[]; noResponse: User[] } }> {
    const game = await this.getGameById(gameId);
    if (!game) {
      throw new Error('Game not found');
    }

    const homeTeamSummary = await this.getTeamRsvpSummary(gameId, game.homeTeamId);
    const awayTeamSummary = await this.getTeamRsvpSummary(gameId, game.awayTeamId);

    return {
      homeTeam: {
        teamId: game.homeTeamId,
        ...homeTeamSummary
      },
      awayTeam: {
        teamId: game.awayTeamId,
        ...awayTeamSummary
      }
    };
  }

  async getAvailablePlayers(date: Date, leagueId: string): Promise<(User & { skillLevel?: string | null })[]> {
    // Get all league members
    const leagueMembers = await this.getLeagueMembers(leagueId);
    
    // Get all games on the same date
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const gamesOnDate = await db
      .select()
      .from(games)
      .where(
        and(
          eq(games.leagueId, leagueId),
          gte(games.scheduledAt, startOfDay),
          lte(games.scheduledAt, endOfDay)
        )
      );

    // Get team members for all games on that date
    const scheduledUserIds = new Set<string>();
    for (const game of gamesOnDate) {
      const homeMembers = await this.getTeamMembers(game.homeTeamId);
      const awayMembers = await this.getTeamMembers(game.awayTeamId);
      [...homeMembers, ...awayMembers].forEach(member => {
        scheduledUserIds.add(member.userId);
      });
    }

    // Filter available players
    const availableMembers = leagueMembers
      .filter(member => !scheduledUserIds.has(member.userId));
    
    const availableUsers = availableMembers.map(member => member.user);
    
    // Fetch skill levels for available users
    const userIds = availableUsers.map(user => user.id);
    const skillMap = await this.fetchUserSkills(userIds, leagueId);
    
    // Return users with skill level data
    return availableUsers.map(user => ({
      ...user,
      skillLevel: skillMap.get(user.id) ?? null
    }));
  }

  // Substitute request operations
  async createSubstituteRequest(request: InsertSubstituteRequest): Promise<SubstituteRequest> {
    const [newRequest] = await db
      .insert(substituteRequests)
      .values({
        ...request,
        updatedAt: new Date(),
      })
      .returning();
    return newRequest;
  }

  async getSubstituteRequests(options?: { status?: string; gameId?: string; userId?: string; requestingTeamId?: string; leagueIds?: string[] }): Promise<(SubstituteRequest & { game: Game & { homeTeam: Team; awayTeam: Team }; originalPlayer: User; substitutePlayer?: User; requestedByUser: User; requestingTeam?: Team; approvals: SubstitutionApproval[] })[]> {
    // Build dynamic query based on options
    let conditions: any[] = [];
    
    if (options?.status) {
      conditions.push(eq(substituteRequests.status, options.status as any));
    }
    
    if (options?.gameId) {
      conditions.push(eq(substituteRequests.gameId, options.gameId));
    }
    
    if (options?.userId) {
      conditions.push(
        or(
          eq(substituteRequests.requestedBy, options.userId),
          eq(substituteRequests.originalPlayerId, options.userId),
          eq(substituteRequests.substitutePlayerId, options.userId)
        )
      );
    }
    
    if (options?.requestingTeamId) {
      conditions.push(eq(substituteRequests.requestingTeamId, options.requestingTeamId));
    }
    
    const baseQuery = db.select().from(substituteRequests);
    const requests = conditions.length > 0 
      ? await baseQuery.where(and(...conditions)).orderBy(desc(substituteRequests.createdAt))
      : await baseQuery.orderBy(desc(substituteRequests.createdAt));
    
    const result = [];
    for (const request of requests) {
      const game = await this.getGameById(request.gameId);
      
      // Apply league filtering if specified (for commissioner authorization)
      if (options?.leagueIds && options.leagueIds.length > 0) {
        if (!game || !options.leagueIds.includes(game.leagueId)) {
          continue; // Skip requests not in commissioner's leagues
        }
      }
      const originalPlayer = await this.getUser(request.originalPlayerId);
      const requestedByUser = await this.getUser(request.requestedBy);
      let substitutePlayer = undefined;
      
      if (request.substitutePlayerId) {
        substitutePlayer = await this.getUser(request.substitutePlayerId);
      }

      // Get requesting team if available
      let requestingTeam = undefined;
      if (request.requestingTeamId) {
        requestingTeam = await this.getTeam(request.requestingTeamId);
      }

      // Get approvals for this request
      const approvals = await this.getSubstitutionApprovals(request.id);

      if (game && originalPlayer && requestedByUser) {
        result.push({
          ...request,
          game,
          originalPlayer,
          substitutePlayer,
          requestedByUser,
          requestingTeam,
          approvals: approvals.map(a => ({
            id: a.id,
            substitutionRequestId: a.substitutionRequestId,
            approverId: a.approverId,
            approverType: a.approverType,
            status: a.status,
            comments: a.comments,
            approvedAt: a.approvedAt,
          })),
        });
      }
    }

    return result;
  }

  // SECURITY: Controlled update method that prevents status manipulation
  async updateSubstituteRequestNonStatusFields(requestId: string, updates: { reason?: string; expiresAt?: Date; substitutePlayerId?: string }): Promise<SubstituteRequest> {
    // Only allow updates to non-workflow-critical fields
    const safeUpdates = {
      ...(updates.reason !== undefined && { reason: updates.reason }),
      ...(updates.expiresAt !== undefined && { expiresAt: updates.expiresAt }),
      ...(updates.substitutePlayerId !== undefined && { substitutePlayerId: updates.substitutePlayerId }),
      updatedAt: new Date(),
    };
    
    const [updatedRequest] = await db
      .update(substituteRequests)
      .set(safeUpdates)
      .where(eq(substituteRequests.id, requestId))
      .returning();
    return updatedRequest;
  }

  // SECURITY: Internal method for controlled status updates (only used by processApproval)
  private async updateSubstituteRequestStatus(requestId: string, status: 'pending_opponent_approval' | 'pending_commissioner_approval' | 'pending_substitute_approval' | 'approved' | 'denied' | 'expired', finalizedAt?: Date): Promise<SubstituteRequest> {
    const updates: any = {
      status,
      updatedAt: new Date(),
    };
    
    if (finalizedAt) {
      updates.finalizedAt = finalizedAt;
    }
    
    const [updatedRequest] = await db
      .update(substituteRequests)
      .set(updates)
      .where(eq(substituteRequests.id, requestId))
      .returning();
    return updatedRequest;
  }

  async getSubstituteRequest(requestId: string): Promise<(SubstituteRequest & { game: Game & { homeTeam: Team; awayTeam: Team }; originalPlayer: User; substitutePlayer?: User; requestedByUser: User; requestingTeam?: Team; approvals: SubstitutionApproval[] }) | undefined> {
    const [request] = await db
      .select()
      .from(substituteRequests)
      .where(eq(substituteRequests.id, requestId));

    if (!request) return undefined;

    const game = await this.getGameById(request.gameId);
    const originalPlayer = await this.getUser(request.originalPlayerId);
    const requestedByUser = await this.getUser(request.requestedBy);
    let substitutePlayer = undefined;
    
    if (request.substitutePlayerId) {
      substitutePlayer = await this.getUser(request.substitutePlayerId);
    }

    // Get requesting team if available
    let requestingTeam = undefined;
    if (request.requestingTeamId) {
      requestingTeam = await this.getTeam(request.requestingTeamId);
    }

    // Get approvals for this request
    const approvals = await this.getSubstitutionApprovals(request.id);

    if (game && originalPlayer && requestedByUser) {
      return {
        ...request,
        game,
        originalPlayer,
        substitutePlayer,
        requestedByUser,
        requestingTeam,
        approvals: approvals.map(a => ({
          id: a.id,
          substitutionRequestId: a.substitutionRequestId,
          approverId: a.approverId,
          approverType: a.approverType,
          status: a.status,
          comments: a.comments,
          approvedAt: a.approvedAt,
        })),
      };
    }

    return undefined;
  }

  async expireSubstituteRequests(leagueIds?: string[]): Promise<SubstituteRequest[]> {
    let conditions = [
      sql`${substituteRequests.expiresAt} < NOW()`,
      sql`${substituteRequests.status} NOT IN ('approved', 'denied', 'expired')`
    ];
    
    // If leagueIds are specified, only expire requests from those leagues
    if (leagueIds && leagueIds.length > 0) {
      // Need to join with games table to filter by league
      const gameSubquery = db
        .select({ id: games.id })
        .from(games)
        .where(inArray(games.leagueId, leagueIds));
      
      conditions.push(sql`${substituteRequests.gameId} IN (${gameSubquery})`);
    }

    const expiredRequests = await db
      .update(substituteRequests)
      .set({
        status: "expired",
        updatedAt: new Date(),
      })
      .where(and(...conditions))
      .returning();

    return expiredRequests;
  }

  // Substitution approval operations
  async createSubstitutionApproval(approval: InsertSubstitutionApproval): Promise<SubstitutionApproval> {
    const [newApproval] = await db
      .insert(substitutionApprovals)
      .values(approval)
      .returning();
    return newApproval;
  }

  async getSubstitutionApprovals(requestId: string): Promise<(SubstitutionApproval & { approver: User })[]> {
    const result = await db
      .select()
      .from(substitutionApprovals)
      .innerJoin(users, eq(substitutionApprovals.approverId, users.id))
      .where(eq(substitutionApprovals.substitutionRequestId, requestId))
      .orderBy(desc(substitutionApprovals.approvedAt));

    return result.map(r => ({ ...r.substitution_approvals, approver: r.users }));
  }

  // Get pending substitute requests that require action from the current user for needs attention system
  async getPendingSubstituteApprovalsForUser(userId: string, leagueId: string): Promise<{ captain: any[]; commissioner: any[]; total: number }> {
    const result: { captain: any[]; commissioner: any[]; total: number } = { captain: [], commissioner: [], total: 0 };

    // Get all pending substitute requests for this league with basic joins
    const pendingRequests = await db
      .select({
        request: substituteRequests,
        game: games
      })
      .from(substituteRequests)
      .innerJoin(games, eq(substituteRequests.gameId, games.id))
      .where(
        and(
          eq(games.leagueId, leagueId),
          or(
            eq(substituteRequests.status, 'pending_opponent_approval'),
            eq(substituteRequests.status, 'pending_commissioner_approval')
          )
        )
      );

    // Check if user is league commissioner first
    const league = await this.getLeague(leagueId);
    const isCommissioner = league && league.commissionerId === userId;

    // Get all unique user IDs from the requests to batch fetch skill levels
    const userIds = Array.from(new Set(
      pendingRequests.flatMap(row => [
        row.request.originalPlayerId,
        row.request.substitutePlayerId
      ].filter((id): id is string => id !== null))
    ));

    // Fetch skill levels for all users in this league
    const skillLevels = await this.fetchUserSkills(userIds, leagueId);
    console.log('DEBUG: Skill levels fetched:', Array.from(skillLevels.entries()));

    // Process each request
    for (const row of pendingRequests) {
      const request = row.request;
      const game = row.game;

      // Get team information
      const homeTeam = await this.getTeam(game.homeTeamId);
      const awayTeam = await this.getTeam(game.awayTeamId);
      
      // Get player information
      const originalPlayer = request.originalPlayerId ? await this.getUser(request.originalPlayerId) : null;
      const substitutePlayer = request.substitutePlayerId ? await this.getUser(request.substitutePlayerId) : null;

      if (!homeTeam || !awayTeam) continue;

      const requestSummary = {
        id: request.id,
        status: request.status,
        createdAt: request.createdAt,
        game: {
          id: game.id,
          scheduledAt: game.scheduledAt,
          homeTeam: { id: homeTeam.id, name: homeTeam.name },
          awayTeam: { id: awayTeam.id, name: awayTeam.name }
        },
        originalPlayer: originalPlayer ? {
          id: originalPlayer.id,
          firstName: originalPlayer.firstName,
          lastName: originalPlayer.lastName,
          skillLevel: skillLevels.get(originalPlayer.id) || null
        } : null,
        substitutePlayer: substitutePlayer ? {
          id: substitutePlayer.id,
          firstName: substitutePlayer.firstName,
          lastName: substitutePlayer.lastName,
          skillLevel: skillLevels.get(substitutePlayer.id) || null
        } : null,
        requestingTeamId: request.requestingTeamId
      };

      // Check if user is opposing captain for requests pending captain approval
      if (request.status === 'pending_opponent_approval') {
        const opposingTeamId = request.requestingTeamId === game.homeTeamId ? game.awayTeamId : game.homeTeamId;
        const opposingTeam = opposingTeamId === homeTeam.id ? homeTeam : awayTeam;
        
        if (opposingTeam.captainId === userId) {
          result.captain.push(requestSummary);
          result.total++;
        }
      }

      // Check if user is league commissioner - commissioners can see ALL pending requests for oversight
      if (isCommissioner) {
        // Add to commissioner section if it's specifically pending commissioner approval
        if (request.status === 'pending_commissioner_approval') {
          result.commissioner.push(requestSummary);
          result.total++;
        }
        // Also add to commissioner section if it's pending opponent approval (for oversight)
        else if (request.status === 'pending_opponent_approval') {
          result.commissioner.push(requestSummary);
          result.total++;
        }
      }
    }

    return result;
  }

  async getUserPendingApprovals(userId: string, approverType?: 'opposing_captain' | 'commissioner' | 'substitute_player'): Promise<(SubstitutionApproval & { substitutionRequest: SubstituteRequest & { game: Game & { homeTeam: Team; awayTeam: Team }; originalPlayer: User; substitutePlayer?: User } })[]> {
    // For pending approvals, we need to find requests where:
    // 1. The request is in a status that requires this user's approval
    // 2. There's no existing approval from this user for this stage
    
    let conditions: any[] = [];
    
    if (approverType === "opposing_captain") {
      conditions.push(eq(substituteRequests.status, "pending_opponent_approval"));
    } else if (approverType === "commissioner") {
      conditions.push(eq(substituteRequests.status, "pending_commissioner_approval"));
    } else if (approverType === "substitute_player") {
      conditions.push(eq(substituteRequests.status, "pending_substitute_approval"));
    } else {
      // If no specific type, get all pending for this user
      conditions.push(
        or(
          eq(substituteRequests.status, "pending_opponent_approval"),
          eq(substituteRequests.status, "pending_commissioner_approval"),
          eq(substituteRequests.status, "pending_substitute_approval")
        )
      );
    }

    // Get requests that need approval from this user
    const requests = await db
      .select()
      .from(substituteRequests)
      .where(and(...conditions));

    const result = [];

    for (const request of requests) {
      // Check if user already approved this request at this stage
      const existingApproval = await db
        .select()
        .from(substitutionApprovals)
        .where(
          and(
            eq(substitutionApprovals.substitutionRequestId, request.id),
            eq(substitutionApprovals.approverId, userId),
            approverType ? eq(substitutionApprovals.approverType, approverType as any) : sql`1=1`
          )
        );

      // Only include if no existing approval
      if (existingApproval.length === 0) {
        const game = await this.getGameById(request.gameId);
        const originalPlayer = await this.getUser(request.originalPlayerId);
        let substitutePlayer = undefined;
        
        if (request.substitutePlayerId) {
          substitutePlayer = await this.getUser(request.substitutePlayerId);
        }

        if (game && originalPlayer) {
          // Create a mock approval object for the return type
          const mockApproval = {
            id: '',
            substitutionRequestId: request.id,
            approverId: userId,
            approverType: approverType as any,
            status: 'approved' as any,
            comments: null,
            approvedAt: new Date(),
            substitutionRequest: {
              ...request,
              game,
              originalPlayer,
              substitutePlayer,
            }
          };
          result.push(mockApproval);
        }
      }
    }

    return result;
  }

  async processApproval(
    requestId: string, 
    approverId: string, 
    approverType: 'opposing_captain' | 'commissioner' | 'substitute_player', 
    status: 'approved' | 'denied', 
    comments?: string
  ): Promise<{ approval: SubstitutionApproval; updatedRequest: SubstituteRequest }> {
    
    return await db.transaction(async (tx) => {
      // 1. Get the current request with all related data
      const request = await this.getSubstituteRequest(requestId);
      if (!request) {
        throw new Error(`Substitute request ${requestId} not found`);
      }

      // 2. SECURITY: Validate workflow state transition
      const expectedStatus = this.getExpectedStatusForApproverType(approverType);
      if (request.status !== expectedStatus) {
        throw new Error(`Invalid workflow state: request is ${request.status}, expected ${expectedStatus} for ${approverType}`);
      }

      // 3. SECURITY: Validate approver authorization
      await this.validateApproverAuthorization(approverId, approverType, request);

      // 4. SECURITY: Check for duplicate approvals
      const existingApprovals = await tx
        .select()
        .from(substitutionApprovals)
        .where(
          and(
            eq(substitutionApprovals.substitutionRequestId, requestId),
            eq(substitutionApprovals.approverId, approverId),
            eq(substitutionApprovals.approverType, approverType)
          )
        );
      
      if (existingApprovals.length > 0) {
        throw new Error(`Approver ${approverId} has already provided approval for this request at stage ${approverType}`);
      }

      // 5. Create the approval record
      const [approval] = await tx
        .insert(substitutionApprovals)
        .values({
          substitutionRequestId: requestId,
          approverId,
          approverType,
          status,
          comments,
        })
        .returning();

      // 6. SECURITY: Determine next status based on CURRENT status and approval decision
      const nextStatus = this.deriveNextStatus(request.status, approverType, status);
      const finalizedAt = (nextStatus === 'approved' || nextStatus === 'denied') ? new Date() : undefined;

      // 7. Update the substitute request status using controlled method
      const [updatedRequest] = await tx
        .update(substituteRequests)
        .set({
          status: nextStatus,
          updatedAt: new Date(),
          ...(finalizedAt && { finalizedAt }),
        })
        .where(eq(substituteRequests.id, requestId))
        .returning();

      // 8. Send notifications for workflow progression
      await this.createSubstitutionNotification(tx, request, updatedRequest, approverType, status);

      return { approval, updatedRequest };
    });
  }

  // SECURITY: Validate that the approver has authority for this approval type
  private async validateApproverAuthorization(
    approverId: string, 
    approverType: 'opposing_captain' | 'commissioner' | 'substitute_player',
    request: SubstituteRequest & { game: Game & { homeTeam: Team; awayTeam: Team } }
  ): Promise<void> {
    switch (approverType) {
      case 'opposing_captain':
        // Find the opposing team and validate captain
        const opposingTeamId = request.requestingTeamId === request.game.homeTeamId 
          ? request.game.awayTeamId 
          : request.game.homeTeamId;
        
        const opposingTeam = await this.getTeam(opposingTeamId);
        if (!opposingTeam || opposingTeam.captainId !== approverId) {
          throw new Error(`User ${approverId} is not the captain of the opposing team`);
        }
        break;

      case 'commissioner':
        // Validate commissioner of the league
        const league = await this.getLeague(request.game.leagueId);
        if (!league || league.commissionerId !== approverId) {
          throw new Error(`User ${approverId} is not the commissioner of this league`);
        }
        break;

      case 'substitute_player':
        // Validate substitute player
        if (!request.substitutePlayerId || request.substitutePlayerId !== approverId) {
          throw new Error(`User ${approverId} is not the designated substitute player`);
        }
        break;

      default:
        throw new Error(`Invalid approver type: ${approverType}`);
    }
  }

  // SECURITY: Get expected status for approver type to validate workflow
  private getExpectedStatusForApproverType(approverType: 'opposing_captain' | 'commissioner' | 'substitute_player'): string {
    switch (approverType) {
      case 'opposing_captain':
        return 'pending_opponent_approval';
      case 'commissioner':
        return 'pending_commissioner_approval';
      case 'substitute_player':
        return 'pending_substitute_approval';
      default:
        throw new Error(`Invalid approver type: ${approverType}`);
    }
  }

  // Create targeted notifications for substitution workflow progression
  private async createSubstitutionNotification(
    tx: any,
    originalRequest: SubstituteRequest & { game: Game & { homeTeam: Team; awayTeam: Team }; originalPlayer: User; substitutePlayer?: User },
    updatedRequest: SubstituteRequest,
    approverType: 'opposing_captain' | 'commissioner' | 'substitute_player',
    decision: 'approved' | 'denied'
  ): Promise<void> {
    try {
      const leagueId = originalRequest.game.leagueId;
      
      // Determine notification content and target based on workflow progression
      let targetUserId: string | null = null;
      let content = '';
      
      if (decision === 'denied') {
        // Denial notifications - notify requesting team captain
        const requestingTeam = originalRequest.requestingTeamId === originalRequest.game.homeTeamId 
          ? originalRequest.game.homeTeam 
          : originalRequest.game.awayTeam;
        
        if (requestingTeam.captainId) {
          targetUserId = requestingTeam.captainId;
          const approverRole = approverType === 'opposing_captain' ? 'opposing team captain' : 
                              approverType === 'commissioner' ? 'league commissioner' : 'substitute player';
          content = `🚫 Your substitution request for ${originalRequest.originalPlayer.firstName} ${originalRequest.originalPlayer.lastName} in the ${originalRequest.game.homeTeam.name} vs ${originalRequest.game.awayTeam.name} game has been denied by the ${approverRole}.`;
        }
      } else if (decision === 'approved') {
        // Approval notifications - notify next person in workflow
        switch (updatedRequest.status) {
          case 'pending_commissioner_approval':
            // Opposing captain approved → notify commissioner
            const league = await tx.select().from(leagues).where(eq(leagues.id, leagueId)).limit(1);
            if (league[0]?.commissionerId) {
              targetUserId = league[0].commissionerId;
              content = `⚖️ Commissioner approval needed: A substitution request for the ${originalRequest.game.homeTeam.name} vs ${originalRequest.game.awayTeam.name} game has been approved by the opposing team captain and now needs your approval as league commissioner.`;
            }
            break;
            
          case 'pending_substitute_approval':
            // Commissioner approved → notify substitute player
            if (originalRequest.substitutePlayer?.id) {
              targetUserId = originalRequest.substitutePlayer.id;
              content = `🏆 You've been requested as a substitute player! The ${originalRequest.game.homeTeam.name} vs ${originalRequest.game.awayTeam.name} game needs you to substitute for ${originalRequest.originalPlayer.firstName} ${originalRequest.originalPlayer.lastName}. Please confirm your availability.`;
            }
            break;
            
          case 'approved':
            // Substitute player confirmed → notify all parties
            const allParticipants: string[] = [];
            
            // Add requesting team captain
            const requestingTeam = originalRequest.requestingTeamId === originalRequest.game.homeTeamId 
              ? originalRequest.game.homeTeam 
              : originalRequest.game.awayTeam;
            if (requestingTeam.captainId) {
              allParticipants.push(requestingTeam.captainId);
            }
            
            // Add opposing team captain
            const opposingTeam = originalRequest.requestingTeamId === originalRequest.game.homeTeamId 
              ? originalRequest.game.awayTeam 
              : originalRequest.game.homeTeam;
            if (opposingTeam.captainId) {
              allParticipants.push(opposingTeam.captainId);
            }
            
            // Add commissioner
            const leagueData = await tx.select().from(leagues).where(eq(leagues.id, leagueId)).limit(1);
            if (leagueData[0]?.commissionerId) {
              allParticipants.push(leagueData[0].commissionerId);
            }
            
            // Add original player
            if (originalRequest.originalPlayerId) {
              allParticipants.push(originalRequest.originalPlayerId);
            }
            
            // Create notifications for all participants (multiple target users)
            if (allParticipants.length > 0) {
              const substitutePlayerName = originalRequest.substitutePlayer 
                ? `${originalRequest.substitutePlayer.firstName} ${originalRequest.substitutePlayer.lastName}`
                : 'the substitute player';
              content = `✅ Substitution confirmed! ${substitutePlayerName} has confirmed they will substitute for ${originalRequest.originalPlayer.firstName} ${originalRequest.originalPlayer.lastName} in the ${originalRequest.game.homeTeam.name} vs ${originalRequest.game.awayTeam.name} game.`;
              
              // Create the announcement
              const [announcement] = await tx
                .insert(announcements)
                .values({
                  leagueId,
                  authorId: originalRequest.requestedBy, // System notification from the requesting user
                  content,
                  isPinned: false,
                })
                .returning();
              
              // Create visibility records for all participants
              const visibilityRecords = allParticipants.map(userId => ({
                announcementId: announcement.id,
                userId,
              }));
              
              await tx.insert(announcementVisibility).values(visibilityRecords);
              return; // Early return for multi-user notification
            }
            break;
        }
      }
      
      // Create single-user targeted notification
      if (targetUserId && content) {
        const [announcement] = await tx
          .insert(announcements)
          .values({
            leagueId,
            authorId: originalRequest.requestedBy, // System notification from the requesting user
            content,
            isPinned: false,
          })
          .returning();
        
        await tx.insert(announcementVisibility).values({
          announcementId: announcement.id,
          userId: targetUserId,
        });
      }
      
    } catch (error) {
      console.error('Error creating substitution notification:', error);
      // Don't throw error - notification failure shouldn't break approval workflow
    }
  }

  // SECURITY: Derive next status from current state and approval decision
  private deriveNextStatus(
    currentStatus: string, 
    approverType: 'opposing_captain' | 'commissioner' | 'substitute_player', 
    decision: 'approved' | 'denied'
  ): 'pending_opponent_approval' | 'pending_commissioner_approval' | 'pending_substitute_approval' | 'approved' | 'denied' | 'expired' {
    if (decision === 'denied') {
      return 'denied';
    }

    // Only allow approved decisions to advance workflow
    switch (approverType) {
      case 'opposing_captain':
        if (currentStatus !== 'pending_opponent_approval') {
          throw new Error(`Invalid transition: cannot process opposing_captain approval from status ${currentStatus}`);
        }
        return 'pending_commissioner_approval';
        
      case 'commissioner':
        if (currentStatus !== 'pending_commissioner_approval') {
          throw new Error(`Invalid transition: cannot process commissioner approval from status ${currentStatus}`);
        }
        return 'pending_substitute_approval';
        
      case 'substitute_player':
        if (currentStatus !== 'pending_substitute_approval') {
          throw new Error(`Invalid transition: cannot process substitute_player approval from status ${currentStatus}`);
        }
        return 'approved';
        
      default:
        throw new Error(`Invalid approver type: ${approverType}`);
    }
  }

  // Announcement operations
  async createAnnouncement(announcement: InsertAnnouncement): Promise<Announcement> {
    const [newAnnouncement] = await db.insert(announcements).values(announcement).returning();
    return newAnnouncement;
  }

  async getLeagueAnnouncements(leagueId: string, options?: { limit?: number; offset?: number; orderBy?: string; orderDirection?: 'asc' | 'desc' }, userId?: string): Promise<{ announcements: (Announcement & { author: User; attachments: AnnouncementAttachment[]; reactions: (AnnouncementReaction & { user: User })[]; polls: (AnnouncementPoll & { votes: (AnnouncementPollVote & { user: User })[] })[] })[]; total: number }> {
    // Build visibility filter condition
    // Logic: Show announcements that either have no visibility restrictions OR user is explicitly allowed
    const visibilityFilter = userId ? sql`(
      NOT EXISTS (
        SELECT 1 FROM ${announcementVisibility} av 
        WHERE av.announcement_id = ${announcements.id}
      )
      OR 
      EXISTS (
        SELECT 1 FROM ${announcementVisibility} av 
        WHERE av.announcement_id = ${announcements.id} AND av.user_id = ${userId}
      )
    )` : sql`1=1`; // If no userId provided, show all (for commissioner access)

    // First get the total count with visibility filtering
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(announcements)
      .where(and(
        eq(announcements.leagueId, leagueId),
        visibilityFilter
      ));
    
    const total = countResult.count;
    
    // Build paginated announcement query
    const baseQuery = db
      .select()
      .from(announcements)
      .where(and(
        eq(announcements.leagueId, leagueId),
        visibilityFilter
      ))
      .orderBy(
        desc(announcements.isPinned),
        options?.orderDirection === 'asc' ? asc(announcements.createdAt) : desc(announcements.createdAt)
      );
    
    // Apply pagination conditionally
    let leagueAnnouncements;
    if (options?.limit && options?.offset) {
      leagueAnnouncements = await baseQuery.limit(options.limit).offset(options.offset);
    } else if (options?.limit) {
      leagueAnnouncements = await baseQuery.limit(options.limit);
    } else if (options?.offset) {
      leagueAnnouncements = await baseQuery.limit(1000).offset(options.offset);
    } else {
      leagueAnnouncements = await baseQuery;
    }

    const result = [];
    for (const announcement of leagueAnnouncements) {
      const enrichedAnnouncement = await this.getAnnouncement(announcement.id);
      if (enrichedAnnouncement) {
        result.push(enrichedAnnouncement);
      }
    }
    return { announcements: result, total };
  }

  async getAnnouncement(id: string): Promise<(Announcement & { author: User; attachments: AnnouncementAttachment[]; reactions: (AnnouncementReaction & { user: User })[]; polls: (AnnouncementPoll & { votes: (AnnouncementPollVote & { user: User })[] })[] }) | undefined> {
    const [announcement] = await db.select().from(announcements).where(eq(announcements.id, id));
    if (!announcement) return undefined;

    const author = await this.getUser(announcement.authorId);
    if (!author) return undefined;

    const attachments = await db
      .select()
      .from(announcementAttachments)
      .where(eq(announcementAttachments.announcementId, id));

    const reactionResults = await db
      .select()
      .from(announcementReactions)
      .innerJoin(users, eq(announcementReactions.userId, users.id))
      .where(eq(announcementReactions.announcementId, id));
    
    const reactions = reactionResults.map(r => ({ ...r.announcement_reactions, user: r.users }));

    const pollResults = await db
      .select()
      .from(announcementPolls)
      .where(eq(announcementPolls.announcementId, id));

    const polls = [];
    for (const poll of pollResults) {
      const voteResults = await db
        .select()
        .from(announcementPollVotes)
        .innerJoin(users, eq(announcementPollVotes.userId, users.id))
        .where(eq(announcementPollVotes.pollId, poll.id));
      
      const votes = voteResults.map(v => ({ ...v.announcement_poll_votes, user: v.users }));
      polls.push({ ...poll, votes });
    }

    return { ...announcement, author, attachments, reactions, polls };
  }

  async updateAnnouncement(id: string, updates: Partial<Announcement>): Promise<Announcement> {
    const [announcement] = await db
      .update(announcements)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(announcements.id, id))
      .returning();
    return announcement;
  }

  async deleteAnnouncement(id: string): Promise<void> {
    // Delete associated data first
    await db.delete(announcementAttachments).where(eq(announcementAttachments.announcementId, id));
    await db.delete(announcementReactions).where(eq(announcementReactions.announcementId, id));
    
    // Delete poll votes first, then polls
    const polls = await db.select().from(announcementPolls).where(eq(announcementPolls.announcementId, id));
    for (const poll of polls) {
      await db.delete(announcementPollVotes).where(eq(announcementPollVotes.pollId, poll.id));
    }
    await db.delete(announcementPolls).where(eq(announcementPolls.announcementId, id));
    
    // Finally delete the announcement
    await db.delete(announcements).where(eq(announcements.id, id));
  }

  // Announcement attachment operations
  async createAnnouncementAttachment(attachment: InsertAnnouncementAttachment): Promise<AnnouncementAttachment> {
    const [newAttachment] = await db.insert(announcementAttachments).values(attachment).returning();
    return newAttachment;
  }

  async deleteAnnouncementAttachment(id: string): Promise<void> {
    await db.delete(announcementAttachments).where(eq(announcementAttachments.id, id));
  }

  // Announcement reaction operations
  async addAnnouncementReaction(reaction: InsertAnnouncementReaction): Promise<AnnouncementReaction> {
    const [newReaction] = await db.insert(announcementReactions).values(reaction).returning();
    return newReaction;
  }

  async removeAnnouncementReaction(announcementId: string, userId: string, emoji: string): Promise<void> {
    await db
      .delete(announcementReactions)
      .where(
        and(
          eq(announcementReactions.announcementId, announcementId),
          eq(announcementReactions.userId, userId),
          eq(announcementReactions.emoji, emoji)
        )
      );
  }

  // Announcement read status operations
  async markAnnouncementAsRead(announcementId: string, userId: string): Promise<void> {
    // Use INSERT ... ON CONFLICT DO NOTHING to avoid duplicate entries
    await db
      .insert(announcementReadStatus)
      .values({
        announcementId,
        userId,
        readAt: new Date(),
      })
      .onConflictDoNothing();
  }

  async getUnreadAnnouncementCount(leagueId: string, userId: string): Promise<number> {
    // Build visibility filter condition
    const visibilityFilter = sql`(
      NOT EXISTS (
        SELECT 1 FROM ${announcementVisibility} av 
        WHERE av.announcement_id = ${announcements.id}
      )
      OR 
      EXISTS (
        SELECT 1 FROM ${announcementVisibility} av 
        WHERE av.announcement_id = ${announcements.id} AND av.user_id = ${userId}
      )
    )`;

    // Count announcements that user has NOT read AND can see (respecting visibility)
    const [result] = await db
      .select({ 
        count: sql<number>`CAST(COUNT(*) AS INTEGER)` 
      })
      .from(announcements)
      .leftJoin(
        announcementReadStatus, 
        and(
          eq(announcementReadStatus.announcementId, announcements.id),
          eq(announcementReadStatus.userId, userId)
        )
      )
      .where(
        and(
          eq(announcements.leagueId, leagueId),
          isNull(announcementReadStatus.id),
          visibilityFilter
        )
      );

    return result.count;
  }

  // Announcement poll operations
  async createAnnouncementPoll(poll: InsertAnnouncementPoll): Promise<AnnouncementPoll> {
    const [newPoll] = await db.insert(announcementPolls).values(poll).returning();
    return newPoll;
  }

  async voteOnPoll(vote: InsertAnnouncementPollVote): Promise<AnnouncementPollVote> {
    const [newVote] = await db.insert(announcementPollVotes).values(vote).returning();
    return newVote;
  }

  async getPollResults(pollId: string): Promise<(AnnouncementPollVote & { user: User })[]> {
    const results = await db
      .select()
      .from(announcementPollVotes)
      .innerJoin(users, eq(announcementPollVotes.userId, users.id))
      .where(eq(announcementPollVotes.pollId, pollId));
    
    return results.map(r => ({ ...r.announcement_poll_votes, user: r.users }));
  }

  // Announcement visibility operations (for targeted announcements)
  async createAnnouncementVisibility(announcementId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return; // No users to add visibility for
    
    const visibilityRecords = userIds.map(userId => ({
      announcementId,
      userId,
    }));
    
    await db.insert(announcementVisibility).values(visibilityRecords).onConflictDoNothing();
  }

  async getAnnouncementVisibility(announcementId: string): Promise<string[]> {
    const results = await db
      .select({ userId: announcementVisibility.userId })
      .from(announcementVisibility)
      .where(eq(announcementVisibility.announcementId, announcementId));
    
    return results.map(r => r.userId);
  }

  async isAnnouncementVisibleToUser(announcementId: string, userId: string): Promise<boolean> {
    // Check if announcement has any visibility restrictions
    const visibilityCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(announcementVisibility)
      .where(eq(announcementVisibility.announcementId, announcementId));
    
    // If no visibility records exist, announcement is visible to all league members (default behavior)
    if (visibilityCount[0].count === 0) {
      return true;
    }
    
    // If visibility records exist, check if user is in the list
    const userVisibility = await db
      .select()
      .from(announcementVisibility)
      .where(
        and(
          eq(announcementVisibility.announcementId, announcementId),
          eq(announcementVisibility.userId, userId)
        )
      );
    
    return userVisibility.length > 0;
  }

  // Scrimmage operations
  async createScrimmage(scrimmageData: InsertScrimmage): Promise<Scrimmage> {
    const [newScrimmage] = await db.insert(scrimmages).values(scrimmageData).returning();
    return newScrimmage;
  }

  async getScrimmage(scrimmageId: string): Promise<Scrimmage | undefined> {
    const [scrimmage] = await db
      .select()
      .from(scrimmages)
      .where(eq(scrimmages.id, scrimmageId));
    return scrimmage;
  }

  async getLeagueScrimmages(leagueId: string): Promise<(Scrimmage & { creator: User; requestCount: number })[]> {
    const results = await db
      .select({
        scrimmage: scrimmages,
        creator: users,
        requestCount: sql<number>`CAST(COUNT(${scrimmageRequests.id}) AS INTEGER)`
      })
      .from(scrimmages)
      .innerJoin(users, eq(scrimmages.creatorId, users.id))
      .leftJoin(scrimmageRequests, and(
        eq(scrimmageRequests.scrimmageId, scrimmages.id),
        eq(scrimmageRequests.status, 'pending')
      ))
      .where(eq(scrimmages.leagueId, leagueId))
      .groupBy(scrimmages.id, users.id)
      .orderBy(desc(scrimmages.dateTime));

    return results.map(r => ({
      ...r.scrimmage,
      creator: r.creator,
      requestCount: r.requestCount
    }));
  }

  async getUserScrimmages(userId: string): Promise<(Scrimmage & { creator: User; requestCount: number })[]> {
    const results = await db
      .select({
        scrimmage: scrimmages,
        creator: users,
        requestCount: sql<number>`CAST(COUNT(${scrimmageRequests.id}) AS INTEGER)`
      })
      .from(scrimmages)
      .innerJoin(users, eq(scrimmages.creatorId, users.id))
      .leftJoin(scrimmageRequests, and(
        eq(scrimmageRequests.scrimmageId, scrimmages.id),
        eq(scrimmageRequests.status, 'pending')
      ))
      .where(eq(scrimmages.creatorId, userId))
      .groupBy(scrimmages.id, users.id)
      .orderBy(desc(scrimmages.dateTime));

    return results.map(r => ({
      ...r.scrimmage,
      creator: r.creator,
      requestCount: r.requestCount
    }));
  }

  async updateScrimmage(scrimmageId: string, updates: Partial<InsertScrimmage>): Promise<Scrimmage> {
    const [updatedScrimmage] = await db
      .update(scrimmages)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(scrimmages.id, scrimmageId))
      .returning();
    return updatedScrimmage;
  }

  async deleteScrimmage(scrimmageId: string): Promise<void> {
    // Delete associated requests first to avoid referential integrity issues
    await db.delete(scrimmageRequests).where(eq(scrimmageRequests.scrimmageId, scrimmageId));
    // Then delete the scrimmage
    await db.delete(scrimmages).where(eq(scrimmages.id, scrimmageId));
  }

  // Scrimmage request operations
  async createScrimmageRequest(requestData: InsertScrimmageRequest): Promise<ScrimmageRequest> {
    const [newRequest] = await db.insert(scrimmageRequests).values(requestData).returning();
    return newRequest;
  }

  async getScrimmageRequests(scrimmageId: string): Promise<(ScrimmageRequest & { player: User })[]> {
    const results = await db
      .select()
      .from(scrimmageRequests)
      .innerJoin(users, eq(scrimmageRequests.playerId, users.id))
      .where(eq(scrimmageRequests.scrimmageId, scrimmageId))
      .orderBy(scrimmageRequests.requestedAt);

    return results.map(r => ({ ...r.scrimmage_requests, player: r.users }));
  }

  async getScrimmageRequest(scrimmageId: string, playerId: string): Promise<ScrimmageRequest | undefined> {
    const [request] = await db
      .select()
      .from(scrimmageRequests)
      .where(and(
        eq(scrimmageRequests.scrimmageId, scrimmageId),
        eq(scrimmageRequests.playerId, playerId)
      ));
    return request;
  }

  async getScrimmageRequestById(requestId: string): Promise<ScrimmageRequest | undefined> {
    const [request] = await db
      .select()
      .from(scrimmageRequests)
      .where(eq(scrimmageRequests.id, requestId));
    return request;
  }

  async updateScrimmageRequestStatus(requestId: string, status: 'approved' | 'dismissed', timestamp?: Date): Promise<ScrimmageRequest> {
    const updateData: Partial<InsertScrimmageRequest> = { status };
    
    if (status === 'approved') {
      updateData.approvedAt = timestamp || new Date();
    } else if (status === 'dismissed') {
      updateData.dismissedAt = timestamp || new Date();
    }

    const [updatedRequest] = await db
      .update(scrimmageRequests)
      .set(updateData)
      .where(and(
        eq(scrimmageRequests.id, requestId),
        eq(scrimmageRequests.status, 'pending')
      ))
      .returning();
    return updatedRequest;
  }

  async deleteScrimmageRequest(requestId: string): Promise<void> {
    await db.delete(scrimmageRequests).where(eq(scrimmageRequests.id, requestId));
  }

  async getScrimmageRequestsByPlayer(playerId: string): Promise<(ScrimmageRequest & { scrimmage: Scrimmage & { creator: User } })[]> {
    const results = await db
      .select()
      .from(scrimmageRequests)
      .innerJoin(scrimmages, eq(scrimmageRequests.scrimmageId, scrimmages.id))
      .innerJoin(users, eq(scrimmages.creatorId, users.id))
      .where(eq(scrimmageRequests.playerId, playerId))
      .orderBy(desc(scrimmageRequests.requestedAt));

    return results.map(r => ({
      ...r.scrimmage_requests,
      scrimmage: {
        ...r.scrimmages,
        creator: r.users
      }
    }));
  }

  // Player merge operations
  async mergeUsersInLeague(leagueId: string, fromUserId: string, toUserId: string, preserveName = true): Promise<LeagueMembership> {
    return await db.transaction(async (tx) => {
      // 1. Get both users' memberships in this league
      const [fromMembership] = await tx
        .select()
        .from(leagueMemberships)
        .where(and(eq(leagueMemberships.leagueId, leagueId), eq(leagueMemberships.userId, fromUserId)));
      
      const [toMembership] = await tx
        .select()
        .from(leagueMemberships)
        .where(and(eq(leagueMemberships.leagueId, leagueId), eq(leagueMemberships.userId, toUserId)));

      if (!fromMembership) {
        throw new Error('Source user not found in league');
      }

      // 2. Get all teams in this league for scoping
      const leagueTeams = await tx
        .select({ id: teams.id })
        .from(teams)
        .where(eq(teams.leagueId, leagueId));
      const leagueTeamIds = leagueTeams.map(t => t.id);

      // 3. Handle teamMemberships merge with conflict resolution
      const fromTeamMemberships = await tx
        .select()
        .from(teamMemberships)
        .where(and(
          eq(teamMemberships.userId, fromUserId),
          inArray(teamMemberships.teamId, leagueTeamIds)
        ));

      const toTeamMemberships = await tx
        .select()
        .from(teamMemberships)
        .where(and(
          eq(teamMemberships.userId, toUserId),
          inArray(teamMemberships.teamId, leagueTeamIds)
        ));

      // Merge team memberships, preferring existing toUser memberships
      const teamMembershipsByTeam = new Map();
      toTeamMemberships.forEach(tm => teamMembershipsByTeam.set(tm.teamId, tm));
      
      for (const fromTm of fromTeamMemberships) {
        const existingTm = teamMembershipsByTeam.get(fromTm.teamId);
        if (existingTm) {
          // Update existing membership with merged data
          await tx
            .update(teamMemberships)
            .set({
              position: existingTm.position || fromTm.position,
              jerseyNumber: existingTm.jerseyNumber || fromTm.jerseyNumber,
              skillLevel: existingTm.skillLevel || fromTm.skillLevel,
              status: existingTm.status !== 'pending' ? existingTm.status : fromTm.status,
              joinedAt: existingTm.joinedAt || fromTm.joinedAt,
              approvedBy: existingTm.approvedBy || fromTm.approvedBy,
            })
            .where(eq(teamMemberships.id, existingTm.id));
        } else {
          // Create new membership for toUser
          await tx
            .insert(teamMemberships)
            .values({
              userId: toUserId,
              teamId: fromTm.teamId,
              position: fromTm.position,
              jerseyNumber: fromTm.jerseyNumber,
              skillLevel: fromTm.skillLevel,
              status: fromTm.status,
              joinedAt: fromTm.joinedAt,
              approvedBy: fromTm.approvedBy,
            });
        }
      }

      // Delete fromUser team memberships
      await tx
        .delete(teamMemberships)
        .where(and(
          eq(teamMemberships.userId, fromUserId),
          inArray(teamMemberships.teamId, leagueTeamIds)
        ));

      // 4. Update all foreign key references with proper league scoping

      // Update games (beverage duty assignments)
      await tx
        .update(games)
        .set({ homeBeverageDutyUserId: toUserId })
        .where(and(
          eq(games.homeBeverageDutyUserId, fromUserId),
          eq(games.leagueId, leagueId)
        ));

      await tx
        .update(games)
        .set({ awayBeverageDutyUserId: toUserId })
        .where(and(
          eq(games.awayBeverageDutyUserId, fromUserId),
          eq(games.leagueId, leagueId)
        ));

      // Update gameRsvps with conflict resolution (unique constraint: gameId, userId, teamId)
      const conflictingRsvps = await tx
        .select()
        .from(gameRsvps)
        .innerJoin(games, eq(gameRsvps.gameId, games.id))
        .where(and(
          eq(games.leagueId, leagueId),
          or(
            eq(gameRsvps.userId, fromUserId),
            eq(gameRsvps.userId, toUserId)
          )
        ));

      // Group by gameId + teamId to handle conflicts
      const rsvpConflicts = new Map<string, typeof conflictingRsvps>();
      conflictingRsvps.forEach(rsvp => {
        const key = `${rsvp.game_rsvps.gameId}_${rsvp.game_rsvps.teamId}`;
        if (!rsvpConflicts.has(key)) {
          rsvpConflicts.set(key, []);
        }
        rsvpConflicts.get(key)!.push(rsvp);
      });

      for (const [, rsvpsForGame] of rsvpConflicts) {
        const fromRsvp = rsvpsForGame.find(r => r.game_rsvps.userId === fromUserId);
        const toRsvp = rsvpsForGame.find(r => r.game_rsvps.userId === toUserId);
        
        if (fromRsvp && toRsvp) {
          // Conflict: prefer non-default status or more recent timestamp
          const preferFromRsvp = fromRsvp.game_rsvps.status !== 'no_response' && 
                                 toRsvp.game_rsvps.status === 'no_response' ||
                                 fromRsvp.game_rsvps.updatedAt > toRsvp.game_rsvps.updatedAt;
          
          if (preferFromRsvp) {
            await tx
              .update(gameRsvps)
              .set({ 
                status: fromRsvp.game_rsvps.status,
                createdAt: fromRsvp.game_rsvps.createdAt,
                updatedAt: fromRsvp.game_rsvps.updatedAt
              })
              .where(eq(gameRsvps.id, toRsvp.game_rsvps.id));
          }
          // Delete the fromUser RSVP (will be handled in batch delete below)
        } else if (fromRsvp && !toRsvp) {
          // No conflict: update fromUser RSVP to toUser
          await tx
            .update(gameRsvps)
            .set({ userId: toUserId })
            .where(eq(gameRsvps.id, fromRsvp.game_rsvps.id));
        }
      }

      // Delete remaining fromUser RSVPs (conflicts already handled)
      await tx
        .delete(gameRsvps)
        .where(and(
          eq(gameRsvps.userId, fromUserId),
          sql`${gameRsvps.gameId} IN (SELECT id FROM ${games} WHERE league_id = ${leagueId})`
        ));

      // Update gameScoreSubmissions
      await tx
        .update(gameScoreSubmissions)
        .set({ submittedBy: toUserId })
        .where(and(
          eq(gameScoreSubmissions.submittedBy, fromUserId),
          sql`${gameScoreSubmissions.gameId} IN (SELECT id FROM ${games} WHERE league_id = ${leagueId})`
        ));

      // Update substitute requests (scoped to league games)
      await tx
        .update(substituteRequests)
        .set({ originalPlayerId: toUserId })
        .where(and(
          eq(substituteRequests.originalPlayerId, fromUserId),
          sql`${substituteRequests.gameId} IN (SELECT id FROM ${games} WHERE league_id = ${leagueId})`
        ));

      await tx
        .update(substituteRequests)
        .set({ substitutePlayerId: toUserId })
        .where(and(
          eq(substituteRequests.substitutePlayerId, fromUserId),
          sql`${substituteRequests.gameId} IN (SELECT id FROM ${games} WHERE league_id = ${leagueId})`
        ));

      await tx
        .update(substituteRequests)
        .set({ requestedBy: toUserId })
        .where(and(
          eq(substituteRequests.requestedBy, fromUserId),
          sql`${substituteRequests.gameId} IN (SELECT id FROM ${games} WHERE league_id = ${leagueId})`
        ));

      // Update substitution approvals (scoped through substitute requests to league)
      await tx
        .update(substitutionApprovals)
        .set({ approverId: toUserId })
        .where(and(
          eq(substitutionApprovals.approverId, fromUserId),
          sql`${substitutionApprovals.substitutionRequestId} IN (
            SELECT sr.id FROM ${substituteRequests} sr 
            INNER JOIN ${games} g ON sr.game_id = g.id 
            WHERE g.league_id = ${leagueId}
          )`
        ));

      // Update messages (league scoped)
      await tx
        .update(messages)
        .set({ senderId: toUserId })
        .where(and(
          eq(messages.senderId, fromUserId),
          eq(messages.leagueId, leagueId)
        ));

      await tx
        .update(messages)
        .set({ recipientId: toUserId })
        .where(and(
          eq(messages.recipientId, fromUserId),
          eq(messages.leagueId, leagueId)
        ));

      // Update announcements
      await tx
        .update(announcements)
        .set({ authorId: toUserId })
        .where(and(
          eq(announcements.authorId, fromUserId),
          eq(announcements.leagueId, leagueId)
        ));

      // Update announcement interactions with conflict resolution
      // Delete conflicting reactions (unique constraint: announcementId, userId, emoji)
      await tx
        .delete(announcementReactions)
        .where(and(
          eq(announcementReactions.userId, fromUserId),
          sql`${announcementReactions.announcementId} IN (
            SELECT id FROM ${announcements} WHERE league_id = ${leagueId}
          )`,
          sql`(announcement_id, emoji) IN (
            SELECT ar.announcement_id, ar.emoji 
            FROM ${announcementReactions} ar 
            INNER JOIN ${announcements} a ON ar.announcement_id = a.id
            WHERE a.league_id = ${leagueId} AND ar.user_id = ${toUserId}
          )`
        ));

      // Update remaining reactions
      await tx
        .update(announcementReactions)
        .set({ userId: toUserId })
        .where(and(
          eq(announcementReactions.userId, fromUserId),
          sql`${announcementReactions.announcementId} IN (
            SELECT id FROM ${announcements} WHERE league_id = ${leagueId}
          )`
        ));

      // Update announcement read status (delete conflicts, then update)
      await tx
        .delete(announcementReadStatus)
        .where(and(
          eq(announcementReadStatus.userId, fromUserId),
          sql`${announcementReadStatus.announcementId} IN (
            SELECT ars.announcement_id 
            FROM ${announcementReadStatus} ars 
            INNER JOIN ${announcements} a ON ars.announcement_id = a.id
            WHERE a.league_id = ${leagueId} AND ars.user_id = ${toUserId}
          )`
        ));

      await tx
        .update(announcementReadStatus)
        .set({ userId: toUserId })
        .where(and(
          eq(announcementReadStatus.userId, fromUserId),
          sql`${announcementReadStatus.announcementId} IN (
            SELECT id FROM ${announcements} WHERE league_id = ${leagueId}
          )`
        ));

      // Update announcement visibility
      await tx
        .delete(announcementVisibility)
        .where(and(
          eq(announcementVisibility.userId, fromUserId),
          sql`${announcementVisibility.announcementId} IN (
            SELECT av.announcement_id 
            FROM ${announcementVisibility} av 
            INNER JOIN ${announcements} a ON av.announcement_id = a.id
            WHERE a.league_id = ${leagueId} AND av.user_id = ${toUserId}
          )`
        ));

      await tx
        .update(announcementVisibility)
        .set({ userId: toUserId })
        .where(and(
          eq(announcementVisibility.userId, fromUserId),
          sql`${announcementVisibility.announcementId} IN (
            SELECT id FROM ${announcements} WHERE league_id = ${leagueId}
          )`
        ));

      // Update announcement poll votes with conflict resolution
      await tx
        .delete(announcementPollVotes)
        .where(and(
          eq(announcementPollVotes.userId, fromUserId),
          sql`(poll_id, option_index) IN (
            SELECT apv.poll_id, apv.option_index 
            FROM ${announcementPollVotes} apv 
            INNER JOIN ${announcementPolls} ap ON apv.poll_id = ap.id
            INNER JOIN ${announcements} a ON ap.announcement_id = a.id
            WHERE a.league_id = ${leagueId} AND apv.user_id = ${toUserId}
          )`
        ));

      await tx
        .update(announcementPollVotes)
        .set({ userId: toUserId })
        .where(and(
          eq(announcementPollVotes.userId, fromUserId),
          sql`${announcementPollVotes.pollId} IN (
            SELECT ap.id FROM ${announcementPolls} ap 
            INNER JOIN ${announcements} a ON ap.announcement_id = a.id
            WHERE a.league_id = ${leagueId}
          )`
        ));

      // Update scrimmages
      await tx
        .update(scrimmages)
        .set({ creatorId: toUserId })
        .where(and(
          eq(scrimmages.creatorId, fromUserId),
          eq(scrimmages.leagueId, leagueId)
        ));

      // Update scrimmage requests with conflict resolution
      await tx
        .delete(scrimmageRequests)
        .where(and(
          eq(scrimmageRequests.playerId, fromUserId),
          sql`${scrimmageRequests.scrimmageId} IN (
            SELECT sr.scrimmage_id 
            FROM ${scrimmageRequests} sr 
            INNER JOIN ${scrimmages} s ON sr.scrimmage_id = s.id
            WHERE s.league_id = ${leagueId} AND sr.player_id = ${toUserId}
          )`
        ));

      await tx
        .update(scrimmageRequests)
        .set({ playerId: toUserId })
        .where(and(
          eq(scrimmageRequests.playerId, fromUserId),
          sql`${scrimmageRequests.scrimmageId} IN (
            SELECT id FROM ${scrimmages} WHERE league_id = ${leagueId}
          )`
        ));

      // Update team captains
      await tx
        .update(teams)
        .set({ captainId: toUserId })
        .where(and(
          eq(teams.captainId, fromUserId),
          eq(teams.leagueId, leagueId)
        ));

      // Update league memberships approvedBy references
      await tx
        .update(leagueMemberships)
        .set({ approvedBy: toUserId })
        .where(and(
          eq(leagueMemberships.approvedBy, fromUserId),
          eq(leagueMemberships.leagueId, leagueId)
        ));

      // Update team memberships approvedBy references
      await tx
        .update(teamMemberships)
        .set({ approvedBy: toUserId })
        .where(and(
          eq(teamMemberships.approvedBy, fromUserId),
          inArray(teamMemberships.teamId, leagueTeamIds)
        ));

      // Update import-related tables
      await tx
        .update(playerImports)
        .set({ importedBy: toUserId })
        .where(and(
          eq(playerImports.importedBy, fromUserId),
          eq(playerImports.leagueId, leagueId)
        ));

      await tx
        .update(scheduleImports)
        .set({ importedBy: toUserId })
        .where(and(
          eq(scheduleImports.importedBy, fromUserId),
          eq(scheduleImports.leagueId, leagueId)
        ));

      await tx
        .update(playerMergeRequests)
        .set({ reviewedBy: toUserId })
        .where(and(
          eq(playerMergeRequests.reviewedBy, fromUserId),
          eq(playerMergeRequests.leagueId, leagueId)
        ));

      await tx
        .update(importedPlayers)
        .set({ mergedWithUserId: toUserId })
        .where(and(
          eq(importedPlayers.mergedWithUserId, fromUserId),
          eq(importedPlayers.leagueId, leagueId)
        ));

      // Update draft-related tables if drafts exist
      await tx
        .update(drafts)
        .set({ createdBy: toUserId })
        .where(and(
          eq(drafts.createdBy, fromUserId),
          eq(drafts.leagueId, leagueId)
        ));

      await tx
        .update(draftPicks)
        .set({ playerId: toUserId })
        .where(and(
          eq(draftPicks.playerId, fromUserId),
          sql`${draftPicks.draftId} IN (SELECT id FROM ${drafts} WHERE league_id = ${leagueId})`
        ));

      // 5. Merge league membership data
      const mergedData: Partial<LeagueMembership> = {
        userId: toUserId,
        // Preserve team assignment and player details from placeholder
        assignedTeamId: fromMembership.assignedTeamId || toMembership?.assignedTeamId,
        position: fromMembership.position || toMembership?.position,
        skillLevel: fromMembership.skillLevel || toMembership?.skillLevel,
        jerseyNumber: fromMembership.jerseyNumber || toMembership?.jerseyNumber,
        notes: fromMembership.notes || toMembership?.notes,
        // Set display names from placeholder user if preserveName is true
        displayFirstName: preserveName ? fromMembership.displayFirstName : null,
        displayLastName: preserveName ? fromMembership.displayLastName : null,
        // Preserve approval status and timing
        status: toMembership?.status || fromMembership.status,
        requestedAt: toMembership?.requestedAt || fromMembership.requestedAt,
        approvedAt: toMembership?.approvedAt || fromMembership.approvedAt,
        approvedBy: toMembership?.approvedBy || fromMembership.approvedBy,
      };

      // 6. Create or update the target membership
      let finalMembership: LeagueMembership;
      
      if (toMembership) {
        // Update existing membership
        const [updated] = await tx
          .update(leagueMemberships)
          .set(mergedData)
          .where(eq(leagueMemberships.id, toMembership.id))
          .returning();
        finalMembership = updated;
      } else {
        // Create new membership for target user
        const [created] = await tx
          .insert(leagueMemberships)
          .values({
            ...mergedData,
            leagueId: leagueId,
            userId: toUserId,
          } as InsertLeagueMembership)
          .returning();
        finalMembership = created;
      }

      // 7. Delete the source membership
      await tx
        .delete(leagueMemberships)
        .where(eq(leagueMemberships.id, fromMembership.id));

      return finalMembership;
    });
  }
}

export const storage = new DatabaseStorage();
