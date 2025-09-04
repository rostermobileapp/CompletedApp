import {
  users,
  leagues,
  seasons,
  teams,
  leagueMemberships,
  teamMemberships,
  games,
  messages,
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
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, ilike, or, gte, inArray, asc, alias } from "drizzle-orm";

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
  claimBeverageDuty(gameId: string, userId: string): Promise<Game>;
  
  // Message operations
  sendMessage(message: InsertMessage): Promise<Message>;
  getTeamMessages(teamId: string): Promise<(Message & { sender: User })[]>;
  getDirectMessages(userId1: string, userId2: string): Promise<(Message & { sender: User })[]>;
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

  async updatePlayerSkillRating(membershipId: string, skillRating: number): Promise<LeagueMembership> {
    const [membership] = await db
      .update(leagueMemberships)
      .set({ skillRating })
      .where(eq(leagueMemberships.id, membershipId))
      .returning();
    return membership;
  }

  async deleteLeagueMembership(membershipId: string): Promise<void> {
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

  async claimBeverageDuty(gameId: string, userId: string): Promise<Game> {
    const [updatedGame] = await db
      .update(games)
      .set({ 
        beverageDutyUserId: userId,
        beverageDutyClaimedAt: new Date()
      })
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
      createdAt: row.created_at,
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
      createdAt: row.created_at,
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
}

export const storage = new DatabaseStorage();
