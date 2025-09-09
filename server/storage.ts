import {
  users,
  leagues,
  seasons,
  teams,
  leagueMemberships,
  teamMemberships,
  games,
  gameAttendance,
  messages,
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
  type Message,
  type InsertMessage,
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
import { eq, and, desc, sql, ilike, or, gte, inArray, asc, isNull } from "drizzle-orm";

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
  
  // Membership operations
  requestLeagueMembership(membership: InsertLeagueMembership): Promise<LeagueMembership>;
  approveLeagueMembership(membershipId: string, approverId: string): Promise<LeagueMembership>;
  rejectLeagueMembership(membershipId: string, approverId: string): Promise<LeagueMembership>;
  getUserLeagueMembership(userId: string, leagueId: string): Promise<LeagueMembership | undefined>;
  getLeagueMembers(leagueId: string): Promise<(LeagueMembership & { user: User })[]>;
  getPendingLeagueMembers(leagueId: string): Promise<(LeagueMembership & { user: User })[]>;
  updatePlayerSkillRating(membershipId: string, skillRating: number): Promise<LeagueMembership>;
  deleteLeagueMembership(membershipId: string): Promise<void>;
  requestTeamMembership(membership: InsertTeamMembership): Promise<TeamMembership>;
  approveTeamMembership(membershipId: string, approverId: string): Promise<TeamMembership>;
  getTeamMembers(teamId: string): Promise<(TeamMembership & { user: User })[]>;
  
  // Game operations
  createGame(game: InsertGame): Promise<Game>;
  getUpcomingGames(userId: string): Promise<(Game & { homeTeam: Team; awayTeam: Team })[]>;
  getTeamGames(teamId: string): Promise<(Game & { homeTeam: Team; awayTeam: Team })[]>;
  getGamesByLeague(leagueId: string): Promise<(Game & { homeTeam: Team; awayTeam: Team })[]>;
  getGameById(gameId: string): Promise<(Game & { homeTeam: Team; awayTeam: Team }) | undefined>;
  claimBeverageDuty(gameId: string, userId: string, teamId: string): Promise<Game>;
  releaseBeverageDuty(gameId: string, userId: string, teamId: string): Promise<Game>;
  saveGameNotes(gameId: string, userId: string, teamId: string, notes: string): Promise<any>;
  deleteGame(id: string): Promise<void>;
  
  // Attendance operations
  checkInToGame(gameId: string, userId: string, teamId: string): Promise<any>;
  checkOutFromGame(gameId: string, userId: string): Promise<any>;
  getGameAttendance(gameId: string): Promise<any[]>;
  getUserAttendanceStatuses(userId: string): Promise<any[]>;
  getCaptainAttendanceOverview(userId: string): Promise<any[]>;
  
  // Message operations
  sendMessage(message: InsertMessage): Promise<Message>;
  getTeamMessages(teamId: string): Promise<(Message & { sender: User })[]>;
  getDirectMessages(userId1: string, userId2: string): Promise<(Message & { sender: User })[]>;
  
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

  async getTeam(id: string): Promise<Team | undefined> {
    const [team] = await db.select().from(teams).where(eq(teams.id, id));
    return team;
  }

  async getUserTeams(userId: string): Promise<Team[]> {
    // Get teams from direct team memberships
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

    // Get teams from league memberships with assigned teams
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

    // Combine and deduplicate teams
    const allTeams = [
      ...teamMembershipResult.map(r => r.team),
      ...leagueMembershipResult.map(r => r.team)
    ];

    // Remove duplicates by team ID
    const uniqueTeams = allTeams.filter((team, index, arr) => 
      arr.findIndex(t => t.id === team.id) === index
    );

    return uniqueTeams;
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
    const [membership] = await db
      .update(leagueMemberships)
      .set({
        status: "approved",
        approvedAt: new Date(),
        approvedBy: approverId,
      })
      .where(eq(leagueMemberships.id, membershipId))
      .returning();
    return membership;
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

  async deleteLeagueMembership(membershipId: string): Promise<void> {
    // First, get the membership to find the user ID and team ID
    const [membership] = await db
      .select()
      .from(leagueMemberships)
      .where(eq(leagueMemberships.id, membershipId));
    
    if (!membership) {
      throw new Error('Membership not found');
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
        // Remove attendance records for these games
        await db
          .delete(gameAttendance)
          .where(
            and(
              eq(gameAttendance.userId, membership.userId),
              inArray(gameAttendance.gameId, gameIds)
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
    const result = await db
      .select()
      .from(teamMemberships)
      .innerJoin(users, eq(teamMemberships.userId, users.id))
      .where(
        and(
          eq(teamMemberships.teamId, teamId),
          eq(teamMemberships.status, "approved")
        )
      );
    return result.map(r => ({ ...r.team_memberships, user: r.users }));
  }

  // Game operations
  async createGame(game: InsertGame): Promise<Game> {
    const [newGame] = await db.insert(games).values(game).returning();
    return newGame;
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
    
    return gamesWithTeams;
  }

  async getGameById(gameId: string): Promise<(Game & { homeTeam: Team; awayTeam: Team }) | undefined> {
    const result = await db.execute(sql`
      SELECT 
        g.*,
        ht.id as home_team_id, ht.name as home_team_name, ht.logo_url as home_team_logo_url,
        ht.league_id as home_team_league_id, ht.season_id as home_team_season_id,
        ht.captain_id as home_team_captain_id, ht.wins as home_team_wins, ht.losses as home_team_losses,
        ht.ties as home_team_ties, ht.created_at as home_team_created_at, ht.updated_at as home_team_updated_at,
        at.id as away_team_id, at.name as away_team_name, at.logo_url as away_team_logo_url,
        at.league_id as away_team_league_id, at.season_id as away_team_season_id,
        at.captain_id as away_team_captain_id, at.wins as away_team_wins, at.losses as away_team_losses,
        at.ties as away_team_ties, at.created_at as away_team_created_at, at.updated_at as away_team_updated_at
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
      id: row.id,
      leagueId: row.league_id,
      seasonId: row.season_id,
      homeTeamId: row.home_team_id,
      awayTeamId: row.away_team_id,
      scheduledAt: row.scheduled_at,
      venue: row.venue,
      lockerRoom: row.locker_room,
      homeTeamLockerRoom: row.home_team_locker_room,
      awayTeamLockerRoom: row.away_team_locker_room,
      homeScore: row.home_score,
      awayScore: row.away_score,
      isCompleted: row.is_completed,
      homeBeverageDutyUserId: row.home_beverage_duty_user_id,
      homeBeverageDutyClaimedAt: row.home_beverage_duty_claimed_at,
      awayBeverageDutyUserId: row.away_beverage_duty_user_id,
      awayBeverageDutyClaimedAt: row.away_beverage_duty_claimed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      homeTeam: {
        id: row.home_team_id,
        name: row.home_team_name,
        logoUrl: row.home_team_logo_url,
        leagueId: row.home_team_league_id,
        seasonId: row.home_team_season_id,
        captainId: row.home_team_captain_id,
        wins: row.home_team_wins,
        losses: row.home_team_losses,
        ties: row.home_team_ties,
        createdAt: row.home_team_created_at,
        updatedAt: row.home_team_updated_at,
      },
      awayTeam: {
        id: row.away_team_id,
        name: row.away_team_name,
        logoUrl: row.away_team_logo_url,
        leagueId: row.away_team_league_id,
        seasonId: row.away_team_season_id,
        captainId: row.away_team_captain_id,
        wins: row.away_team_wins,
        losses: row.away_team_losses,
        ties: row.away_team_ties,
        createdAt: row.away_team_created_at,
        updatedAt: row.away_team_updated_at,
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
      .set({
        ...updates,
        updatedAt: new Date()
      })
      .where(eq(games.id, gameId))
      .returning();
    
    if (!updatedGame) {
      throw new Error(`Game with id ${gameId} not found`);
    }
    
    return updatedGame;
  }

  // Attendance operations
  async checkInToGame(gameId: string, userId: string, teamId: string): Promise<any> {
    const [attendance] = await db
      .insert(gameAttendance)
      .values({
        gameId,
        userId,
        teamId,
        status: 'checked_in',
        checkedInAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [gameAttendance.gameId, gameAttendance.userId],
        set: {
          status: 'checked_in',
          checkedInAt: new Date(),
          checkedOutAt: null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return attendance;
  }

  async checkOutFromGame(gameId: string, userId: string): Promise<any> {
    const [attendance] = await db
      .update(gameAttendance)
      .set({
        status: 'checked_out',
        checkedOutAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(gameAttendance.gameId, gameId),
          eq(gameAttendance.userId, userId)
        )
      )
      .returning();
    return attendance;
  }

  async getGameAttendance(gameId: string): Promise<any[]> {
    const attendance = await db
      .select()
      .from(gameAttendance)
      .innerJoin(users, eq(gameAttendance.userId, users.id))
      .where(eq(gameAttendance.gameId, gameId));
    
    return attendance.map(a => ({
      ...a.game_attendance,
      user: a.users
    }));
  }

  async getUserAttendanceStatus(gameId: string, userId: string): Promise<any | null> {
    const [attendance] = await db
      .select()
      .from(gameAttendance)
      .where(
        and(
          eq(gameAttendance.gameId, gameId),
          eq(gameAttendance.userId, userId)
        )
      );
    return attendance || null;
  }

  async getCaptainAttendanceOverview(userId: string): Promise<any[]> {
    // Get teams where user is captain
    const captainTeams = await db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(eq(teams.captainId, userId));

    // Get league memberships where user is captain
    const captainMemberships = await db
      .select({ 
        teamId: leagueMemberships.assignedTeamId,
        teamName: teams.name 
      })
      .from(leagueMemberships)
      .innerJoin(teams, eq(leagueMemberships.assignedTeamId, teams.id))
      .where(
        and(
          eq(leagueMemberships.userId, userId),
          eq(leagueMemberships.isCaptain, true)
        )
      );

    // Combine all teams where user is captain
    const allCaptainTeams = [
      ...captainTeams.map(t => ({ id: t.id, name: t.name })),
      ...captainMemberships.map(m => ({ id: m.teamId!, name: m.teamName }))
    ];

    const attendanceOverview = [];

    for (const team of allCaptainTeams) {
      // Get upcoming games for this team
      const upcomingGames = await this.getTeamGames(team.id);
      const upcomingOnly = upcomingGames.filter(game => new Date(game.scheduledAt) > new Date());

      for (const game of upcomingOnly.slice(0, 5)) { // Limit to next 5 games
        const attendance = await this.getGameAttendance(game.id);
        const checkedInCount = attendance.filter(a => a.status === 'checked_in').length;
        const checkedOutCount = attendance.filter(a => a.status === 'checked_out').length;
        const totalRoster = await this.getTeamMembers(team.id);
        
        attendanceOverview.push({
          gameId: game.id,
          teamId: team.id,
          teamName: team.name,
          opponent: game.homeTeam?.id === team.id ? game.awayTeam?.name : game.homeTeam?.name,
          scheduledAt: game.scheduledAt,
          checkedInCount,
          checkedOutCount,
          totalRoster: totalRoster.length,
          attendanceRate: totalRoster.length > 0 ? Math.round((checkedInCount / totalRoster.length) * 100) : 0
        });
      }
    }

    return attendanceOverview.sort((a, b) => 
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    );
  }

  async getUserAttendanceStatuses(userId: string): Promise<any[]> {
    const userTeams = await this.getUserTeams(userId);
    const statuses = [];

    for (const team of userTeams) {
      const games = await this.getTeamGames(team.id);
      const upcomingGames = games.filter(game => new Date(game.scheduledAt) > new Date());
      
      for (const game of upcomingGames.slice(0, 5)) {
        const attendance = await this.getUserAttendanceStatus(game.id, userId);
        statuses.push({
          gameId: game.id,
          teamId: team.id,
          status: attendance?.status || null,
          scheduledAt: game.scheduledAt
        });
      }
    }

    return statuses;
  }

  async getTeamGames(teamId: string): Promise<(Game & { homeTeam: Team; awayTeam: Team })[]> {
    const result = await db.execute(sql`
      SELECT 
        g.*,
        ht.id as home_team_id, ht.name as home_team_name, ht.logo_url as home_team_logo_url,
        ht.league_id as home_team_league_id, ht.season_id as home_team_season_id,
        ht.captain_id as home_team_captain_id, ht.wins as home_team_wins, ht.losses as home_team_losses,
        ht.ties as home_team_ties, ht.created_at as home_team_created_at, ht.updated_at as home_team_updated_at,
        at.id as away_team_id, at.name as away_team_name, at.logo_url as away_team_logo_url,
        at.league_id as away_team_league_id, at.season_id as away_team_season_id,
        at.captain_id as away_team_captain_id, at.wins as away_team_wins, at.losses as away_team_losses,
        at.ties as away_team_ties, at.created_at as away_team_created_at, at.updated_at as away_team_updated_at
      FROM games g
      INNER JOIN teams ht ON g.home_team_id = ht.id
      INNER JOIN teams at ON g.away_team_id = at.id
      WHERE g.home_team_id = ${teamId} OR g.away_team_id = ${teamId}
      ORDER BY g.scheduled_at DESC
    `);

    return result.rows.map((row: any) => ({
      id: row.id,
      leagueId: row.league_id,
      seasonId: row.season_id,
      homeTeamId: row.home_team_id,
      awayTeamId: row.away_team_id,
      scheduledAt: row.scheduled_at,
      venue: row.venue,
      homeScore: row.home_score,
      awayScore: row.away_score,
      isCompleted: row.is_completed,
      homeBeverageDutyUserId: row.home_beverage_duty_user_id,
      homeBeverageDutyClaimedAt: row.home_beverage_duty_claimed_at,
      awayBeverageDutyUserId: row.away_beverage_duty_user_id,
      awayBeverageDutyClaimedAt: row.away_beverage_duty_claimed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      homeTeam: {
        id: row.home_team_id,
        name: row.home_team_name,
        logoUrl: row.home_team_logo_url,
        leagueId: row.home_team_league_id,
        seasonId: row.home_team_season_id,
        captainId: row.home_team_captain_id,
        wins: row.home_team_wins,
        losses: row.home_team_losses,
        ties: row.home_team_ties,
        createdAt: row.home_team_created_at,
        updatedAt: row.home_team_updated_at,
      },
      awayTeam: {
        id: row.away_team_id,
        name: row.away_team_name,
        logoUrl: row.away_team_logo_url,
        leagueId: row.away_team_league_id,
        seasonId: row.away_team_season_id,
        captainId: row.away_team_captain_id,
        wins: row.away_team_wins,
        losses: row.away_team_losses,
        ties: row.away_team_ties,
        createdAt: row.away_team_created_at,
        updatedAt: row.away_team_updated_at,
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
        ht.ties as home_team_ties, ht.created_at as home_team_created_at, ht.updated_at as home_team_updated_at,
        at.id as away_team_id, at.name as away_team_name, at.logo_url as away_team_logo_url,
        at.league_id as away_team_league_id, at.season_id as away_team_season_id,
        at.captain_id as away_team_captain_id, at.wins as away_team_wins, at.losses as away_team_losses,
        at.ties as away_team_ties, at.created_at as away_team_created_at, at.updated_at as away_team_updated_at
      FROM games g
      INNER JOIN teams ht ON g.home_team_id = ht.id
      INNER JOIN teams at ON g.away_team_id = at.id
      WHERE g.league_id = ${leagueId}
      ORDER BY g.scheduled_at ASC
    `);

    return result.rows.map((row: any) => ({
      id: row.id,
      leagueId: row.league_id,
      seasonId: row.season_id,
      homeTeamId: row.home_team_id,
      awayTeamId: row.away_team_id,
      scheduledAt: row.scheduled_at,
      venue: row.venue,
      homeScore: row.home_score,
      awayScore: row.away_score,
      isCompleted: row.is_completed,
      homeBeverageDutyUserId: row.home_beverage_duty_user_id,
      homeBeverageDutyClaimedAt: row.home_beverage_duty_claimed_at,
      awayBeverageDutyUserId: row.away_beverage_duty_user_id,
      awayBeverageDutyClaimedAt: row.away_beverage_duty_claimed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      homeTeam: {
        id: row.home_team_id,
        name: row.home_team_name,
        logoUrl: row.home_team_logo_url,
        leagueId: row.home_team_league_id,
        seasonId: row.home_team_season_id,
        captainId: row.home_team_captain_id,
        wins: row.home_team_wins,
        losses: row.home_team_losses,
        ties: row.home_team_ties,
        createdAt: row.home_team_created_at,
        updatedAt: row.home_team_updated_at,
      },
      awayTeam: {
        id: row.away_team_id,
        name: row.away_team_name,
        logoUrl: row.away_team_logo_url,
        leagueId: row.away_team_league_id,
        seasonId: row.away_team_season_id,
        captainId: row.away_team_captain_id,
        wins: row.away_team_wins,
        losses: row.away_team_losses,
        ties: row.away_team_ties,
        createdAt: row.away_team_created_at,
        updatedAt: row.away_team_updated_at,
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
      // First delete all related attendance records
      console.log(`Deleting attendance records for game ${id}`);
      const deletedAttendance = await db.delete(gameAttendance).where(eq(gameAttendance.gameId, id));
      console.log(`Deleted ${deletedAttendance.rowCount || 0} attendance records`);
      
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
      // First delete all related attendance records for this team
      console.log(`Deleting attendance records for team ${teamId}`);
      const deletedAttendance = await db.delete(gameAttendance).where(eq(gameAttendance.teamId, teamId));
      console.log(`Deleted ${deletedAttendance.rowCount || 0} attendance records for team`);

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
}

export const storage = new DatabaseStorage();
