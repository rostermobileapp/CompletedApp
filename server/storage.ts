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
  gameGoalies,
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
  playerStats,
  lineCombinations,
  lineCombinationAssignments,
  drafts,
  draftPicks,
  // New messaging tables
  conversations,
  conversationParticipants,
  messageAttachments,
  messageReadReceipts,
  typingIndicators,
  userOnlineStatus,
  // Chat polls tables
  chatPolls,
  chatPollVotes,
  feedbackSubmissions,
  paymentRequests,
  paymentRequestRecipients,
  // Facility tables
  facilities,
  facilityMemberships,
  calendarEvents,
  eventParticipants,
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
  type Conversation,
  type InsertConversation,
  type ConversationParticipant,
  type InsertConversationParticipant,
  type Message,
  type InsertMessage,
  type MessageAttachment,
  type InsertMessageAttachment,
  type MessageReadReceipt,
  type InsertMessageReadReceipt,
  type TypingIndicator,
  type InsertTypingIndicator,
  type UserOnlineStatus,
  type InsertUserOnlineStatus,
  type PlayerStats,
  type InsertPlayerStats,
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
  type LineCombination,
  type InsertLineCombination,
  type LineCombinationAssignment,
  type InsertLineCombinationAssignment,
  type LineCombinationWithAssignments,
  type LineAssignmentWithPlayer,
  type ChatPoll,
  type InsertChatPoll,
  type ChatPollVote,
  type InsertChatPollVote,
  type FeedbackSubmission,
  type InsertFeedbackSubmission,
  type PaymentRequest,
  type InsertPaymentRequest,
  type PaymentRequestRecipient,
  type InsertPaymentRequestRecipient,
  // Facility types
  type Facility,
  type InsertFacility,
  type FacilityMembership,
  type InsertFacilityMembership,
  type CalendarEvent,
  type InsertCalendarEvent,
  type EventParticipant,
  type InsertEventParticipant,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, ilike, or, gte, lte, inArray, asc, isNull, not } from "drizzle-orm";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserProfile(id: string, profileData: Partial<Pick<User, 'firstName' | 'lastName' | 'city' | 'age' | 'phoneNumber' | 'playerType'>>): Promise<User>;
  updateUserImage(id: string, profileImageUrl: string): Promise<User>;
  updateUserStripeInfo(id: string, stripeCustomerId: string, stripeSubscriptionId: string): Promise<User>;
  updateUserRole(id: string, role: 'commissioner' | 'secondary_commissioner' | 'player_pro' | 'free_tier'): Promise<User>;
  deleteUser(id: string): Promise<void>;
  
  // Permission management operations (global - deprecated, use league-specific instead)
  getAllUsers(): Promise<User[]>;
  getUsersByRole(role: 'commissioner' | 'secondary_commissioner' | 'player_pro' | 'free_tier'): Promise<User[]>;
  updateUserPermissions(userId: string, updates: { role?: 'commissioner' | 'secondary_commissioner' | 'player_pro' | 'free_tier'; specialPermissions?: ('admin' | 'stat_manager')[]; isPrimaryCommissioner?: boolean; }): Promise<User>;
  addSpecialPermission(userId: string, permission: 'admin' | 'stat_manager'): Promise<User>;
  removeSpecialPermission(userId: string, permission: 'admin' | 'stat_manager'): Promise<User>;
  
  // League-specific permission management operations
  getLeagueUsersWithPermissions(leagueId: string): Promise<(LeagueMembership & { user: User })[]>;
  updateLeagueUserPermissions(userId: string, leagueId: string, updates: { leagueRole?: 'commissioner' | 'secondary_commissioner' | 'player_pro' | 'free_tier'; leagueSpecialPermissions?: ('admin' | 'stat_manager')[]; }): Promise<LeagueMembership>;
  addLeagueSpecialPermission(userId: string, leagueId: string, permission: 'admin' | 'stat_manager'): Promise<LeagueMembership>;
  removeLeagueSpecialPermission(userId: string, leagueId: string, permission: 'admin' | 'stat_manager'): Promise<LeagueMembership>;
  getUserLeaguePermissions(userId: string, leagueId: string): Promise<{ leagueRole: string; leagueSpecialPermissions: string[] } | null>;
  
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
  updateTeam(id: string, data: Partial<Pick<Team, 'name'>>): Promise<Team>;
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
  getAllLeaguePlayersWithAvailability(date: Date, leagueId: string): Promise<(User & { skillLevel?: string | null; isScheduled: boolean })[]>;
  
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
  
  
  // Line combinations operations
  createLineCombination(lineCombination: InsertLineCombination): Promise<LineCombination>;
  getTeamLineCombinations(teamId: string, gameId?: string): Promise<LineCombinationWithAssignments[]>;
  getLineCombination(id: string): Promise<LineCombinationWithAssignments | undefined>;
  updateLineCombination(id: string, updates: Partial<LineCombination>): Promise<LineCombination>;
  deleteLineCombination(id: string): Promise<void>;
  
  // Line combination assignment operations
  createLineCombinationAssignment(assignment: InsertLineCombinationAssignment): Promise<LineCombinationAssignment>;
  updateLineCombinationAssignment(id: string, playerId: string): Promise<LineCombinationAssignment>;
  updateLineCombinationAssignmentPosition(id: string, position: string): Promise<LineCombinationAssignment>;
  bulkUpdateLineCombinationAssignments(updates: { id: string; playerId?: string; position?: string }[]): Promise<LineCombinationAssignment[]>;
  deleteLineCombinationAssignment(id: string): Promise<void>;
  deleteLineCombinationAssignmentsByLine(lineCombinationId: string): Promise<void>;
  getLineCombinationAssignments(lineCombinationId: string): Promise<LineAssignmentWithPlayer[]>;
  getLineCombinationAssignment(id: string): Promise<LineAssignmentWithPlayer | undefined>;
  
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
  
  // Chat poll operations
  createChatPoll(poll: InsertChatPoll): Promise<ChatPoll>;
  getChatPoll(pollId: string): Promise<ChatPoll | undefined>;
  voteOnChatPoll(vote: InsertChatPollVote): Promise<ChatPollVote>;
  getChatPollResults(pollId: string): Promise<(ChatPollVote & { user: User })[]>;
  getChatPollsByMessage(messageId: string): Promise<ChatPoll[]>;
  closeChatPoll(pollId: string): Promise<ChatPoll>;
  
  // Announcement visibility operations (for targeted announcements)
  createAnnouncementVisibility(announcementId: string, userIds: string[]): Promise<void>;
  getAnnouncementVisibility(announcementId: string): Promise<string[]>;
  isAnnouncementVisibleToUser(announcementId: string, userId: string): Promise<boolean>;
  
  // Bulk import operations
  createPlayerImport(importData: InsertPlayerImport): Promise<PlayerImport>;
  updatePlayerImport(importId: string, updates: Partial<InsertPlayerImport>): Promise<PlayerImport>;
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
  getScrimmageInvitesForUser(userId: string): Promise<(Scrimmage & { creator: User })[]>;
  
  // Player stats operations
  getPlayerStats(leagueId: string, seasonId?: string): Promise<(PlayerStats & { user: User })[]>;
  getPlayerStatsByUser(userId: string, leagueId: string, seasonId?: string): Promise<PlayerStats | undefined>;
  createPlayerStats(stats: InsertPlayerStats): Promise<PlayerStats>;
  updatePlayerStats(userId: string, leagueId: string, updates: Partial<Pick<InsertPlayerStats, 'gamesPlayed' | 'goals' | 'assists' | 'penaltyMinutes'>>, seasonId?: string): Promise<PlayerStats>;
  bulkUpdatePlayerStats(leagueId: string, statsUpdates: { userId: string; updates: Partial<Pick<InsertPlayerStats, 'gamesPlayed' | 'goals' | 'assists' | 'penaltyMinutes'>> }[], mode?: 'increment' | 'set', seasonId?: string): Promise<void>;
  
  // Player merge operations
  mergeUsersInLeague(leagueId: string, fromUserId: string, toUserId: string, preserveName?: boolean): Promise<LeagueMembership>;
  
  // Feedback operations
  createFeedbackSubmission(feedbackData: InsertFeedbackSubmission): Promise<FeedbackSubmission>;
  
  // Payment request operations
  createPaymentRequest(paymentRequest: InsertPaymentRequest, recipientUserIds: string[]): Promise<PaymentRequest>;
  getPaymentRequest(id: string): Promise<(PaymentRequest & { creator: User; recipients: (PaymentRequestRecipient & { user: User })[] }) | undefined>;
  getPaymentRequestsByCreator(creatorId: string): Promise<(PaymentRequest & { recipients: (PaymentRequestRecipient & { user: User })[] })[]>;
  getPaymentRequestsByRecipient(userId: string): Promise<(PaymentRequest & { creator: User; recipients: (PaymentRequestRecipient & { user: User })[] })[]>;
  getPaymentRequestsByScrimmage(scrimmageId: string): Promise<(PaymentRequest & { creator: User; recipients: (PaymentRequestRecipient & { user: User })[] })[]>;
  getPaymentRequestsByConversation(conversationId: string): Promise<(PaymentRequest & { creator: User; recipients: (PaymentRequestRecipient & { user: User })[] })[]>;
  updatePaymentRequestRecipient(recipientId: string, updates: { isPaid: boolean; paymentMethod?: 'venmo' | 'cashapp' | 'cash' | 'other' }): Promise<PaymentRequestRecipient>;
  confirmPaymentRequestRecipient(recipientId: string, isConfirmed: boolean): Promise<PaymentRequestRecipient>;
  deletePaymentRequest(id: string): Promise<void>;
  getUnpaidPaymentRequestCount(userId: string): Promise<number>;
  
  // User payment methods
  updateUserPaymentMethods(userId: string, paymentMethods: { venmoUsername?: string; cashappUsername?: string }): Promise<User>;
  
  // Facility operations
  createFacility(facility: InsertFacility): Promise<Facility>;
  getFacility(id: string): Promise<Facility | undefined>;
  getAllFacilities(options?: { sport?: string; city?: string; state?: string; search?: string }): Promise<Facility[]>;
  updateFacility(id: string, updates: Partial<InsertFacility>): Promise<Facility>;
  deleteFacility(id: string): Promise<void>;
  
  // Facility membership operations
  createFacilityMembership(membership: InsertFacilityMembership): Promise<FacilityMembership>;
  getFacilityMembership(id: string): Promise<FacilityMembership | undefined>;
  getUserFacilityMembership(userId: string, facilityId: string): Promise<FacilityMembership | undefined>;
  getUserFacilityMemberships(userId: string): Promise<(FacilityMembership & { facility: Facility })[]>;
  getFacilityMembers(facilityId: string): Promise<(FacilityMembership & { user: User })[]>;
  updateFacilityMembership(id: string, updates: Partial<InsertFacilityMembership>): Promise<FacilityMembership>;
  deleteFacilityMembership(id: string): Promise<void>;
  checkUserActiveFacilityMembership(userId: string, facilityId: string): Promise<boolean>;
  
  // Calendar event operations
  createCalendarEvent(event: InsertCalendarEvent): Promise<CalendarEvent>;
  getCalendarEvent(id: string): Promise<(CalendarEvent & { facility: Facility; creator: User }) | undefined>;
  getFacilityCalendarEvents(facilityId: string, options?: { sportId?: string; startDate?: Date; endDate?: Date }): Promise<(CalendarEvent & { creator: User; participantsCount: number })[]>;
  updateCalendarEvent(id: string, updates: Partial<InsertCalendarEvent>): Promise<CalendarEvent>;
  deleteCalendarEvent(id: string): Promise<void>;
  
  // Event participant operations
  createEventParticipant(participant: InsertEventParticipant): Promise<EventParticipant>;
  getEventParticipants(eventId: string): Promise<(EventParticipant & { user: User; facilityMembership: FacilityMembership })[]>;
  getUserEventParticipation(userId: string, eventId: string): Promise<EventParticipant | undefined>;
  updateEventParticipant(id: string, updates: Partial<InsertEventParticipant>): Promise<EventParticipant>;
  deleteEventParticipant(id: string): Promise<void>;
  checkInEventParticipant(id: string): Promise<EventParticipant>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }



  async updateUserProfile(id: string, profileData: Partial<Pick<User, 'firstName' | 'lastName' | 'city' | 'age' | 'phoneNumber' | 'playerType'>>): Promise<User> {
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

  async updateUserStripeInfo(id: string, stripeCustomerId: string, stripeSubscriptionId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        stripeCustomerId,
        stripeSubscriptionId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserRole(id: string, role: 'commissioner' | 'secondary_commissioner' | 'player_pro' | 'free_tier'): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        role,
        lastUpdated: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    // Get user details to check subscription status
    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user) {
      throw new Error("User not found");
    }

    // Check if user has an active paid subscription
    if (user.stripeSubscriptionId && user.role !== 'free_tier') {
      throw new Error("Cannot delete profile with an active subscription. Please cancel your subscription first.");
    }

    // Check if user is a commissioner of any leagues
    const ownedLeagues = await db.select().from(leagues).where(eq(leagues.commissionerId, id));
    if (ownedLeagues.length > 0) {
      throw new Error("Cannot delete profile while you are a commissioner of leagues. Please transfer your commissioner status to another user first.");
    }

    return await db.transaction(async (tx) => {
      // Delete all user-related data in order of dependencies
      
      // Delete messaging related data
      await tx.delete(typingIndicators).where(eq(typingIndicators.userId, id));
      await tx.delete(userOnlineStatus).where(eq(userOnlineStatus.userId, id));
      await tx.delete(messageReadReceipts).where(eq(messageReadReceipts.userId, id));
      await tx.delete(messageAttachments).where(
        sql`${messageAttachments.messageId} IN (SELECT id FROM ${messages} WHERE ${messages.senderId} = ${id})`
      );
      await tx.delete(messages).where(eq(messages.senderId, id));
      await tx.delete(conversationParticipants).where(eq(conversationParticipants.userId, id));
      
      // Delete payment requests
      await tx.delete(paymentRequestRecipients).where(eq(paymentRequestRecipients.userId, id));
      await tx.delete(paymentRequests).where(eq(paymentRequests.creatorId, id));
      
      // Delete feedback
      await tx.delete(feedbackSubmissions).where(eq(feedbackSubmissions.userId, id));
      
      // Delete announcement related data
      await tx.delete(announcementPollVotes).where(eq(announcementPollVotes.userId, id));
      await tx.delete(announcementReactions).where(eq(announcementReactions.userId, id));
      await tx.delete(announcementReadStatus).where(eq(announcementReadStatus.userId, id));
      await tx.delete(announcementVisibility).where(eq(announcementVisibility.userId, id));
      await tx.delete(announcements).where(eq(announcements.authorId, id));
      
      // Delete scrimmage related data
      await tx.delete(scrimmageRequests).where(eq(scrimmageRequests.playerId, id));
      await tx.delete(scrimmages).where(eq(scrimmages.creatorId, id));
      
      // Delete player stats
      await tx.delete(playerStats).where(eq(playerStats.userId, id));
      
      // Delete substitute requests and approvals
      await tx.delete(substitutionApprovals).where(eq(substitutionApprovals.approverId, id));
      await tx.delete(substituteRequests).where(eq(substituteRequests.originalPlayerId, id));
      await tx.delete(substituteRequests).where(eq(substituteRequests.substitutePlayerId, id));
      await tx.delete(substituteRequests).where(eq(substituteRequests.requestedBy, id));
      
      // Clear beverage duty assignments
      await tx.update(games).set({ homeBeverageDutyUserId: null }).where(eq(games.homeBeverageDutyUserId, id));
      await tx.update(games).set({ awayBeverageDutyUserId: null }).where(eq(games.awayBeverageDutyUserId, id));
      
      // Delete RSVPs
      await tx.delete(gameRsvps).where(eq(gameRsvps.userId, id));
      
      // Delete team and league memberships
      await tx.delete(teamMemberships).where(eq(teamMemberships.userId, id));
      await tx.delete(leagueMemberships).where(eq(leagueMemberships.userId, id));
      
      // Clear team captain assignments
      await tx.update(teams).set({ captainId: null }).where(eq(teams.captainId, id));
      
      // Finally, delete the user
      await tx.delete(users).where(eq(users.id, id));
    });
  }

  // Permission management operations
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(users.lastName, users.firstName);
  }

  async getUsersByRole(role: 'commissioner' | 'secondary_commissioner' | 'player_pro' | 'free_tier'): Promise<User[]> {
    return await db.select().from(users).where(eq(users.role, role)).orderBy(users.lastName, users.firstName);
  }

  async updateUserPermissions(
    userId: string, 
    updates: { 
      role?: 'commissioner' | 'secondary_commissioner' | 'player_pro' | 'free_tier'; 
      specialPermissions?: ('admin' | 'stat_manager')[]; 
      isPrimaryCommissioner?: boolean; 
    }
  ): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        ...updates,
        lastUpdated: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    
    if (!user) {
      throw new Error(`User with id ${userId} not found`);
    }
    return user;
  }

  async addSpecialPermission(userId: string, permission: 'admin' | 'stat_manager'): Promise<User> {
    return await db.transaction(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId));
      if (!user) throw new Error('User not found');
      
      const currentPermissions = user.specialPermissions || [];
      if (!currentPermissions.includes(permission)) {
        const updatedPermissions = [...currentPermissions, permission];
        const [updatedUser] = await tx
          .update(users)
          .set({
            specialPermissions: updatedPermissions,
            lastUpdated: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId))
          .returning();
        return updatedUser;
      }
      return user;
    });
  }

  async removeSpecialPermission(userId: string, permission: 'admin' | 'stat_manager'): Promise<User> {
    return await db.transaction(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId));
      if (!user) throw new Error('User not found');
      
      const currentPermissions = user.specialPermissions || [];
      const updatedPermissions = currentPermissions.filter(p => p !== permission);
      if (updatedPermissions.length !== currentPermissions.length) {
        const [updatedUser] = await tx
          .update(users)
          .set({
            specialPermissions: updatedPermissions,
            lastUpdated: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId))
          .returning();
        return updatedUser;
      }
      return user;
    });
  }

  // League-specific permission management operations
  async getLeagueUsersWithPermissions(leagueId: string): Promise<(LeagueMembership & { user: User })[]> {
    const result = await db
      .select()
      .from(leagueMemberships)
      .innerJoin(users, eq(leagueMemberships.userId, users.id))
      .where(
        and(
          eq(leagueMemberships.leagueId, leagueId),
          eq(leagueMemberships.status, "approved")
        )
      )
      .orderBy(users.lastName, users.firstName);
    
    return result.map(r => ({
      ...r.league_memberships,
      user: r.users
    }));
  }

  async updateLeagueUserPermissions(
    userId: string, 
    leagueId: string, 
    updates: { 
      leagueRole?: 'commissioner' | 'secondary_commissioner' | 'player_pro' | 'free_tier'; 
      leagueSpecialPermissions?: ('admin' | 'stat_manager')[]; 
    }
  ): Promise<LeagueMembership> {
    const [membership] = await db
      .update(leagueMemberships)
      .set(updates)
      .where(
        and(
          eq(leagueMemberships.userId, userId),
          eq(leagueMemberships.leagueId, leagueId)
        )
      )
      .returning();
    
    if (!membership) {
      throw new Error(`League membership not found for user ${userId} in league ${leagueId}`);
    }
    return membership;
  }

  async addLeagueSpecialPermission(userId: string, leagueId: string, permission: 'admin' | 'stat_manager'): Promise<LeagueMembership> {
    return await db.transaction(async (tx) => {
      const [membership] = await tx
        .select()
        .from(leagueMemberships)
        .where(
          and(
            eq(leagueMemberships.userId, userId),
            eq(leagueMemberships.leagueId, leagueId)
          )
        );
      
      if (!membership) throw new Error('League membership not found');
      
      const currentPermissions = membership.leagueSpecialPermissions || [];
      if (!currentPermissions.includes(permission)) {
        const updatedPermissions = [...currentPermissions, permission];
        const [updatedMembership] = await tx
          .update(leagueMemberships)
          .set({
            leagueSpecialPermissions: updatedPermissions,
          })
          .where(
            and(
              eq(leagueMemberships.userId, userId),
              eq(leagueMemberships.leagueId, leagueId)
            )
          )
          .returning();
        return updatedMembership;
      }
      return membership;
    });
  }

  async removeLeagueSpecialPermission(userId: string, leagueId: string, permission: 'admin' | 'stat_manager'): Promise<LeagueMembership> {
    return await db.transaction(async (tx) => {
      const [membership] = await tx
        .select()
        .from(leagueMemberships)
        .where(
          and(
            eq(leagueMemberships.userId, userId),
            eq(leagueMemberships.leagueId, leagueId)
          )
        );
      
      if (!membership) throw new Error('League membership not found');
      
      const currentPermissions = membership.leagueSpecialPermissions || [];
      const updatedPermissions = currentPermissions.filter(p => p !== permission);
      if (updatedPermissions.length !== currentPermissions.length) {
        const [updatedMembership] = await tx
          .update(leagueMemberships)
          .set({
            leagueSpecialPermissions: updatedPermissions,
          })
          .where(
            and(
              eq(leagueMemberships.userId, userId),
              eq(leagueMemberships.leagueId, leagueId)
            )
          )
          .returning();
        return updatedMembership;
      }
      return membership;
    });
  }

  async getUserLeaguePermissions(userId: string, leagueId: string): Promise<{ leagueRole: string; leagueSpecialPermissions: string[] } | null> {
    const [membership] = await db
      .select({
        leagueRole: leagueMemberships.leagueRole,
        leagueSpecialPermissions: leagueMemberships.leagueSpecialPermissions
      })
      .from(leagueMemberships)
      .where(
        and(
          eq(leagueMemberships.userId, userId),
          eq(leagueMemberships.leagueId, leagueId),
          eq(leagueMemberships.status, "approved")
        )
      );
    
    if (!membership) return null;
    
    return {
      leagueRole: membership.leagueRole || 'free_tier',
      leagueSpecialPermissions: membership.leagueSpecialPermissions || []
    };
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
    // Get leagues where user is a member
    const memberLeagues = await db
      .select({ league: leagues })
      .from(leagues)
      .innerJoin(leagueMemberships, eq(leagues.id, leagueMemberships.leagueId))
      .where(
        and(
          eq(leagueMemberships.userId, userId),
          eq(leagueMemberships.status, "approved")
        )
      );
    
    // Get leagues where user is the commissioner
    const commissionerLeagues = await db
      .select()
      .from(leagues)
      .where(eq(leagues.commissionerId, userId));
    
    // Combine and deduplicate
    const allLeagues = [
      ...memberLeagues.map(r => r.league),
      ...commissionerLeagues
    ];
    const uniqueLeagues = Array.from(new Map(allLeagues.map(league => [league.id, league])).values());
    
    return uniqueLeagues;
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
    // Get leagues where user is the primary commissioner
    const primaryCommissionerLeagues = await db
      .select()
      .from(leagues)
      .where(eq(leagues.commissionerId, commissionerId));
    
    // Get leagues where user is a co-commissioner (secondary_commissioner)
    const coCommissionerLeaguesRaw = await db
      .select()
      .from(leagueMemberships)
      .innerJoin(leagues, eq(leagues.id, leagueMemberships.leagueId))
      .where(
        and(
          eq(leagueMemberships.userId, commissionerId),
          eq(leagueMemberships.leagueRole, 'secondary_commissioner'),
          eq(leagueMemberships.status, 'approved')
        )
      );
    
    const coCommissionerLeagues = coCommissionerLeaguesRaw.map(r => r.leagues);
    
    // Combine and deduplicate (in case someone is both primary and co-commissioner)
    const allLeagues = [...primaryCommissionerLeagues, ...coCommissionerLeagues];
    const uniqueLeagues = Array.from(new Map(allLeagues.map(league => [league.id, league])).values());
    
    return uniqueLeagues;
  }

  async getCommissionerLeagues(userId: string): Promise<League[]> {
    // Get leagues where user is the primary commissioner
    const primaryCommissionerLeagues = await db
      .select()
      .from(leagues)
      .where(eq(leagues.commissionerId, userId));
    
    // Get leagues where user is a co-commissioner (secondary_commissioner)
    const coCommissionerLeaguesRaw = await db
      .select()
      .from(leagueMemberships)
      .innerJoin(leagues, eq(leagues.id, leagueMemberships.leagueId))
      .where(
        and(
          eq(leagueMemberships.userId, userId),
          eq(leagueMemberships.leagueRole, 'secondary_commissioner'),
          eq(leagueMemberships.status, 'approved')
        )
      );
    
    const coCommissionerLeagues = coCommissionerLeaguesRaw.map(r => r.leagues);
    
    // Combine and deduplicate (in case someone is both primary and co-commissioner)
    const allLeagues = [...primaryCommissionerLeagues, ...coCommissionerLeagues];
    const uniqueLeagues = Array.from(new Map(allLeagues.map(league => [league.id, league])).values());
    
    return uniqueLeagues;
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
    // Cascade deletion of all related data in the correct order to respect foreign key constraints
    
    // Get all teams in this league first (needed for some queries)
    const leagueTeams = await db.select({ id: teams.id }).from(teams).where(eq(teams.leagueId, id));
    const teamIds = leagueTeams.map(t => t.id);
    
    // Get all games in this league first (needed for some queries)
    const leagueGames = await db.select({ id: games.id }).from(games).where(eq(games.leagueId, id));
    const gameIds = leagueGames.map(g => g.id);
    
    // Get all seasons in this league first (needed for cleanup)
    const leagueSeasons = await db.select({ id: seasons.id }).from(seasons).where(eq(seasons.leagueId, id));
    const seasonIds = leagueSeasons.map(s => s.id);
    
    // 1. Delete chat poll votes and chat polls (depends on messages → conversations)
    const leagueConversationsForPolls = await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.leagueId, id));
    if (leagueConversationsForPolls.length > 0) {
      const conversationIdsForPolls = leagueConversationsForPolls.map(c => c.id);
      const conversationMessagesForPolls = await db.select({ id: messages.id }).from(messages).where(inArray(messages.conversationId, conversationIdsForPolls));
      if (conversationMessagesForPolls.length > 0) {
        const messageIdsForPolls = conversationMessagesForPolls.map(m => m.id);
        const leagueChatPolls = await db.select({ id: chatPolls.id }).from(chatPolls).where(inArray(chatPolls.messageId, messageIdsForPolls));
        if (leagueChatPolls.length > 0) {
          const pollIds = leagueChatPolls.map(p => p.id);
          // Delete chat poll votes
          await db.delete(chatPollVotes).where(inArray(chatPollVotes.pollId, pollIds));
          // Delete chat polls
          await db.delete(chatPolls).where(inArray(chatPolls.id, pollIds));
        }
      }
    }
    
    // 3. Delete announcement poll votes (depends on announcementPolls)
    const leagueAnnouncements = await db.select({ id: announcements.id }).from(announcements).where(eq(announcements.leagueId, id));
    if (leagueAnnouncements.length > 0) {
      const announcementIds = leagueAnnouncements.map(a => a.id);
      const leagueAnnouncementPolls = await db.select({ id: announcementPolls.id }).from(announcementPolls).where(inArray(announcementPolls.announcementId, announcementIds));
      if (leagueAnnouncementPolls.length > 0) {
        const announcementPollIds = leagueAnnouncementPolls.map(p => p.id);
        await db.delete(announcementPollVotes).where(inArray(announcementPollVotes.pollId, announcementPollIds));
      }
      
      // 4. Delete announcement polls
      await db.delete(announcementPolls).where(inArray(announcementPolls.announcementId, announcementIds));
      
      // 5. Delete announcement reactions
      await db.delete(announcementReactions).where(inArray(announcementReactions.announcementId, announcementIds));
      
      // 6. Delete announcement read status
      await db.delete(announcementReadStatus).where(inArray(announcementReadStatus.announcementId, announcementIds));
      
      // 7. Delete announcement visibility
      await db.delete(announcementVisibility).where(inArray(announcementVisibility.announcementId, announcementIds));
      
      // 8. Delete announcement attachments
      await db.delete(announcementAttachments).where(inArray(announcementAttachments.announcementId, announcementIds));
    }
    
    // 9. Delete announcements
    await db.delete(announcements).where(eq(announcements.leagueId, id));
    
    // 10. Delete message-related data (depends on conversations)
    const leagueConversations = await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.leagueId, id));
    if (leagueConversations.length > 0) {
      const conversationIds = leagueConversations.map(c => c.id);
      const conversationMessages = await db.select({ id: messages.id }).from(messages).where(inArray(messages.conversationId, conversationIds));
      if (conversationMessages.length > 0) {
        const messageIds = conversationMessages.map(m => m.id);
        
        // Delete message read receipts
        await db.delete(messageReadReceipts).where(inArray(messageReadReceipts.messageId, messageIds));
        
        // Delete message attachments
        await db.delete(messageAttachments).where(inArray(messageAttachments.messageId, messageIds));
      }
      
      // Delete messages
      await db.delete(messages).where(inArray(messages.conversationId, conversationIds));
      
      // Delete conversation participants
      await db.delete(conversationParticipants).where(inArray(conversationParticipants.conversationId, conversationIds));
    }
    
    // 11. Delete conversations
    await db.delete(conversations).where(eq(conversations.leagueId, id));
    
    // 12. Delete game-related data if there are games
    if (gameIds.length > 0) {
      // Delete substitution approvals (depends on substituteRequests)
      const gameSubRequests = await db.select({ id: substituteRequests.id }).from(substituteRequests).where(inArray(substituteRequests.gameId, gameIds));
      if (gameSubRequests.length > 0) {
        const subRequestIds = gameSubRequests.map(r => r.id);
        await db.delete(substitutionApprovals).where(inArray(substitutionApprovals.substitutionRequestId, subRequestIds));
      }
      
      // Delete substitute requests
      await db.delete(substituteRequests).where(inArray(substituteRequests.gameId, gameIds));
      
      // Delete game RSVPs
      await db.delete(gameRsvps).where(inArray(gameRsvps.gameId, gameIds));
      
      // Delete game score submissions
      await db.delete(gameScoreSubmissions).where(inArray(gameScoreSubmissions.gameId, gameIds));
      
      // Delete game goalies
      await db.delete(gameGoalies).where(inArray(gameGoalies.gameId, gameIds));
    }
    
    // 13. Delete player stats (depends on leagues, teams, games)
    await db.delete(playerStats).where(eq(playerStats.leagueId, id));
    
    // 14. Delete line combinations and assignments (depends on teams)
    if (teamIds.length > 0) {
      const teamLineCombinations = await db.select({ id: lineCombinations.id }).from(lineCombinations).where(inArray(lineCombinations.teamId, teamIds));
      if (teamLineCombinations.length > 0) {
        const lineCombinationIds = teamLineCombinations.map(lc => lc.id);
        await db.delete(lineCombinationAssignments).where(inArray(lineCombinationAssignments.lineCombinationId, lineCombinationIds));
      }
      await db.delete(lineCombinations).where(inArray(lineCombinations.teamId, teamIds));
    }
    
    // 15. Delete drafts and draft picks
    const leagueDrafts = await db.select({ id: drafts.id }).from(drafts).where(eq(drafts.leagueId, id));
    if (leagueDrafts.length > 0) {
      const draftIds = leagueDrafts.map(d => d.id);
      await db.delete(draftPicks).where(inArray(draftPicks.draftId, draftIds));
    }
    await db.delete(drafts).where(eq(drafts.leagueId, id));
    
    // 16. Delete scrimmage requests and scrimmages
    const leagueScrimmages = await db.select({ id: scrimmages.id }).from(scrimmages).where(eq(scrimmages.leagueId, id));
    if (leagueScrimmages.length > 0) {
      const scrimmageIds = leagueScrimmages.map(s => s.id);
      await db.delete(scrimmageRequests).where(inArray(scrimmageRequests.scrimmageId, scrimmageIds));
    }
    await db.delete(scrimmages).where(eq(scrimmages.leagueId, id));
    
    // 17. Delete player imports and related data
    const leaguePlayerImports = await db.select({ id: playerImports.id }).from(playerImports).where(eq(playerImports.leagueId, id));
    if (leaguePlayerImports.length > 0) {
      const importIds = leaguePlayerImports.map(pi => pi.id);
      
      // Get imported players for this import
      const leagueImportedPlayers = await db.select({ id: importedPlayers.id }).from(importedPlayers).where(inArray(importedPlayers.importId, importIds));
      if (leagueImportedPlayers.length > 0) {
        const importedPlayerIds = leagueImportedPlayers.map(ip => ip.id);
        // Delete player merge requests
        await db.delete(playerMergeRequests).where(inArray(playerMergeRequests.importedPlayerId, importedPlayerIds));
      }
      
      // Delete imported players
      await db.delete(importedPlayers).where(inArray(importedPlayers.importId, importIds));
    }
    await db.delete(playerImports).where(eq(playerImports.leagueId, id));
    
    // 18. Delete schedule imports and related data
    const leagueScheduleImports = await db.select({ id: scheduleImports.id }).from(scheduleImports).where(eq(scheduleImports.leagueId, id));
    if (leagueScheduleImports.length > 0) {
      const scheduleImportIds = leagueScheduleImports.map(si => si.id);
      await db.delete(importedSchedules).where(inArray(importedSchedules.importId, scheduleImportIds));
    }
    await db.delete(scheduleImports).where(eq(scheduleImports.leagueId, id));
    
    // 19. Delete games
    if (gameIds.length > 0) {
      await db.delete(games).where(inArray(games.id, gameIds));
    }
    
    // 20. Delete team memberships (depends on teams)
    if (teamIds.length > 0) {
      await db.delete(teamMemberships).where(inArray(teamMemberships.teamId, teamIds));
    }
    
    // 21. Clear assignedTeamId references in league memberships before deleting teams
    if (teamIds.length > 0) {
      await db.update(leagueMemberships)
        .set({ assignedTeamId: null })
        .where(
          and(
            eq(leagueMemberships.leagueId, id),
            inArray(leagueMemberships.assignedTeamId, teamIds)
          )
        );
    }
    
    // 22. Delete teams
    if (teamIds.length > 0) {
      await db.delete(teams).where(inArray(teams.id, teamIds));
    }
    
    // 23. Delete seasons
    if (seasonIds.length > 0) {
      await db.delete(seasons).where(inArray(seasons.id, seasonIds));
    }
    
    // 24. Delete league memberships
    await db.delete(leagueMemberships).where(eq(leagueMemberships.leagueId, id));
    
    // 25. Finally, delete the league itself
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
    
    // Update captain chat membership for this league
    if (team.leagueId) {
      const { MessagingService } = await import('./messagingService');
      const messagingService = new MessagingService();
      await messagingService.ensureCaptainChatMembership(team.leagueId);
    }
    
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

  async updateTeam(id: string, data: Partial<Pick<Team, 'name'>>): Promise<Team> {
    const [team] = await db
      .update(teams)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(teams.id, id))
      .returning();
    return team;
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
      scrimmageTitle: scrimmage.title,
      resultType: null
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
      resultType: row.result_type as "regulation" | "overtime" | "shootout" | null,
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
      resultType: row.result_type as "regulation" | "overtime" | "shootout" | null,
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
      resultType: row.result_type as "regulation" | "overtime" | "shootout" | null,
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
    // Legacy method - messaging now uses conversations system
    return [];
  }

  async getDirectMessages(userId1: string, userId2: string): Promise<(Message & { sender: User })[]> {
    // Legacy method - messaging now uses conversations system
    return [];
  }

  // Bulk import operations
  async createPlayerImport(importData: InsertPlayerImport): Promise<PlayerImport> {
    const [playerImport] = await db
      .insert(playerImports)
      .values(importData)
      .returning();
    return playerImport;
  }

  async updatePlayerImport(importId: string, updates: Partial<InsertPlayerImport>): Promise<PlayerImport> {
    const [updatedImport] = await db
      .update(playerImports)
      .set(updates)
      .where(eq(playerImports.id, importId))
      .returning();
    return updatedImport;
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
    const allMatches = await db.select()
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
    
    const seen = new Map<string, ImportedPlayer>();
    for (const match of allMatches) {
      const key = `${(match.firstName || '').toLowerCase()}-${(match.lastName || '').toLowerCase()}-${(match.teamName || '').toLowerCase()}`;
      if (!seen.has(key)) {
        seen.set(key, match);
      }
    }
    
    return Array.from(seen.values());
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
    const uniqueUserIds = Array.from(new Set(allUserIds));
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
    const uniqueUserIds = Array.from(new Set(allUserIds));
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

  async getAllLeaguePlayersWithAvailability(date: Date, leagueId: string): Promise<(User & { skillLevel?: string | null; isScheduled: boolean })[]> {
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

    // Get all users
    const allUsers = leagueMembers.map(member => member.user);
    
    // Fetch skill levels for all users
    const userIds = allUsers.map(user => user.id);
    const skillMap = await this.fetchUserSkills(userIds, leagueId);
    
    // Return all users with skill level and scheduled status
    return allUsers.map(user => ({
      ...user,
      skillLevel: skillMap.get(user.id) ?? null,
      isScheduled: scheduledUserIds.has(user.id)
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
      // Commissioners can approve/deny at any pending stage (pending_opponent_approval or pending_commissioner_approval)
      // Other approvers must match the expected status
      if (approverType === 'commissioner') {
        // Commissioner can act on either pending_opponent_approval or pending_commissioner_approval
        if (request.status !== 'pending_opponent_approval' && request.status !== 'pending_commissioner_approval') {
          throw new Error(`Invalid workflow state: request is ${request.status}, commissioners can only act on pending_opponent_approval or pending_commissioner_approval`);
        }
      } else {
        // For opposing_captain and substitute_player, enforce strict status matching
        const expectedStatus = this.getExpectedStatusForApproverType(approverType);
        if (request.status !== expectedStatus) {
          throw new Error(`Invalid workflow state: request is ${request.status}, expected ${expectedStatus} for ${approverType}`);
        }
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
        // Commissioners can approve at either pending_opponent_approval or pending_commissioner_approval
        if (currentStatus !== 'pending_opponent_approval' && currentStatus !== 'pending_commissioner_approval') {
          throw new Error(`Invalid transition: cannot process commissioner approval from status ${currentStatus}`);
        }
        // When commissioner approves, move to pending_substitute_approval
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

    // Build team-based filter condition
    // Logic: Show commissioner posts (teamId is null) to everyone, and team captain posts only to their team members or the captain themselves
    const teamFilter = userId ? sql`(
      ${announcements.teamId} IS NULL
      OR 
      EXISTS (
        SELECT 1 FROM ${teamMemberships} tm 
        WHERE tm.team_id = ${announcements.teamId} 
        AND tm.user_id = ${userId}
        AND tm.status = 'approved'
      )
      OR
      EXISTS (
        SELECT 1 FROM ${teams} t 
        WHERE t.id = ${announcements.teamId} 
        AND t.captain_id = ${userId}
      )
    )` : sql`1=1`; // If no userId provided, show all (for commissioner access)

    // Build scrimmage date filter condition
    // Logic: Hide scrimmage announcements if the associated scrimmage date has passed
    const scrimmageFilter = sql`(
      NOT EXISTS (
        SELECT 1 FROM ${scrimmages} s 
        WHERE s.announcement_id = ${announcements.id}
        AND s.date_time < NOW()
      )
    )`;

    // First get the total count with visibility, team, and scrimmage filtering
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(announcements)
      .where(and(
        eq(announcements.leagueId, leagueId),
        visibilityFilter,
        teamFilter,
        scrimmageFilter
      ));
    
    const total = countResult.count;
    
    // Build paginated announcement query
    const baseQuery = db
      .select()
      .from(announcements)
      .where(and(
        eq(announcements.leagueId, leagueId),
        visibilityFilter,
        teamFilter,
        scrimmageFilter
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
    // Delete all associated data first to prevent foreign key constraint violations
    await db.delete(announcementAttachments).where(eq(announcementAttachments.announcementId, id));
    await db.delete(announcementReactions).where(eq(announcementReactions.announcementId, id));
    await db.delete(announcementReadStatus).where(eq(announcementReadStatus.announcementId, id));
    await db.delete(announcementVisibility).where(eq(announcementVisibility.announcementId, id));
    
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

  // Chat poll operations
  async createChatPoll(poll: InsertChatPoll): Promise<ChatPoll> {
    const [newPoll] = await db.insert(chatPolls).values(poll).returning();
    return newPoll;
  }

  async getChatPoll(pollId: string): Promise<ChatPoll | undefined> {
    const [poll] = await db
      .select()
      .from(chatPolls)
      .where(eq(chatPolls.id, pollId))
      .limit(1);
    return poll;
  }

  async voteOnChatPoll(vote: InsertChatPollVote): Promise<ChatPollVote> {
    const [newVote] = await db.insert(chatPollVotes).values(vote).returning();
    return newVote;
  }

  async getChatPollResults(pollId: string): Promise<(ChatPollVote & { user: User })[]> {
    const results = await db
      .select()
      .from(chatPollVotes)
      .innerJoin(users, eq(chatPollVotes.userId, users.id))
      .where(eq(chatPollVotes.pollId, pollId));
    
    return results.map(r => ({ ...r.chat_poll_votes, user: r.users }));
  }

  async getChatPollsByMessage(messageId: string): Promise<ChatPoll[]> {
    return await db
      .select()
      .from(chatPolls)
      .where(eq(chatPolls.messageId, messageId));
  }

  async closeChatPoll(pollId: string): Promise<ChatPoll> {
    const [closedPoll] = await db
      .update(chatPolls)
      .set({ status: "closed" })
      .where(eq(chatPolls.id, pollId))
      .returning();
    return closedPoll;
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
    
    const count = Number(visibilityCount[0]?.count || 0);
    
    // If no visibility records exist, announcement is visible to all league members (default behavior)
    if (count === 0) {
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

  async getScrimmageInvitesForUser(userId: string): Promise<(Scrimmage & { creator: User })[]> {
    // Get scrimmages where user is invited (has announcement visibility) but hasn't responded yet
    const results = await db
      .select({
        scrimmage: scrimmages,
        creator: users,
      })
      .from(announcementVisibility)
      .innerJoin(announcements, eq(announcementVisibility.announcementId, announcements.id))
      .innerJoin(scrimmages, eq(announcements.id, scrimmages.announcementId))
      .innerJoin(users, eq(scrimmages.creatorId, users.id))
      .where(
        and(
          eq(announcementVisibility.userId, userId),
          gte(scrimmages.dateTime, new Date()), // Only future scrimmages
          // Only get scrimmages where user hasn't responded yet (no scrimmage request exists)
          not(
            sql`EXISTS (
              SELECT 1 FROM ${scrimmageRequests} 
              WHERE ${scrimmageRequests.scrimmageId} = ${scrimmages.id} 
              AND ${scrimmageRequests.playerId} = ${userId}
            )`
          )
        )
      )
      .orderBy(asc(scrimmages.dateTime));

    return results.map(r => ({
      ...r.scrimmage,
      creator: r.creator
    }));
  }

  // Player stats operations
  async getPlayerStats(leagueId: string, seasonId?: string, playerType?: 'goalies' | 'non-goalies'): Promise<(PlayerStats & { user: User; isGoalie: boolean })[]> {
    // Build conditions for stats table join
    let statsConditions = [eq(playerStats.leagueId, leagueId)];
    
    // Only filter by season if a specific seasonId is provided
    // If no seasonId is provided, return stats from all seasons
    if (seasonId) {
      statsConditions.push(eq(playerStats.seasonId, seasonId));
    }
    
    // Get all approved league members and LEFT JOIN with their stats
    const result = await db
      .select({
        // User info
        userId: users.id,
        userEmail: users.email,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        userProfileImageUrl: users.profileImageUrl,
        userAge: users.age,
        userPhoneNumber: users.phoneNumber,
        userCity: users.city,
        userPrimarySport: users.primarySport,
        userPlayerType: users.playerType,
        userCreatedAt: users.createdAt,
        userUpdatedAt: users.updatedAt,
        // New permission fields
        userRole: users.role,
        userSpecialPermissions: users.specialPermissions,
        userIsPrimaryCommissioner: users.isPrimaryCommissioner,
        userCreatedBy: users.createdBy,
        userLastUpdated: users.lastUpdated,
        
        // Membership info
        membershipIsGoalie: leagueMemberships.isGoalie,
        
        // Stats info (will be null if player has no stats)
        statsId: playerStats.id,
        statsLeagueId: playerStats.leagueId,
        statsSeasonId: playerStats.seasonId,
        statsUserId: playerStats.userId,
        statsGamesPlayed: playerStats.gamesPlayed,
        statsGoals: playerStats.goals,
        statsAssists: playerStats.assists,
        statsPenaltyMinutes: playerStats.penaltyMinutes,
        statsCreatedAt: playerStats.createdAt,
        statsUpdatedAt: playerStats.updatedAt,
      })
      .from(leagueMemberships)
      .innerJoin(users, eq(leagueMemberships.userId, users.id))
      .leftJoin(playerStats, and(
        eq(playerStats.userId, users.id),
        ...statsConditions
      ))
      .where(
        and(
          eq(leagueMemberships.leagueId, leagueId),
          eq(leagueMemberships.status, "approved"),
          // Filter by player type if specified
          ...(playerType === 'goalies' ? [eq(leagueMemberships.isGoalie, true)] : []),
          ...(playerType === 'non-goalies' ? [eq(leagueMemberships.isGoalie, false)] : [])
        )
      )
      .orderBy(desc(sql`COALESCE(${playerStats.goals}, 0) + COALESCE(${playerStats.assists}, 0)`)); // Order by points (goals + assists)
    
    return result.map(r => ({
      // If player has stats, use them; otherwise use default zero values
      id: r.statsId || `${r.userId}-${leagueId}-${seasonId || 'null'}`,
      leagueId: leagueId,
      seasonId: seasonId || null,
      userId: r.userId,
      gamesPlayed: r.statsGamesPlayed || 0,
      goals: r.statsGoals || 0,
      assists: r.statsAssists || 0,
      penaltyMinutes: r.statsPenaltyMinutes || 0,
      createdAt: r.statsCreatedAt || new Date(),
      updatedAt: r.statsUpdatedAt || new Date(),
      isGoalie: r.membershipIsGoalie || false,
      user: {
        id: r.userId,
        email: r.userEmail,
        firstName: r.userFirstName,
        lastName: r.userLastName,
        profileImageUrl: r.userProfileImageUrl,
        age: r.userAge,
        phoneNumber: r.userPhoneNumber,
        city: r.userCity,
        primarySport: r.userPrimarySport,
        playerType: r.userPlayerType,
        createdAt: r.userCreatedAt,
        updatedAt: r.userUpdatedAt,
        // New permission fields
        role: r.userRole,
        specialPermissions: r.userSpecialPermissions,
        isPrimaryCommissioner: r.userIsPrimaryCommissioner,
        createdBy: r.userCreatedBy,
        lastUpdated: r.userLastUpdated,
        dateOfBirth: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        venmoUsername: null,
        cashappUsername: null,
      }
    }));
  }

  async getPlayerStatsByUser(userId: string, leagueId: string, seasonId?: string): Promise<PlayerStats | undefined> {
    let conditions = [
      eq(playerStats.userId, userId),
      eq(playerStats.leagueId, leagueId)
    ];
    
    // Consistent season handling: undefined means non-seasonal stats (null seasonId)
    if (seasonId) {
      conditions.push(eq(playerStats.seasonId, seasonId));
    } else {
      conditions.push(isNull(playerStats.seasonId));
    }
    
    const [stats] = await db
      .select()
      .from(playerStats)
      .where(and(...conditions));
    
    return stats;
  }

  async createPlayerStats(stats: InsertPlayerStats): Promise<PlayerStats> {
    const [newStats] = await db
      .insert(playerStats)
      .values(stats)
      .returning();
    
    return newStats;
  }

  async updatePlayerStats(userId: string, leagueId: string, updates: Partial<Pick<InsertPlayerStats, 'gamesPlayed' | 'goals' | 'assists' | 'penaltyMinutes'>>, seasonId?: string): Promise<PlayerStats> {
    let conditions = [
      eq(playerStats.userId, userId),
      eq(playerStats.leagueId, leagueId)
    ];
    
    // Consistent season handling
    if (seasonId) {
      conditions.push(eq(playerStats.seasonId, seasonId));
    } else {
      conditions.push(isNull(playerStats.seasonId));
    }
    
    // First try to update existing record
    const [updatedStats] = await db
      .update(playerStats)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(and(...conditions))
      .returning();
    
    if (!updatedStats) {
      // If no record was updated, create a new one (UPSERT behavior)
      const [newStats] = await db
        .insert(playerStats)
        .values({
          userId,
          leagueId,
          seasonId: seasonId || null,
          gamesPlayed: 0,
          goals: 0,
          assists: 0,
          penaltyMinutes: 0,
          ...updates,
        })
        .returning();
      return newStats;
    }
    
    return updatedStats;
  }

  async bulkUpdatePlayerStats(leagueId: string, statsUpdates: { userId: string; updates: Partial<Pick<InsertPlayerStats, 'gamesPlayed' | 'goals' | 'assists' | 'penaltyMinutes'>> }[], mode: 'increment' | 'set' = 'set', seasonId?: string): Promise<void> {
    await db.transaction(async (tx) => {
      for (const { userId, updates } of statsUpdates) {
        let conditions = [
          eq(playerStats.userId, userId),
          eq(playerStats.leagueId, leagueId)
        ];
        
        // Consistent season handling
        if (seasonId) {
          conditions.push(eq(playerStats.seasonId, seasonId));
        } else {
          conditions.push(isNull(playerStats.seasonId));
        }
        
        // Try to update existing record first
        let updateData: any = { updatedAt: new Date() };
        
        if (mode === 'increment') {
          // For increment mode, add to existing values
          if (updates.goals !== undefined) updateData.goals = sql`${playerStats.goals} + ${updates.goals}`;
          if (updates.assists !== undefined) updateData.assists = sql`${playerStats.assists} + ${updates.assists}`;
          if (updates.penaltyMinutes !== undefined) updateData.penaltyMinutes = sql`${playerStats.penaltyMinutes} + ${updates.penaltyMinutes}`;
          if (updates.gamesPlayed !== undefined) updateData.gamesPlayed = sql`${playerStats.gamesPlayed} + ${updates.gamesPlayed}`;
        } else {
          // For set mode, replace values directly
          updateData = { ...updates, updatedAt: new Date() };
        }
        
        const result = await tx
          .update(playerStats)
          .set(updateData)
          .where(and(...conditions))
          .returning();
        
        // If no record was updated, create a new one (UPSERT behavior)
        if (result.length === 0) {
          await tx
            .insert(playerStats)
            .values({
              userId,
              leagueId,
              seasonId: seasonId || null,
              gamesPlayed: 0,
              goals: 0,
              assists: 0,
              penaltyMinutes: 0,
              ...updates,
            });
        }
      }
    });
  }

  // Goalie stats operations
  async getGoalieStats(leagueId: string, seasonId?: string): Promise<Array<{
    userId: string;
    gamesPlayed: number;
    wins: number;
    losses: number;
    ties: number;
    shootoutLosses: number;
    goalsAgainst: number;
    goalsAgainstAverage: number;
    user: User;
    teamId?: string;
  }>> {
    // Build season conditions
    let gameSeasonConditions = [];
    if (seasonId) {
      gameSeasonConditions.push(eq(games.seasonId, seasonId));
    } else {
      gameSeasonConditions.push(isNull(games.seasonId));
    }

    // Get individual goalie stats from gameGoalies table with game result information
    const goalieGameStats = await db
      .select({
        userId: gameGoalies.goalieUserId,
        teamId: gameGoalies.teamId,
        gameId: gameGoalies.gameId,
        goalsAgainst: gameGoalies.goalsAgainst,
        minutesPlayed: gameGoalies.minutesPlayed,
        homeTeamId: games.homeTeamId,
        awayTeamId: games.awayTeamId,
        homeScore: games.homeScore,
        awayScore: games.awayScore,
        resultType: games.resultType,
        userEmail: users.email,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        userProfileImageUrl: users.profileImageUrl,
        userAge: users.age,
        userPhoneNumber: users.phoneNumber,
        userCity: users.city,
        userPrimarySport: users.primarySport,
        userPlayerType: users.playerType,
        userCreatedAt: users.createdAt,
        userUpdatedAt: users.updatedAt,
        // New permission fields
        userRole: users.role,
        userSpecialPermissions: users.specialPermissions,
        userIsPrimaryCommissioner: users.isPrimaryCommissioner,
        userCreatedBy: users.createdBy,
        userLastUpdated: users.lastUpdated,
      })
      .from(gameGoalies)
      .innerJoin(games, eq(gameGoalies.gameId, games.id))
      .innerJoin(users, eq(gameGoalies.goalieUserId, users.id))
      .where(
        and(
          eq(games.leagueId, leagueId),
          eq(games.isCompleted, true),
          ...gameSeasonConditions
        )
      );

    // Group stats by goalie userId
    const goalieStatsMap = new Map<string, {
      userId: string;
      gamesPlayed: number;
      wins: number;
      losses: number;
      ties: number;
      shootoutLosses: number;
      goalsAgainst: number;
      totalMinutes: number;
      teamId?: string;
      user: User;
    }>();

    goalieGameStats.forEach(gameStat => {
      const goalieId = gameStat.userId;
      
      if (!goalieStatsMap.has(goalieId)) {
        goalieStatsMap.set(goalieId, {
          userId: goalieId,
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          ties: 0,
          shootoutLosses: 0,
          goalsAgainst: 0,
          totalMinutes: 0,
          teamId: gameStat.teamId,
          user: {
            id: goalieId,
            email: gameStat.userEmail,
            firstName: gameStat.userFirstName,
            lastName: gameStat.userLastName,
            profileImageUrl: gameStat.userProfileImageUrl,
            age: gameStat.userAge,
            phoneNumber: gameStat.userPhoneNumber,
            city: gameStat.userCity,
            primarySport: gameStat.userPrimarySport,
            playerType: gameStat.userPlayerType,
            createdAt: gameStat.userCreatedAt,
            updatedAt: gameStat.userUpdatedAt,
            // New permission fields
            role: gameStat.userRole,
            specialPermissions: gameStat.userSpecialPermissions,
            isPrimaryCommissioner: gameStat.userIsPrimaryCommissioner,
            createdBy: gameStat.userCreatedBy,
            lastUpdated: gameStat.userLastUpdated,
            dateOfBirth: null,
            stripeCustomerId: null,
            stripeSubscriptionId: null,
            venmoUsername: null,
            cashappUsername: null,
          }
        });
      }

      const goalieStats = goalieStatsMap.get(goalieId)!;
      
      // Update games played and minutes
      goalieStats.gamesPlayed++;
      goalieStats.goalsAgainst += gameStat.goalsAgainst || 0;
      goalieStats.totalMinutes += gameStat.minutesPlayed || 0;
      
      // Determine game result for this goalie's team
      const isHomeTeam = gameStat.homeTeamId === gameStat.teamId;
      const teamScore = isHomeTeam ? (gameStat.homeScore || 0) : (gameStat.awayScore || 0);
      const opponentScore = isHomeTeam ? (gameStat.awayScore || 0) : (gameStat.homeScore || 0);
      
      if (teamScore > opponentScore) {
        goalieStats.wins++;
      } else if (teamScore < opponentScore) {
        if (gameStat.resultType === 'shootout') {
          goalieStats.shootoutLosses++;
        } else {
          goalieStats.losses++;
        }
      } else {
        goalieStats.ties++;
      }
    });

    // Convert to final format with proper GAA calculation
    const finalStats = Array.from(goalieStatsMap.values()).map(stats => ({
      userId: stats.userId,
      gamesPlayed: stats.gamesPlayed,
      wins: stats.wins,
      losses: stats.losses,
      ties: stats.ties,
      shootoutLosses: stats.shootoutLosses,
      goalsAgainst: stats.goalsAgainst,
      // GAA = (goals against * 60) / minutes played (standard hockey GAA calculation)
      goalsAgainstAverage: stats.totalMinutes > 0 ? 
        parseFloat(((stats.goalsAgainst * 60) / stats.totalMinutes).toFixed(2)) : 0.00,
      teamId: stats.teamId,
      user: stats.user
    }));

    // Sort by wins (descending), then by goals against average (ascending)
    return finalStats.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return a.goalsAgainstAverage - b.goalsAgainstAverage;
    });
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

      for (const [, rsvpsForGame] of Array.from(rsvpConflicts)) {
        const fromRsvp = rsvpsForGame.find((r: any) => r.game_rsvps.userId === fromUserId);
        const toRsvp = rsvpsForGame.find((r: any) => r.game_rsvps.userId === toUserId);
        
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

      // Legacy message updates removed - messaging now uses conversations system

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

  // Line combinations operations
  async createLineCombination(lineCombination: InsertLineCombination): Promise<LineCombination> {
    const [newLineCombination] = await db
      .insert(lineCombinations)
      .values(lineCombination)
      .returning();
    return newLineCombination;
  }

  async getTeamLineCombinations(teamId: string, gameId?: string): Promise<LineCombinationWithAssignments[]> {
    const whereCondition = gameId 
      ? and(eq(lineCombinations.teamId, teamId), eq(lineCombinations.gameId, gameId))
      : and(eq(lineCombinations.teamId, teamId), isNull(lineCombinations.gameId));

    const result = await db
      .select({
        lineCombination: lineCombinations,
        assignment: lineCombinationAssignments,
        user: users,
      })
      .from(lineCombinations)
      .leftJoin(lineCombinationAssignments, eq(lineCombinations.id, lineCombinationAssignments.lineCombinationId))
      .leftJoin(users, eq(lineCombinationAssignments.playerId, users.id))
      .where(whereCondition)
      .orderBy(
        asc(lineCombinations.lineType),
        asc(lineCombinations.lineNumber),
        asc(lineCombinationAssignments.position)
      );

    // Group by line combination and structure the result
    const lineCombinationsMap = new Map<string, LineCombinationWithAssignments>();
    
    for (const row of result) {
      const lineId = row.lineCombination.id;
      
      if (!lineCombinationsMap.has(lineId)) {
        lineCombinationsMap.set(lineId, {
          ...row.lineCombination,
          assignments: [],
        });
      }
      
      if (row.assignment && row.user) {
        lineCombinationsMap.get(lineId)!.assignments.push({
          ...row.assignment,
          player: row.user,
        });
      }
    }
    
    return Array.from(lineCombinationsMap.values());
  }

  async getLineCombination(id: string): Promise<LineCombinationWithAssignments | undefined> {
    const result = await db
      .select({
        lineCombination: lineCombinations,
        assignment: lineCombinationAssignments,
        user: users,
      })
      .from(lineCombinations)
      .leftJoin(lineCombinationAssignments, eq(lineCombinations.id, lineCombinationAssignments.lineCombinationId))
      .leftJoin(users, eq(lineCombinationAssignments.playerId, users.id))
      .where(eq(lineCombinations.id, id))
      .orderBy(asc(lineCombinationAssignments.position));

    if (result.length === 0) return undefined;

    const lineWithAssignments: LineCombinationWithAssignments = {
      ...result[0].lineCombination,
      assignments: result
        .filter(row => row.assignment && row.user)
        .map(row => ({
          ...row.assignment!,
          player: row.user!,
        })),
    };

    return lineWithAssignments;
  }

  async updateLineCombination(id: string, updates: Partial<LineCombination>): Promise<LineCombination> {
    const [lineCombination] = await db
      .update(lineCombinations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(lineCombinations.id, id))
      .returning();
    return lineCombination;
  }

  async deleteLineCombination(id: string): Promise<void> {
    await db.transaction(async (tx) => {
      // Delete all assignments for this line combination first
      await tx
        .delete(lineCombinationAssignments)
        .where(eq(lineCombinationAssignments.lineCombinationId, id));
      
      // Delete the line combination
      await tx
        .delete(lineCombinations)
        .where(eq(lineCombinations.id, id));
    });
  }

  // Line combination assignment operations
  async createLineCombinationAssignment(assignment: InsertLineCombinationAssignment): Promise<LineCombinationAssignment> {
    const [newAssignment] = await db
      .insert(lineCombinationAssignments)
      .values(assignment)
      .returning();
    return newAssignment;
  }

  async updateLineCombinationAssignment(id: string, playerId: string): Promise<LineCombinationAssignment> {
    const [assignment] = await db
      .update(lineCombinationAssignments)
      .set({ playerId, updatedAt: new Date() })
      .where(eq(lineCombinationAssignments.id, id))
      .returning();
    return assignment;
  }

  async updateLineCombinationAssignmentPosition(id: string, position: string): Promise<LineCombinationAssignment> {
    const [assignment] = await db
      .update(lineCombinationAssignments)
      .set({ position: position as any, updatedAt: new Date() })
      .where(eq(lineCombinationAssignments.id, id))
      .returning();
    return assignment;
  }

  async bulkUpdateLineCombinationAssignments(updates: { id: string; playerId?: string; position?: string }[]): Promise<LineCombinationAssignment[]> {
    return await db.transaction(async (tx) => {
      const results = [];
      for (const update of updates) {
        const setData: any = { updatedAt: new Date() };
        if (update.playerId) setData.playerId = update.playerId;
        if (update.position) setData.position = update.position;
        
        const [assignment] = await tx
          .update(lineCombinationAssignments)
          .set(setData)
          .where(eq(lineCombinationAssignments.id, update.id))
          .returning();
        results.push(assignment);
      }
      return results;
    });
  }

  async deleteLineCombinationAssignment(id: string): Promise<void> {
    await db
      .delete(lineCombinationAssignments)
      .where(eq(lineCombinationAssignments.id, id));
  }

  async deleteLineCombinationAssignmentsByLine(lineCombinationId: string): Promise<void> {
    await db
      .delete(lineCombinationAssignments)
      .where(eq(lineCombinationAssignments.lineCombinationId, lineCombinationId));
  }

  async getLineCombinationAssignments(lineCombinationId: string): Promise<LineAssignmentWithPlayer[]> {
    const result = await db
      .select({
        assignment: lineCombinationAssignments,
        user: users,
      })
      .from(lineCombinationAssignments)
      .innerJoin(users, eq(lineCombinationAssignments.playerId, users.id))
      .where(eq(lineCombinationAssignments.lineCombinationId, lineCombinationId))
      .orderBy(asc(lineCombinationAssignments.position));

    return result.map(row => ({
      ...row.assignment,
      player: row.user,
    }));
  }

  async getLineCombinationAssignment(id: string): Promise<LineAssignmentWithPlayer | undefined> {
    const [result] = await db
      .select({
        assignment: lineCombinationAssignments,
        user: users,
      })
      .from(lineCombinationAssignments)
      .innerJoin(users, eq(lineCombinationAssignments.playerId, users.id))
      .where(eq(lineCombinationAssignments.id, id));

    if (!result) return undefined;
    
    return {
      ...result.assignment,
      player: result.user,
    };
  }

  // Feedback operations
  async createFeedbackSubmission(feedbackData: InsertFeedbackSubmission): Promise<FeedbackSubmission> {
    const [feedback] = await db
      .insert(feedbackSubmissions)
      .values(feedbackData)
      .returning();
    return feedback;
  }

  // Payment request operations
  async createPaymentRequest(paymentRequest: InsertPaymentRequest, recipientUserIds: string[]): Promise<PaymentRequest> {
    return await db.transaction(async (tx) => {
      const [newPaymentRequest] = await tx
        .insert(paymentRequests)
        .values(paymentRequest)
        .returning();

      if (recipientUserIds.length > 0) {
        await tx.insert(paymentRequestRecipients).values(
          recipientUserIds.map(userId => ({
            paymentRequestId: newPaymentRequest.id,
            userId,
            isPaid: false,
          }))
        );
      }

      return newPaymentRequest;
    });
  }

  async getPaymentRequest(id: string): Promise<(PaymentRequest & { creator: User; recipients: (PaymentRequestRecipient & { user: User })[] }) | undefined> {
    const [paymentRequest] = await db
      .select()
      .from(paymentRequests)
      .where(eq(paymentRequests.id, id));

    if (!paymentRequest) return undefined;

    const [creator] = await db
      .select()
      .from(users)
      .where(eq(users.id, paymentRequest.creatorId));

    const recipientsResult = await db
      .select()
      .from(paymentRequestRecipients)
      .innerJoin(users, eq(paymentRequestRecipients.userId, users.id))
      .where(eq(paymentRequestRecipients.paymentRequestId, id));

    const recipients = recipientsResult.map(r => ({
      ...r.payment_request_recipients,
      user: r.users,
    }));

    return {
      ...paymentRequest,
      creator,
      recipients,
    };
  }

  async getPaymentRequestsByCreator(creatorId: string): Promise<(PaymentRequest & { recipients: (PaymentRequestRecipient & { user: User })[] })[]> {
    const requests = await db
      .select()
      .from(paymentRequests)
      .where(eq(paymentRequests.creatorId, creatorId))
      .orderBy(desc(paymentRequests.createdAt));

    return Promise.all(
      requests.map(async (request) => {
        const recipientsResult = await db
          .select()
          .from(paymentRequestRecipients)
          .innerJoin(users, eq(paymentRequestRecipients.userId, users.id))
          .where(eq(paymentRequestRecipients.paymentRequestId, request.id));

        const recipients = recipientsResult.map(r => ({
          ...r.payment_request_recipients,
          user: r.users,
        }));

        return {
          ...request,
          recipients,
        };
      })
    );
  }

  async getPaymentRequestsByRecipient(userId: string): Promise<(PaymentRequest & { creator: User; recipients: (PaymentRequestRecipient & { user: User })[] })[]> {
    const recipientEntries = await db
      .select()
      .from(paymentRequestRecipients)
      .where(eq(paymentRequestRecipients.userId, userId));

    const requestIds = recipientEntries.map(r => r.paymentRequestId);
    
    if (requestIds.length === 0) return [];

    const requests = await db
      .select()
      .from(paymentRequests)
      .where(inArray(paymentRequests.id, requestIds))
      .orderBy(desc(paymentRequests.createdAt));

    return Promise.all(
      requests.map(async (request) => {
        const [creator] = await db
          .select()
          .from(users)
          .where(eq(users.id, request.creatorId));

        const recipientsResult = await db
          .select()
          .from(paymentRequestRecipients)
          .innerJoin(users, eq(paymentRequestRecipients.userId, users.id))
          .where(eq(paymentRequestRecipients.paymentRequestId, request.id));

        const recipients = recipientsResult.map(r => ({
          ...r.payment_request_recipients,
          user: r.users,
        }));

        return {
          ...request,
          creator,
          recipients,
        };
      })
    );
  }

  async getPaymentRequestsByScrimmage(scrimmageId: string): Promise<(PaymentRequest & { creator: User; recipients: (PaymentRequestRecipient & { user: User })[] })[]> {
    const requests = await db
      .select()
      .from(paymentRequests)
      .where(eq(paymentRequests.relatedScrimmageId, scrimmageId))
      .orderBy(desc(paymentRequests.createdAt));

    return Promise.all(
      requests.map(async (request) => {
        const [creator] = await db
          .select()
          .from(users)
          .where(eq(users.id, request.creatorId));

        const recipientsResult = await db
          .select()
          .from(paymentRequestRecipients)
          .innerJoin(users, eq(paymentRequestRecipients.userId, users.id))
          .where(eq(paymentRequestRecipients.paymentRequestId, request.id));

        const recipients = recipientsResult.map(r => ({
          ...r.payment_request_recipients,
          user: r.users,
        }));

        return {
          ...request,
          creator,
          recipients,
        };
      })
    );
  }

  async getPaymentRequestsByConversation(conversationId: string): Promise<(PaymentRequest & { creator: User; recipients: (PaymentRequestRecipient & { user: User })[] })[]> {
    const requests = await db
      .select()
      .from(paymentRequests)
      .where(eq(paymentRequests.relatedConversationId, conversationId))
      .orderBy(desc(paymentRequests.createdAt));

    return Promise.all(
      requests.map(async (request) => {
        const [creator] = await db
          .select()
          .from(users)
          .where(eq(users.id, request.creatorId));

        const recipientsResult = await db
          .select()
          .from(paymentRequestRecipients)
          .innerJoin(users, eq(paymentRequestRecipients.userId, users.id))
          .where(eq(paymentRequestRecipients.paymentRequestId, request.id));

        const recipients = recipientsResult.map(r => ({
          ...r.payment_request_recipients,
          user: r.users,
        }));

        return {
          ...request,
          creator,
          recipients,
        };
      })
    );
  }

  async updatePaymentRequestRecipient(recipientId: string, updates: { isPaid: boolean; paymentMethod?: 'venmo' | 'cashapp' | 'cash' | 'other' }): Promise<PaymentRequestRecipient> {
    const [recipient] = await db
      .update(paymentRequestRecipients)
      .set({
        ...updates,
        paidAt: updates.isPaid ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(paymentRequestRecipients.id, recipientId))
      .returning();
    return recipient;
  }

  async confirmPaymentRequestRecipient(recipientId: string, isConfirmed: boolean): Promise<PaymentRequestRecipient> {
    const [recipient] = await db
      .update(paymentRequestRecipients)
      .set({
        isConfirmed,
        confirmedAt: isConfirmed ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(paymentRequestRecipients.id, recipientId))
      .returning();
    return recipient;
  }

  async deletePaymentRequest(id: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(paymentRequestRecipients).where(eq(paymentRequestRecipients.paymentRequestId, id));
      await tx.delete(paymentRequests).where(eq(paymentRequests.id, id));
    });
  }

  async getUnpaidPaymentRequestCount(userId: string): Promise<number> {
    const unpaidRecipients = await db
      .select()
      .from(paymentRequestRecipients)
      .where(
        and(
          eq(paymentRequestRecipients.userId, userId),
          eq(paymentRequestRecipients.isPaid, false)
        )
      );
    
    return unpaidRecipients.length;
  }

  // User payment methods
  async updateUserPaymentMethods(userId: string, paymentMethods: { venmoUsername?: string; cashappUsername?: string }): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        ...paymentMethods,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  // Facility operations
  async createFacility(facilityData: InsertFacility): Promise<Facility> {
    const [facility] = await db
      .insert(facilities)
      .values(facilityData)
      .returning();
    return facility;
  }

  async getFacility(id: string): Promise<Facility | undefined> {
    const [facility] = await db
      .select()
      .from(facilities)
      .where(eq(facilities.id, id));
    return facility;
  }

  async getAllFacilities(options?: { sport?: string; city?: string; state?: string; search?: string }): Promise<Facility[]> {
    const conditions = [];
    if (options?.sport) {
      conditions.push(sql`${facilities.sports} @> ARRAY[${options.sport}]::sport[]`);
    }
    if (options?.city) {
      conditions.push(ilike(facilities.city, `%${options.city}%`));
    }
    if (options?.state) {
      conditions.push(eq(facilities.state, options.state));
    }
    if (options?.search) {
      conditions.push(
        or(
          ilike(facilities.name, `%${options.search}%`),
          ilike(facilities.city, `%${options.search}%`),
          ilike(facilities.state, `%${options.search}%`)
        )!
      );
    }
    
    if (conditions.length > 0) {
      return await db.select().from(facilities).where(and(...conditions));
    }
    
    return await db.select().from(facilities);
  }

  async updateFacility(id: string, updates: Partial<InsertFacility>): Promise<Facility> {
    const [facility] = await db
      .update(facilities)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(facilities.id, id))
      .returning();
    return facility;
  }

  async deleteFacility(id: string): Promise<void> {
    await db.delete(facilities).where(eq(facilities.id, id));
  }

  // Facility membership operations
  async createFacilityMembership(membershipData: InsertFacilityMembership): Promise<FacilityMembership> {
    const [membership] = await db
      .insert(facilityMemberships)
      .values(membershipData)
      .returning();
    return membership;
  }

  async getFacilityMembership(id: string): Promise<FacilityMembership | undefined> {
    const [membership] = await db
      .select()
      .from(facilityMemberships)
      .where(eq(facilityMemberships.id, id));
    return membership;
  }

  async getUserFacilityMembership(userId: string, facilityId: string): Promise<FacilityMembership | undefined> {
    const [membership] = await db
      .select()
      .from(facilityMemberships)
      .where(
        and(
          eq(facilityMemberships.userId, userId),
          eq(facilityMemberships.facilityId, facilityId)
        )
      );
    return membership;
  }

  async getUserFacilityMemberships(userId: string): Promise<(FacilityMembership & { facility: Facility })[]> {
    const memberships = await db
      .select()
      .from(facilityMemberships)
      .innerJoin(facilities, eq(facilityMemberships.facilityId, facilities.id))
      .where(eq(facilityMemberships.userId, userId));
    
    return memberships.map(m => ({
      ...m.facility_memberships,
      facility: m.facilities,
    }));
  }

  async getFacilityMembers(facilityId: string): Promise<(FacilityMembership & { user: User })[]> {
    const members = await db
      .select()
      .from(facilityMemberships)
      .innerJoin(users, eq(facilityMemberships.userId, users.id))
      .where(eq(facilityMemberships.facilityId, facilityId));
    
    return members.map(m => ({
      ...m.facility_memberships,
      user: m.users,
    }));
  }

  async updateFacilityMembership(id: string, updates: Partial<InsertFacilityMembership>): Promise<FacilityMembership> {
    const [membership] = await db
      .update(facilityMemberships)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(facilityMemberships.id, id))
      .returning();
    return membership;
  }

  async deleteFacilityMembership(id: string): Promise<void> {
    await db.delete(facilityMemberships).where(eq(facilityMemberships.id, id));
  }

  async checkUserActiveFacilityMembership(userId: string, facilityId: string): Promise<boolean> {
    const [membership] = await db
      .select()
      .from(facilityMemberships)
      .where(
        and(
          eq(facilityMemberships.userId, userId),
          eq(facilityMemberships.facilityId, facilityId),
          eq(facilityMemberships.status, 'active')
        )
      );
    return !!membership;
  }

  // Calendar event operations
  async createCalendarEvent(eventData: InsertCalendarEvent): Promise<CalendarEvent> {
    const [event] = await db
      .insert(calendarEvents)
      .values(eventData)
      .returning();
    return event;
  }

  async getCalendarEvent(id: string): Promise<(CalendarEvent & { facility: Facility; creator: User }) | undefined> {
    const [result] = await db
      .select()
      .from(calendarEvents)
      .innerJoin(facilities, eq(calendarEvents.facilityId, facilities.id))
      .innerJoin(users, eq(calendarEvents.createdBy, users.id))
      .where(eq(calendarEvents.id, id));
    
    if (!result) return undefined;
    
    return {
      ...result.calendar_events,
      facility: result.facilities,
      creator: result.users,
    };
  }

  async getFacilityCalendarEvents(
    facilityId: string, 
    options?: { sportId?: string; startDate?: Date; endDate?: Date }
  ): Promise<(CalendarEvent & { creator: User; participantsCount: number })[]> {
    const conditions = [eq(calendarEvents.facilityId, facilityId)];
    
    if (options?.sportId) {
      conditions.push(sql`${calendarEvents.sportId}::text = ${options.sportId}`);
    }
    if (options?.startDate) {
      conditions.push(gte(calendarEvents.startTime, options.startDate));
    }
    if (options?.endDate) {
      conditions.push(lte(calendarEvents.endTime, options.endDate));
    }
    
    const results = await db
      .select({
        event: calendarEvents,
        creator: users,
        participantsCount: sql<number>`CAST(COUNT(${eventParticipants.id}) AS INTEGER)`,
      })
      .from(calendarEvents)
      .innerJoin(users, eq(calendarEvents.createdBy, users.id))
      .leftJoin(eventParticipants, eq(calendarEvents.id, eventParticipants.eventId))
      .where(and(...conditions))
      .groupBy(calendarEvents.id, users.id)
      .orderBy(asc(calendarEvents.startTime));
    
    return results.map(r => ({
      ...r.event,
      creator: r.creator,
      participantsCount: r.participantsCount,
    }));
  }

  async updateCalendarEvent(id: string, updates: Partial<InsertCalendarEvent>): Promise<CalendarEvent> {
    const [event] = await db
      .update(calendarEvents)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(calendarEvents.id, id))
      .returning();
    return event;
  }

  async deleteCalendarEvent(id: string): Promise<void> {
    await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
  }

  // Event participant operations
  async createEventParticipant(participantData: InsertEventParticipant): Promise<EventParticipant> {
    const [participant] = await db
      .insert(eventParticipants)
      .values(participantData)
      .returning();
    
    await db
      .update(calendarEvents)
      .set({
        currentParticipantsCount: sql`${calendarEvents.currentParticipantsCount} + 1`,
      })
      .where(eq(calendarEvents.id, participantData.eventId));
    
    return participant;
  }

  async getEventParticipants(eventId: string): Promise<(EventParticipant & { user: User; facilityMembership: FacilityMembership })[]> {
    const participants = await db
      .select()
      .from(eventParticipants)
      .innerJoin(users, eq(eventParticipants.userId, users.id))
      .innerJoin(facilityMemberships, eq(eventParticipants.facilityMembershipId, facilityMemberships.id))
      .where(eq(eventParticipants.eventId, eventId));
    
    return participants.map(p => ({
      ...p.event_participants,
      user: p.users,
      facilityMembership: p.facility_memberships,
    }));
  }

  async getUserEventParticipation(userId: string, eventId: string): Promise<EventParticipant | undefined> {
    const [participant] = await db
      .select()
      .from(eventParticipants)
      .where(
        and(
          eq(eventParticipants.userId, userId),
          eq(eventParticipants.eventId, eventId)
        )
      );
    return participant;
  }

  async updateEventParticipant(id: string, updates: Partial<InsertEventParticipant>): Promise<EventParticipant> {
    const [participant] = await db
      .update(eventParticipants)
      .set(updates)
      .where(eq(eventParticipants.id, id))
      .returning();
    return participant;
  }

  async deleteEventParticipant(id: string): Promise<void> {
    const [participant] = await db
      .select()
      .from(eventParticipants)
      .where(eq(eventParticipants.id, id));
    
    if (participant) {
      await db.delete(eventParticipants).where(eq(eventParticipants.id, id));
      
      await db
        .update(calendarEvents)
        .set({
          currentParticipantsCount: sql`${calendarEvents.currentParticipantsCount} - 1`,
        })
        .where(eq(calendarEvents.id, participant.eventId));
    }
  }

  async checkInEventParticipant(id: string): Promise<EventParticipant> {
    const [participant] = await db
      .update(eventParticipants)
      .set({ checkedIn: true })
      .where(eq(eventParticipants.id, id))
      .returning();
    return participant;
  }
}

export const storage = new DatabaseStorage();
