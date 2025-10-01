import { sql, relations } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  integer,
  boolean,
  pgEnum,
  decimal,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);


// Sports enum
export const sportEnum = pgEnum("sport", [
  "hockey",
  "basketball",
  "soccer",
  "baseball",
  "softball",
  "football",
  "volleyball",
  "tennis",
  "other"
]);

// Membership status enum
export const membershipStatusEnum = pgEnum("membership_status", [
  "pending",
  "approved",
  "rejected",
  "inactive"
]);

// RSVP status enum
export const rsvpStatusEnum = pgEnum("rsvp_status", [
  "attending",
  "not_attending",
  "no_response"
]);

// Substitute request status enum
export const substituteRequestStatusEnum = pgEnum("substitute_request_status", [
  "pending_opponent_approval",
  "pending_commissioner_approval",
  "pending_substitute_approval",
  "approved",
  "denied",
  "expired"
]);

// Scrimmage status enum
export const scrimmageStatusEnum = pgEnum("scrimmage_status", [
  "open",
  "roster_confirmed",
  "cancelled"
]);

// Scrimmage request status enum
export const scrimmageRequestStatusEnum = pgEnum("scrimmage_request_status", [
  "pending",
  "approved",
  "dismissed"
]);

// Game result type enum
export const gameResultTypeEnum = pgEnum("game_result_type", [
  "regulation",
  "overtime", 
  "shootout"
]);

// User role enum
export const userRoleEnum = pgEnum("user_role", [
  "commissioner",
  "secondary_commissioner", 
  "player_pro",
  "free_tier"
]);

// Special permissions enum
export const specialPermissionEnum = pgEnum("special_permission", [
  "admin",
  "stat_manager"
]);

// Users table (required for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  age: integer("age"),
  dateOfBirth: varchar("date_of_birth"),
  phoneNumber: varchar("phone_number"),
  city: varchar("city"),
  primarySport: sportEnum("primary_sport"),
  // Permission system fields
  role: userRoleEnum("role").default("free_tier").notNull(),
  specialPermissions: specialPermissionEnum("special_permissions").array(),
  isPrimaryCommissioner: boolean("is_primary_commissioner").default(false).notNull(),
  createdBy: varchar("created_by"), // Will add reference after table definition
  // Stripe subscription fields
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Leagues table
export const leagues = pgTable("leagues", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  uniqueLeagueId: varchar("unique_league_id").unique().notNull(), // For players to search and join
  sport: sportEnum("sport").notNull(),
  description: text("description"),
  location: varchar("location"),
  rinkName: varchar("rink_name"), // Added for commissioner feature
  rinkAddress: text("rink_address"), // Added for commissioner feature
  season: varchar("season"),
  commissionerId: varchar("commissioner_id").references(() => users.id).notNull(),
  maxTeams: integer("max_teams").default(16),
  isActive: boolean("is_active").default(true).notNull(),
  playoffStarted: boolean("playoff_started").default(false).notNull(),
  playoffBracket: jsonb("playoff_bracket"), // Store playoff bracket data
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Seasons table 
export const seasons = pgTable("seasons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(), // e.g., "Spring 2024", "Fall 2023"
  leagueId: varchar("league_id").references(() => leagues.id).notNull(),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Teams table
export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  leagueId: varchar("league_id").references(() => leagues.id).notNull(),
  seasonId: varchar("season_id").references(() => seasons.id), // Made nullable for safe migration
  captainId: varchar("captain_id").references(() => users.id),
  logoUrl: varchar("logo_url"),
  wins: integer("wins").default(0).notNull(),
  losses: integer("losses").default(0).notNull(),
  ties: integer("ties").default(0).notNull(),
  goalsFor: integer("goals_for").default(0).notNull(),
  goalsAgainst: integer("goals_against").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// League memberships table
export const leagueMemberships = pgTable("league_memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  leagueId: varchar("league_id").references(() => leagues.id).notNull(),
  skillLevel: varchar("skill_level"), // Text field for skill level (number or letter)
  status: membershipStatusEnum("status").default("pending").notNull(),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  approvedAt: timestamp("approved_at"),
  approvedBy: varchar("approved_by").references(() => users.id),
  // Additional player management fields
  assignedTeamId: varchar("assigned_team_id").references(() => teams.id),
  position: varchar("position"),
  notes: text("notes"),
  jerseyNumber: integer("jersey_number"),
  // Player merge display name fields - when set, these override user.firstName/lastName for league display
  displayFirstName: varchar("display_first_name"),
  displayLastName: varchar("display_last_name"),
  // Player role fields
  isGoalie: boolean("is_goalie").default(false).notNull(),
  // League-specific permissions
  leagueRole: userRoleEnum("league_role").default("free_tier"), // Role within this specific league
  leagueSpecialPermissions: specialPermissionEnum("league_special_permissions").array(), // Special permissions within this league
});

// Team memberships table
export const teamMemberships = pgTable("team_memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  teamId: varchar("team_id").references(() => teams.id).notNull(),
  position: varchar("position"),
  jerseyNumber: integer("jersey_number"),
  skillLevel: varchar("skill_level"), // Text field for skill level (number or letter)
  status: membershipStatusEnum("status").default("pending").notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  approvedBy: varchar("approved_by").references(() => users.id),
});

// Games table
export const games = pgTable("games", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").references(() => leagues.id).notNull(),
  seasonId: varchar("season_id").references(() => seasons.id), // Made nullable for safe migration
  homeTeamId: varchar("home_team_id").references(() => teams.id).notNull(),
  awayTeamId: varchar("away_team_id").references(() => teams.id).notNull(),
  scheduledAt: timestamp("scheduled_at").notNull(),
  venue: varchar("venue"),
  lockerRoom: varchar("locker_room"),
  homeTeamLockerRoom: varchar("home_team_locker_room"),
  awayTeamLockerRoom: varchar("away_team_locker_room"),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  isCompleted: boolean("is_completed").default(false).notNull(),
  homeBeverageDutyUserId: varchar("home_beverage_duty_user_id").references(() => users.id),
  homeBeverageDutyClaimedAt: timestamp("home_beverage_duty_claimed_at"),
  awayBeverageDutyUserId: varchar("away_beverage_duty_user_id").references(() => users.id),
  awayBeverageDutyClaimedAt: timestamp("away_beverage_duty_claimed_at"),
  resultType: gameResultTypeEnum("result_type").default("regulation"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Game score submissions table
export const gameScoreSubmissions = pgTable("game_score_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("game_id").references(() => games.id).notNull(),
  submittedBy: varchar("submitted_by").references(() => users.id).notNull(),
  submitterRole: varchar("submitter_role").notNull(), // 'home_captain', 'away_captain', 'commissioner'
  homeScore: integer("home_score").notNull(),
  awayScore: integer("away_score").notNull(),
  isCommissionerOverride: boolean("is_commissioner_override").default(false).notNull(),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
});

// Game goalies table - tracks goalie of record for each team in each game
export const gameGoalies = pgTable("game_goalies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("game_id").references(() => games.id).notNull(),
  teamId: varchar("team_id").references(() => teams.id).notNull(),
  goalieUserId: varchar("goalie_user_id").references(() => users.id).notNull(),
  isStarter: boolean("is_starter").default(true).notNull(),
  goalsAgainst: integer("goals_against").default(0).notNull(),
  minutesPlayed: integer("minutes_played").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_game_team_goalie").on(table.gameId, table.teamId),
  index("idx_game_goalies_game_id").on(table.gameId),
  index("idx_game_goalies_team_id").on(table.teamId),
  index("idx_game_goalies_user_id").on(table.goalieUserId),
]);

// Game RSVPs table
export const gameRsvps = pgTable("game_rsvps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("game_id").references(() => games.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  teamId: varchar("team_id").references(() => teams.id).notNull(),
  status: rsvpStatusEnum("status").default("no_response").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_game_user_team_rsvp").on(table.gameId, table.userId, table.teamId),
]);

// Substitute requests table
export const substituteRequests = pgTable("substitute_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("game_id").references(() => games.id).notNull(),
  originalPlayerId: varchar("original_player_id").references(() => users.id).notNull(),
  substitutePlayerId: varchar("substitute_player_id").references(() => users.id),
  requestingTeamId: varchar("requesting_team_id").references(() => teams.id).notNull(),
  requestedBy: varchar("requested_by").references(() => users.id).notNull(),
  status: substituteRequestStatusEnum("status").default("pending_opponent_approval").notNull(),
  reason: text("reason"),
  expiresAt: timestamp("expires_at"),
  finalizedAt: timestamp("finalized_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_substitute_requests_game_id").on(table.gameId),
  index("idx_substitute_requests_requesting_team_id").on(table.requestingTeamId),
]);

// Substitute request approval status enum
export const approverTypeEnum = pgEnum("approver_type", [
  "opposing_captain",
  "commissioner",
  "substitute_player"
]);

// Approval status enum
export const approvalStatusEnum = pgEnum("approval_status", [
  "approved",
  "denied"
]);

// Substitution approvals table
export const substitutionApprovals = pgTable("substitution_approvals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  substitutionRequestId: varchar("substitution_request_id").references(() => substituteRequests.id).notNull(),
  approverId: varchar("approver_id").references(() => users.id).notNull(),
  approverType: approverTypeEnum("approver_type").notNull(),
  status: approvalStatusEnum("status").notNull(),
  comments: text("comments"),
  approvedAt: timestamp("approved_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_approval_per_stage").on(table.substitutionRequestId, table.approverType),
  index("idx_substitution_approvals_request_id").on(table.substitutionRequestId),
]);


// Conversation type enum
export const conversationTypeEnum = pgEnum("conversation_type", [
  "direct",
  "team_group",
  "custom_group",
  "captain_only"
]);

// Message status enum
export const messageStatusEnum = pgEnum("message_status", [
  "sent",
  "delivered", 
  "read"
]);

// User online status enum
export const onlineStatusEnum = pgEnum("online_status", [
  "online",
  "away",
  "offline"
]);

// Conversations table
export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: conversationTypeEnum("type").notNull(),
  title: varchar("title"), // For group chats, null for direct messages
  leagueId: varchar("league_id").references(() => leagues.id).notNull(), // All conversations are within a league context
  teamId: varchar("team_id").references(() => teams.id), // For team group chats
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  lastMessageAt: timestamp("last_message_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_conversations_league_id").on(table.leagueId),
  index("idx_conversations_team_id").on(table.teamId),
  index("idx_conversations_last_message").on(table.lastMessageAt),
]);

// Conversation participants table
export const conversationParticipants = pgTable("conversation_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => conversations.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  leftAt: timestamp("left_at"), // For when users leave group chats
  lastReadAt: timestamp("last_read_at"), // For read receipts
  hiddenAt: timestamp("hidden_at"), // When conversation is hidden from user's view (SMS-style leave)
  historyClearedAt: timestamp("history_cleared_at"), // When message history is cleared for user
}, (table) => [
  unique("unique_conversation_user").on(table.conversationId, table.userId),
  index("idx_conversation_participants_conversation").on(table.conversationId),
  index("idx_conversation_participants_user").on(table.userId),
  index("idx_conversation_participants_hidden").on(table.hiddenAt),
  index("idx_conversation_participants_history").on(table.historyClearedAt),
]);

// Enhanced messages table
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => conversations.id).notNull(),
  senderId: varchar("sender_id").references(() => users.id).notNull(),
  content: text("content"),
  messageType: varchar("message_type").default("text").notNull(), // text, image, gif, file
  status: messageStatusEnum("status").default("sent").notNull(),
  editedAt: timestamp("edited_at"), // For message editing
  replyToId: varchar("reply_to_id"), // For threaded replies - self reference added later
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_messages_conversation").on(table.conversationId),
  index("idx_messages_sender").on(table.senderId),
  index("idx_messages_created_at").on(table.createdAt),
]);

// Message attachments table
export const messageAttachments = pgTable("message_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").references(() => messages.id).notNull(),
  type: varchar("type").notNull(), // 'image', 'gif', 'file'
  url: varchar("url").notNull(),
  filename: varchar("filename"),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type"),
  thumbnailUrl: varchar("thumbnail_url"), // For image/video previews
  width: integer("width"), // For images/videos
  height: integer("height"), // For images/videos
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_message_attachments_message").on(table.messageId),
]);

// Message read receipts table
export const messageReadReceipts = pgTable("message_read_receipts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").references(() => messages.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  readAt: timestamp("read_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_message_user_read").on(table.messageId, table.userId),
  index("idx_message_read_receipts_message").on(table.messageId),
  index("idx_message_read_receipts_user").on(table.userId),
]);

// Typing indicators table (for real-time typing status)
export const typingIndicators = pgTable("typing_indicators", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => conversations.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(), // Auto-expire after 5 seconds
}, (table) => [
  unique("unique_conversation_user_typing").on(table.conversationId, table.userId),
  index("idx_typing_indicators_conversation").on(table.conversationId),
  index("idx_typing_indicators_expires").on(table.expiresAt),
]);

// User online status table
export const userOnlineStatus = pgTable("user_online_status", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull().unique(),
  status: onlineStatusEnum("status").default("offline").notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_user_online_status_user").on(table.userId),
]);

// Chat polls table
export const chatPolls = pgTable("chat_polls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").references(() => messages.id).notNull(),
  question: text("question").notNull(),
  options: jsonb("options").notNull(), // Array of poll options
  status: varchar("status").default("active").notNull(), // "active" or "closed"
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_chat_polls_message").on(table.messageId),
  index("idx_chat_polls_status").on(table.status),
]);

// Chat poll votes table
export const chatPollVotes = pgTable("chat_poll_votes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pollId: varchar("poll_id").references(() => chatPolls.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  optionIndex: integer("option_index").notNull(), // Index of selected option in options array
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_chat_poll_user_vote").on(table.pollId, table.userId),
  index("idx_chat_poll_votes_poll").on(table.pollId),
  index("idx_chat_poll_votes_user").on(table.userId),
]);

// Announcements table
export const announcements = pgTable("announcements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").references(() => leagues.id).notNull(),
  authorId: varchar("author_id").references(() => users.id).notNull(),
  teamId: varchar("team_id").references(() => teams.id), // null = commissioner post for everyone, set = team captain post for specific team
  content: text("content").notNull(),
  isPinned: boolean("is_pinned").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Announcement attachments table
export const announcementAttachments = pgTable("announcement_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  announcementId: varchar("announcement_id").references(() => announcements.id).notNull(),
  type: varchar("type").notNull(), // 'image', 'video', 'gif', 'link'
  url: varchar("url").notNull(),
  filename: varchar("filename"),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type"),
  linkTitle: varchar("link_title"),
  linkDescription: text("link_description"),
  linkImage: varchar("link_image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Announcement reactions table
export const announcementReactions = pgTable("announcement_reactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  announcementId: varchar("announcement_id").references(() => announcements.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  emoji: varchar("emoji").notNull(), // Store emoji as string
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_announcement_user_emoji").on(table.announcementId, table.userId, table.emoji),
]);

// Announcement polls table
export const announcementPolls = pgTable("announcement_polls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  announcementId: varchar("announcement_id").references(() => announcements.id).notNull(),
  question: text("question").notNull(),
  options: jsonb("options").notNull(), // Array of poll options
  allowMultiple: boolean("allow_multiple").default(false).notNull(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Announcement poll votes table
export const announcementPollVotes = pgTable("announcement_poll_votes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pollId: varchar("poll_id").references(() => announcementPolls.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  optionIndex: integer("option_index").notNull(), // Index of selected option in options array
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_poll_user_vote").on(table.pollId, table.userId, table.optionIndex),
]);

// Announcement read status table - tracks which announcements each user has read
export const announcementReadStatus = pgTable("announcement_read_status", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  announcementId: varchar("announcement_id").references(() => announcements.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  readAt: timestamp("read_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_announcement_user_read").on(table.announcementId, table.userId),
]);

// Announcement visibility table - tracks who can see targeted announcements
// If no records exist for an announcement, it's visible to all league members (default behavior)
export const announcementVisibility = pgTable("announcement_visibility", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  announcementId: varchar("announcement_id").references(() => announcements.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_announcement_user_visibility").on(table.announcementId, table.userId),
]);

// Scrimmages table
export const scrimmages = pgTable("scrimmages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").references(() => leagues.id).notNull(),
  creatorId: varchar("creator_id").references(() => users.id).notNull(),
  title: varchar("title").notNull(),
  dateTime: timestamp("date_time").notNull(),
  location: varchar("location").notNull(),
  maxPlayers: integer("max_players").notNull(),
  skillLevel: varchar("skill_level"), // Optional skill level requirement
  notes: text("notes"), // Additional notes/requirements
  status: scrimmageStatusEnum("status").default("open").notNull(),
  announcementId: varchar("announcement_id").references(() => announcements.id), // Link to auto-created announcement
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Scrimmage requests table
export const scrimmageRequests = pgTable("scrimmage_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scrimmageId: varchar("scrimmage_id").references(() => scrimmages.id).notNull(),
  playerId: varchar("player_id").references(() => users.id).notNull(),
  status: scrimmageRequestStatusEnum("status").default("pending").notNull(),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  approvedAt: timestamp("approved_at"),
  dismissedAt: timestamp("dismissed_at"),
}, (table) => [
  unique("unique_scrimmage_player_request").on(table.scrimmageId, table.playerId),
]);

// Line combinations enum
export const lineTypeEnum = pgEnum("line_type", [
  "forward",
  "defense"
]);

export const positionEnum = pgEnum("position", [
  "LW", // Left Wing
  "C",  // Center
  "RW", // Right Wing
  "LD", // Left Defense
  "RD"  // Right Defense
]);

// Line combinations table - stores line setups for teams/games
export const lineCombinations = pgTable("line_combinations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").references(() => teams.id).notNull(),
  gameId: varchar("game_id").references(() => games.id), // Optional - for game-specific lines
  name: varchar("name").notNull(), // e.g., "Forward Line 1", "Defense Line 1"
  lineType: lineTypeEnum("line_type").notNull(),
  lineNumber: integer("line_number").notNull(), // 1, 2, 3, etc.
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_team_game_line").on(table.teamId, table.gameId, table.lineType, table.lineNumber),
  index("idx_line_combinations_team").on(table.teamId),
  index("idx_line_combinations_game").on(table.gameId),
]);

// Line combination assignments table - stores player assignments to line positions
export const lineCombinationAssignments = pgTable("line_combination_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lineCombinationId: varchar("line_combination_id").references(() => lineCombinations.id).notNull(),
  position: positionEnum("position").notNull(),
  playerId: varchar("player_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_line_position").on(table.lineCombinationId, table.position),
  index("idx_line_assignments_combination").on(table.lineCombinationId),
  index("idx_line_assignments_player").on(table.playerId),
]);

// Draft status enum
export const draftStatusEnum = pgEnum("draft_status", [
  "created",
  "in_progress", 
  "completed",
  "cancelled"
]);

// Draft round type enum
export const draftRoundTypeEnum = pgEnum("draft_round_type", [
  "snake", // Snake draft: reverse order each round
  "linear" // Linear draft: same order each round
]);

// Drafts table
export const drafts = pgTable("drafts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").references(() => leagues.id).notNull(),
  name: varchar("name").notNull(),
  status: draftStatusEnum("status").default("created").notNull(),
  roundType: draftRoundTypeEnum("round_type").default("snake").notNull(),
  currentRound: integer("current_round").default(1).notNull(),
  currentTurn: integer("current_turn").default(1).notNull(),
  totalRounds: integer("total_rounds").default(10).notNull(),
  draftOrder: jsonb("draft_order"), // Array of team IDs in draft order
  timePerPick: integer("time_per_pick").default(120), // seconds
  scheduledAt: timestamp("scheduled_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Draft picks table
export const draftPicks = pgTable("draft_picks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  draftId: varchar("draft_id").references(() => drafts.id).notNull(),
  teamId: varchar("team_id").references(() => teams.id).notNull(),
  playerId: varchar("player_id").references(() => users.id),
  round: integer("round").notNull(),
  pick: integer("pick").notNull(), // Overall pick number
  pickInRound: integer("pick_in_round").notNull(), // Pick number within round
  pickedAt: timestamp("picked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Player import sessions table
export const playerImports = pgTable("player_imports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").references(() => leagues.id).notNull(),
  importedBy: varchar("imported_by").references(() => users.id).notNull(),
  fileName: varchar("file_name").notNull(),
  totalRecords: integer("total_records").notNull(),
  successfulRecords: integer("successful_records").notNull(),
  failedRecords: integer("failed_records").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Imported players table (placeholder records from spreadsheet)
export const importedPlayers = pgTable("imported_players", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  importId: varchar("import_id").references(() => playerImports.id).notNull(),
  leagueId: varchar("league_id").references(() => leagues.id).notNull(),
  // Player data from spreadsheet
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  email: varchar("email"),
  phoneNumber: varchar("phone_number"),
  position: varchar("position"),
  jerseyNumber: integer("jersey_number"),
  skillLevel: varchar("skill_level"), // Text field for skill level (number or letter)
  teamName: varchar("team_name"),
  teamId: varchar("team_id").references(() => teams.id),
  notes: text("notes"),
  // Merge status
  isPlaceholder: boolean("is_placeholder").default(true).notNull(),
  mergedWithUserId: varchar("merged_with_user_id").references(() => users.id),
  mergedAt: timestamp("merged_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Player merge suggestions enum
export const mergeStatusEnum = pgEnum("merge_status", [
  "pending",
  "approved", 
  "rejected",
  "auto_suggested"
]);

// Player merge requests table
export const playerMergeRequests = pgTable("player_merge_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").references(() => leagues.id).notNull(),
  importedPlayerId: varchar("imported_player_id").references(() => importedPlayers.id).notNull(),
  existingUserId: varchar("existing_user_id").references(() => users.id).notNull(),
  confidenceScore: decimal("confidence_score", { precision: 3, scale: 2 }), // 0.00 to 1.00
  matchingFields: jsonb("matching_fields"), // Store which fields matched
  status: mergeStatusEnum("status").default("auto_suggested").notNull(),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Schedule import sessions table
export const scheduleImports = pgTable("schedule_imports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").references(() => leagues.id).notNull(),
  importedBy: varchar("imported_by").references(() => users.id).notNull(),
  fileName: varchar("file_name").notNull(),
  totalRecords: integer("total_records").notNull(),
  successfulRecords: integer("successful_records").notNull(),
  failedRecords: integer("failed_records").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Imported schedules table (records from spreadsheet before being processed)
export const importedSchedules = pgTable("imported_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  importId: varchar("import_id").references(() => scheduleImports.id).notNull(),
  leagueId: varchar("league_id").references(() => leagues.id).notNull(),
  // Schedule data from spreadsheet
  gameDate: timestamp("game_date"),
  gameTime: varchar("game_time"),
  homeTeamName: varchar("home_team_name"),
  awayTeamName: varchar("away_team_name"),
  homeTeamId: varchar("home_team_id").references(() => teams.id),
  awayTeamId: varchar("away_team_id").references(() => teams.id),
  homeTeamLockerRoom: varchar("home_team_locker_room"),
  awayTeamLockerRoom: varchar("away_team_locker_room"),
  // Processing status
  isProcessed: boolean("is_processed").default(false).notNull(),
  gameId: varchar("game_id").references(() => games.id), // Set when processed into actual game
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Player stats table
export const playerStats = pgTable("player_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  leagueId: varchar("league_id").references(() => leagues.id).notNull(),
  seasonId: varchar("season_id").references(() => seasons.id),
  gamesPlayed: integer("games_played").default(0).notNull(),
  goals: integer("goals").default(0).notNull(),
  assists: integer("assists").default(0).notNull(),
  penaltyMinutes: integer("penalty_minutes").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_player_league_season_stats").on(table.userId, table.leagueId, table.seasonId),
  index("idx_player_stats_league_id").on(table.leagueId),
  index("idx_player_stats_user_id").on(table.userId),
]);

// Feedback category enum
export const feedbackCategoryEnum = pgEnum("feedback_category", [
  "product_improvement",
  "report_issue"
]);

// Feedback submissions table
export const feedbackSubmissions = pgTable("feedback_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  category: feedbackCategoryEnum("category").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  leagueMemberships: many(leagueMemberships),
  teamMemberships: many(teamMemberships),
  sentMessages: many(messages, { relationName: "sender" }),
  receivedMessages: many(messages, { relationName: "recipient" }),
  commissionsLeagues: many(leagues),
  captainedTeams: many(teams),
  playerStats: many(playerStats),
}));

export const leaguesRelations = relations(leagues, ({ one, many }) => ({
  commissioner: one(users, {
    fields: [leagues.commissionerId],
    references: [users.id],
  }),
  seasons: many(seasons),
  teams: many(teams),
  memberships: many(leagueMemberships),
  games: many(games),
  messages: many(messages),
  playerStats: many(playerStats),
}));

export const playerStatsRelations = relations(playerStats, ({ one }) => ({
  user: one(users, {
    fields: [playerStats.userId],
    references: [users.id],
  }),
  league: one(leagues, {
    fields: [playerStats.leagueId],
    references: [leagues.id],
  }),
  season: one(seasons, {
    fields: [playerStats.seasonId],
    references: [seasons.id],
  }),
}));

export const seasonsRelations = relations(seasons, ({ one, many }) => ({
  league: one(leagues, {
    fields: [seasons.leagueId],
    references: [leagues.id],
  }),
  teams: many(teams),
  games: many(games),
  playerStats: many(playerStats),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  league: one(leagues, {
    fields: [teams.leagueId],
    references: [leagues.id],
  }),
  season: one(seasons, {
    fields: [teams.seasonId],
    references: [seasons.id],
  }),
  captain: one(users, {
    fields: [teams.captainId],
    references: [users.id],
  }),
  memberships: many(teamMemberships),
  homeGames: many(games, { relationName: "homeTeam" }),
  awayGames: many(games, { relationName: "awayTeam" }),
  messages: many(messages),
}));

export const leagueMembershipsRelations = relations(leagueMemberships, ({ one }) => ({
  user: one(users, {
    fields: [leagueMemberships.userId],
    references: [users.id],
  }),
  league: one(leagues, {
    fields: [leagueMemberships.leagueId],
    references: [leagues.id],
  }),
  approver: one(users, {
    fields: [leagueMemberships.approvedBy],
    references: [users.id],
  }),
}));

export const teamMembershipsRelations = relations(teamMemberships, ({ one }) => ({
  user: one(users, {
    fields: [teamMemberships.userId],
    references: [users.id],
  }),
  team: one(teams, {
    fields: [teamMemberships.teamId],
    references: [teams.id],
  }),
  approver: one(users, {
    fields: [teamMemberships.approvedBy],
    references: [users.id],
  }),
}));

export const gamesRelations = relations(games, ({ one, many }) => ({
  league: one(leagues, {
    fields: [games.leagueId],
    references: [leagues.id],
  }),
  season: one(seasons, {
    fields: [games.seasonId],
    references: [seasons.id],
  }),
  homeTeam: one(teams, {
    fields: [games.homeTeamId],
    references: [teams.id],
    relationName: "homeTeam",
  }),
  awayTeam: one(teams, {
    fields: [games.awayTeamId],
    references: [teams.id],
    relationName: "awayTeam",
  }),
  rsvps: many(gameRsvps),
  substituteRequests: many(substituteRequests),
}));

// Messaging relations
export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  league: one(leagues, {
    fields: [conversations.leagueId],
    references: [leagues.id],
  }),
  team: one(teams, {
    fields: [conversations.teamId],
    references: [teams.id],
  }),
  createdBy: one(users, {
    fields: [conversations.createdBy],
    references: [users.id],
  }),
  participants: many(conversationParticipants),
  messages: many(messages),
  typingIndicators: many(typingIndicators),
}));

export const conversationParticipantsRelations = relations(conversationParticipants, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationParticipants.conversationId],
    references: [conversations.id],
  }),
  user: one(users, {
    fields: [conversationParticipants.userId],
    references: [users.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
  }),
  attachments: many(messageAttachments),
  readReceipts: many(messageReadReceipts),
  chatPolls: many(chatPolls),
  replyTo: one(messages, {
    fields: [messages.replyToId],
    references: [messages.id],
    relationName: "replyTo",
  }),
  replies: many(messages, {
    relationName: "replyTo",
  }),
}));

export const messageAttachmentsRelations = relations(messageAttachments, ({ one }) => ({
  message: one(messages, {
    fields: [messageAttachments.messageId],
    references: [messages.id],
  }),
}));

export const messageReadReceiptsRelations = relations(messageReadReceipts, ({ one }) => ({
  message: one(messages, {
    fields: [messageReadReceipts.messageId],
    references: [messages.id],
  }),
  user: one(users, {
    fields: [messageReadReceipts.userId],
    references: [users.id],
  }),
}));

export const chatPollsRelations = relations(chatPolls, ({ one, many }) => ({
  message: one(messages, {
    fields: [chatPolls.messageId],
    references: [messages.id],
  }),
  votes: many(chatPollVotes),
}));

export const chatPollVotesRelations = relations(chatPollVotes, ({ one }) => ({
  poll: one(chatPolls, {
    fields: [chatPollVotes.pollId],
    references: [chatPolls.id],
  }),
  user: one(users, {
    fields: [chatPollVotes.userId],
    references: [users.id],
  }),
}));

export const typingIndicatorsRelations = relations(typingIndicators, ({ one }) => ({
  conversation: one(conversations, {
    fields: [typingIndicators.conversationId],
    references: [conversations.id],
  }),
  user: one(users, {
    fields: [typingIndicators.userId],
    references: [users.id],
  }),
}));

export const userOnlineStatusRelations = relations(userOnlineStatus, ({ one }) => ({
  user: one(users, {
    fields: [userOnlineStatus.userId],
    references: [users.id],
  }),
}));

export const announcementsRelations = relations(announcements, ({ one, many }) => ({
  league: one(leagues, {
    fields: [announcements.leagueId],
    references: [leagues.id],
  }),
  author: one(users, {
    fields: [announcements.authorId],
    references: [users.id],
  }),
  attachments: many(announcementAttachments),
  reactions: many(announcementReactions),
  polls: many(announcementPolls),
}));

export const announcementAttachmentsRelations = relations(announcementAttachments, ({ one }) => ({
  announcement: one(announcements, {
    fields: [announcementAttachments.announcementId],
    references: [announcements.id],
  }),
}));

export const announcementReactionsRelations = relations(announcementReactions, ({ one }) => ({
  announcement: one(announcements, {
    fields: [announcementReactions.announcementId],
    references: [announcements.id],
  }),
  user: one(users, {
    fields: [announcementReactions.userId],
    references: [users.id],
  }),
}));

export const announcementPollsRelations = relations(announcementPolls, ({ one, many }) => ({
  announcement: one(announcements, {
    fields: [announcementPolls.announcementId],
    references: [announcements.id],
  }),
  votes: many(announcementPollVotes),
}));

export const announcementPollVotesRelations = relations(announcementPollVotes, ({ one }) => ({
  poll: one(announcementPolls, {
    fields: [announcementPollVotes.pollId],
    references: [announcementPolls.id],
  }),
  user: one(users, {
    fields: [announcementPollVotes.userId],
    references: [users.id],
  }),
}));

// Scrimmage relations
export const scrimmagesRelations = relations(scrimmages, ({ one, many }) => ({
  league: one(leagues, {
    fields: [scrimmages.leagueId],
    references: [leagues.id],
  }),
  creator: one(users, {
    fields: [scrimmages.creatorId],
    references: [users.id],
  }),
  announcement: one(announcements, {
    fields: [scrimmages.announcementId],
    references: [announcements.id],
  }),
  requests: many(scrimmageRequests),
}));

export const scrimmageRequestsRelations = relations(scrimmageRequests, ({ one }) => ({
  scrimmage: one(scrimmages, {
    fields: [scrimmageRequests.scrimmageId],
    references: [scrimmages.id],
  }),
  player: one(users, {
    fields: [scrimmageRequests.playerId],
    references: [users.id],
  }),
}));

export const playerImportsRelations = relations(playerImports, ({ one, many }) => ({
  league: one(leagues, {
    fields: [playerImports.leagueId],
    references: [leagues.id],
  }),
  importedBy: one(users, {
    fields: [playerImports.importedBy],
    references: [users.id],
  }),
  importedPlayers: many(importedPlayers),
}));

export const importedPlayersRelations = relations(importedPlayers, ({ one }) => ({
  import: one(playerImports, {
    fields: [importedPlayers.importId],
    references: [playerImports.id],
  }),
  league: one(leagues, {
    fields: [importedPlayers.leagueId],
    references: [leagues.id],
  }),
  mergedUser: one(users, {
    fields: [importedPlayers.mergedWithUserId],
    references: [users.id],
  }),
}));

export const playerMergeRequestsRelations = relations(playerMergeRequests, ({ one }) => ({
  league: one(leagues, {
    fields: [playerMergeRequests.leagueId],
    references: [leagues.id],
  }),
  importedPlayer: one(importedPlayers, {
    fields: [playerMergeRequests.importedPlayerId],
    references: [importedPlayers.id],
  }),
  existingUser: one(users, {
    fields: [playerMergeRequests.existingUserId],
    references: [users.id],
  }),
  reviewer: one(users, {
    fields: [playerMergeRequests.reviewedBy],
    references: [users.id],
  }),
}));

export const scheduleImportsRelations = relations(scheduleImports, ({ one, many }) => ({
  league: one(leagues, {
    fields: [scheduleImports.leagueId],
    references: [leagues.id],
  }),
  importedBy: one(users, {
    fields: [scheduleImports.importedBy],
    references: [users.id],
  }),
  importedSchedules: many(importedSchedules),
}));

export const importedSchedulesRelations = relations(importedSchedules, ({ one }) => ({
  import: one(scheduleImports, {
    fields: [importedSchedules.importId],
    references: [scheduleImports.id],
  }),
  league: one(leagues, {
    fields: [importedSchedules.leagueId],
    references: [leagues.id],
  }),
  homeTeam: one(teams, {
    fields: [importedSchedules.homeTeamId],
    references: [teams.id],
  }),
  awayTeam: one(teams, {
    fields: [importedSchedules.awayTeamId],
    references: [teams.id],
  }),
  game: one(games, {
    fields: [importedSchedules.gameId],
    references: [games.id],
  }),
}));

export const gameRsvpsRelations = relations(gameRsvps, ({ one }) => ({
  game: one(games, {
    fields: [gameRsvps.gameId],
    references: [games.id],
  }),
  user: one(users, {
    fields: [gameRsvps.userId],
    references: [users.id],
  }),
}));

export const substituteRequestsRelations = relations(substituteRequests, ({ one, many }) => ({
  game: one(games, {
    fields: [substituteRequests.gameId],
    references: [games.id],
  }),
  originalPlayer: one(users, {
    fields: [substituteRequests.originalPlayerId],
    references: [users.id],
    relationName: "originalPlayer",
  }),
  substitutePlayer: one(users, {
    fields: [substituteRequests.substitutePlayerId],
    references: [users.id],
    relationName: "substitutePlayer",
  }),
  requestedByUser: one(users, {
    fields: [substituteRequests.requestedBy],
    references: [users.id],
    relationName: "requestedBy",
  }),
  requestingTeam: one(teams, {
    fields: [substituteRequests.requestingTeamId],
    references: [teams.id],
  }),
  approvals: many(substitutionApprovals),
}));

// Substitution approvals relations
export const substitutionApprovalsRelations = relations(substitutionApprovals, ({ one }) => ({
  substitutionRequest: one(substituteRequests, {
    fields: [substitutionApprovals.substitutionRequestId],
    references: [substituteRequests.id],
  }),
  approver: one(users, {
    fields: [substitutionApprovals.approverId],
    references: [users.id],
  }),
}));

// Line combinations relations
export const lineCombinationsRelations = relations(lineCombinations, ({ one, many }) => ({
  team: one(teams, {
    fields: [lineCombinations.teamId],
    references: [teams.id],
  }),
  game: one(games, {
    fields: [lineCombinations.gameId],
    references: [games.id],
  }),
  assignments: many(lineCombinationAssignments),
}));

export const lineCombinationAssignmentsRelations = relations(lineCombinationAssignments, ({ one }) => ({
  lineCombination: one(lineCombinations, {
    fields: [lineCombinationAssignments.lineCombinationId],
    references: [lineCombinations.id],
  }),
  player: one(users, {
    fields: [lineCombinationAssignments.playerId],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  firstName: true,
  lastName: true,
  primarySport: true,
});

// Admin-only schema for updating user permissions (to be used by commissioners only)
export const updateUserPermissionsSchema = createInsertSchema(users).pick({
  role: true,
  specialPermissions: true,
  isPrimaryCommissioner: true,
  createdBy: true,
});

export const insertLeagueSchema = createInsertSchema(leagues).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTeamSchema = createInsertSchema(teams).omit({
  id: true,
  wins: true,
  losses: true,
  ties: true,
  goalsFor: true,
  goalsAgainst: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLeagueMembershipSchema = createInsertSchema(leagueMemberships).omit({
  id: true,
  requestedAt: true,
  approvedAt: true,
  approvedBy: true,
});

export const insertTeamMembershipSchema = createInsertSchema(teamMemberships).omit({
  id: true,
  joinedAt: true,
  approvedBy: true,
});

export const insertGameSchema = createInsertSchema(games).omit({
  id: true,
  createdAt: true,
}).extend({
  scheduledAt: z.string().transform((val) => new Date(val)),
});

export const insertGameScoreSubmissionSchema = createInsertSchema(gameScoreSubmissions).omit({
  id: true,
  submittedAt: true,
});

export const insertGameGoalieSchema = createInsertSchema(gameGoalies).omit({
  id: true,
  createdAt: true,
});

// Messaging schemas
export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  lastMessageAt: true,
  createdAt: true,
  updatedAt: true,
});

export const insertConversationParticipantSchema = createInsertSchema(conversationParticipants).omit({
  id: true,
  joinedAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  messageType: z.enum(['text', 'image', 'gif', 'file', 'poll']).default('text'),
});

export const insertMessageAttachmentSchema = createInsertSchema(messageAttachments).omit({
  id: true,
  createdAt: true,
});

export const insertMessageReadReceiptSchema = createInsertSchema(messageReadReceipts).omit({
  id: true,
  readAt: true,
});

export const insertTypingIndicatorSchema = createInsertSchema(typingIndicators).omit({
  id: true,
  startedAt: true,
});

export const insertUserOnlineStatusSchema = createInsertSchema(userOnlineStatus).omit({
  id: true,
  updatedAt: true,
});

export const insertPlayerStatsSchema = createInsertSchema(playerStats).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDraftSchema = createInsertSchema(drafts).omit({
  id: true,
  currentRound: true,
  currentTurn: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDraftPickSchema = createInsertSchema(draftPicks).omit({
  id: true,
  pickedAt: true,
  createdAt: true,
});

export const insertSeasonSchema = createInsertSchema(seasons).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPlayerImportSchema = createInsertSchema(playerImports).omit({
  id: true,
  createdAt: true,
});

export const insertImportedPlayerSchema = createInsertSchema(importedPlayers).omit({
  id: true,
  mergedAt: true,
  createdAt: true,
});

export const insertPlayerMergeRequestSchema = createInsertSchema(playerMergeRequests).omit({
  id: true,
  reviewedAt: true,
  createdAt: true,
});

export const insertScheduleImportSchema = createInsertSchema(scheduleImports).omit({
  id: true,
  createdAt: true,
});

export const insertImportedScheduleSchema = createInsertSchema(importedSchedules).omit({
  id: true,
  processedAt: true,
  createdAt: true,
});

export const insertGameRsvpSchema = createInsertSchema(gameRsvps).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});


export const insertAnnouncementSchema = createInsertSchema(announcements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAnnouncementAttachmentSchema = createInsertSchema(announcementAttachments).omit({
  id: true,
  createdAt: true,
});

export const insertAnnouncementReactionSchema = createInsertSchema(announcementReactions).omit({
  id: true,
  createdAt: true,
});

export const insertAnnouncementPollSchema = createInsertSchema(announcementPolls).omit({
  id: true,
  createdAt: true,
});

export const insertAnnouncementPollVoteSchema = createInsertSchema(announcementPollVotes).omit({
  id: true,
  createdAt: true,
});

export const insertChatPollSchema = createInsertSchema(chatPolls).omit({
  id: true,
  createdAt: true,
});

export const insertChatPollVoteSchema = createInsertSchema(chatPollVotes).omit({
  id: true,
  createdAt: true,
});

export const insertScrimmageSchema = createInsertSchema(scrimmages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertScrimmageRequestSchema = createInsertSchema(scrimmageRequests).omit({
  id: true,
  requestedAt: true,
});

// Substitution request schemas
export const insertSubstituteRequestSchema = createInsertSchema(substituteRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  finalizedAt: true,
});

export const insertSubstitutionApprovalSchema = createInsertSchema(substitutionApprovals).omit({
  id: true,
  approvedAt: true,
});

// Client-safe request schemas (omit server-controlled fields)
export const createAnnouncementRequestSchema = createInsertSchema(announcements).omit({
  id: true,
  leagueId: true,  // Server-controlled
  authorId: true,  // Server-controlled
  createdAt: true,
  updatedAt: true,
}).extend({
  targetUserIds: z.array(z.string()).optional(), // For creating targeted announcements
});

export const updateAnnouncementRequestSchema = createInsertSchema(announcements).omit({
  id: true,
  leagueId: true,  // Server-controlled
  authorId: true,  // Server-controlled
  createdAt: true,
  updatedAt: true,
}).extend({
  targetUserIds: z.array(z.string()).optional(), // For updating targeted announcements
}).partial(); // Make all fields optional for updates

export const createAnnouncementAttachmentRequestSchema = createInsertSchema(announcementAttachments).omit({
  id: true,
  announcementId: true, // Server-controlled
  createdAt: true,
});

export const createAnnouncementReactionRequestSchema = createInsertSchema(announcementReactions).omit({
  id: true,
  announcementId: true, // Server-controlled
  userId: true,         // Server-controlled
  createdAt: true,
});

export const createAnnouncementPollRequestSchema = createInsertSchema(announcementPolls).omit({
  id: true,
  announcementId: true, // Server-controlled
  createdAt: true,
});

export const createAnnouncementPollVoteRequestSchema = createInsertSchema(announcementPollVotes).omit({
  id: true,
  pollId: true,    // Server-controlled
  userId: true,    // Server-controlled
  createdAt: true,
});

export const createChatPollRequestSchema = createInsertSchema(chatPolls).omit({
  id: true,
  messageId: true, // Server-controlled
  createdAt: true,
});

export const createChatPollVoteRequestSchema = createInsertSchema(chatPollVotes).omit({
  id: true,
  pollId: true,    // Server-controlled
  userId: true,    // Server-controlled
  createdAt: true,
});

export const createScrimmageRequestSchema = createInsertSchema(scrimmages).omit({
  id: true,
  leagueId: true,     // Server-controlled
  creatorId: true,    // Server-controlled
  announcementId: true, // Server-controlled
  createdAt: true,
  updatedAt: true,
});

export const createScrimmageJoinRequestSchema = createInsertSchema(scrimmageRequests).omit({
  id: true,
  scrimmageId: true,  // Server-controlled
  playerId: true,     // Server-controlled
  requestedAt: true,
  approvedAt: true,
  dismissedAt: true,
});

export const updateScrimmageRequestSchema = createInsertSchema(scrimmages).omit({
  id: true,
  leagueId: true,     // Server-controlled
  creatorId: true,    // Server-controlled
  announcementId: true, // Server-controlled
  createdAt: true,
  updatedAt: true,
}).partial().extend({
  dateTime: z.string().transform((val) => new Date(val)).optional(),
});

// Substitute request API validation schemas
export const createSubstituteRequestSchema = createInsertSchema(substituteRequests).omit({
  id: true,
  requestedBy: true,      // Server-controlled
  requestingTeamId: true, // Server-controlled
  status: true,           // Server-controlled
  createdAt: true,
  updatedAt: true,
  finalizedAt: true,
}).extend({
  expiresAt: z.string().transform((val) => new Date(val)).optional(),
});

export const getSubstituteRequestsQuerySchema = z.object({
  status: z.enum(['pending_opponent_approval', 'pending_commissioner_approval', 'pending_substitute_approval', 'approved', 'denied', 'expired']).optional(),
  gameId: z.string().optional(),
  requestingTeamId: z.string().optional(),
});

export const approveSubstituteRequestSchema = z.object({
  approverType: z.enum(['opposing_captain', 'commissioner', 'substitute_player']),
  status: z.enum(['approved', 'denied']),
  comments: z.string().optional(),
});

export const getPendingApprovalsQuerySchema = z.object({
  approverType: z.enum(['opposing_captain', 'commissioner', 'substitute_player']).optional(),
});

export const updateSubstituteRequestSchema = z.object({
  reason: z.string().optional(),
  expiresAt: z.string().transform((val) => new Date(val)).optional(),
  substitutePlayerId: z.string().optional(),
});

// Line combinations schemas
export const insertLineCombinationSchema = createInsertSchema(lineCombinations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLineCombinationAssignmentSchema = createInsertSchema(lineCombinationAssignments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const createLineCombinationRequestSchema = createInsertSchema(lineCombinations).omit({
  id: true,
  teamId: true, // Server-controlled
  createdAt: true,
  updatedAt: true,
});

export const createLineCombinationAssignmentRequestSchema = createInsertSchema(lineCombinationAssignments).omit({
  id: true,
  lineCombinationId: true, // Server-controlled
  createdAt: true,
  updatedAt: true,
});

export const updateLineCombinationRequestSchema = createInsertSchema(lineCombinations).omit({
  id: true,
  teamId: true, // Server-controlled
  createdAt: true,
  updatedAt: true,
}).partial();

// Feedback schemas
export const insertFeedbackSubmissionSchema = createInsertSchema(feedbackSubmissions).omit({
  id: true,
  userId: true, // Server-controlled
  createdAt: true,
});

export const createFeedbackSubmissionSchema = z.object({
  category: z.enum(["product_improvement", "report_issue"]),
  message: z.string().min(1, "Message is required").max(5000, "Message is too long"),
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type League = typeof leagues.$inferSelect;
export type InsertLeague = z.infer<typeof insertLeagueSchema>;
export type Season = typeof seasons.$inferSelect;
export type InsertSeason = z.infer<typeof insertSeasonSchema>;
export type Team = typeof teams.$inferSelect;
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type LeagueMembership = typeof leagueMemberships.$inferSelect;
export type InsertLeagueMembership = z.infer<typeof insertLeagueMembershipSchema>;
export type TeamMembership = typeof teamMemberships.$inferSelect;
export type InsertTeamMembership = z.infer<typeof insertTeamMembershipSchema>;
export type Game = typeof games.$inferSelect;
export type InsertGame = z.infer<typeof insertGameSchema>;
export type GameScoreSubmission = typeof gameScoreSubmissions.$inferSelect;
export type InsertGameScoreSubmission = z.infer<typeof insertGameScoreSubmissionSchema>;
export type GameGoalie = typeof gameGoalies.$inferSelect;
export type InsertGameGoalie = z.infer<typeof insertGameGoalieSchema>;
// Messaging types
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type ConversationParticipant = typeof conversationParticipants.$inferSelect;
export type InsertConversationParticipant = z.infer<typeof insertConversationParticipantSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type MessageAttachment = typeof messageAttachments.$inferSelect;
export type InsertMessageAttachment = z.infer<typeof insertMessageAttachmentSchema>;
export type MessageReadReceipt = typeof messageReadReceipts.$inferSelect;
export type InsertMessageReadReceipt = z.infer<typeof insertMessageReadReceiptSchema>;
export type TypingIndicator = typeof typingIndicators.$inferSelect;
export type InsertTypingIndicator = z.infer<typeof insertTypingIndicatorSchema>;
export type UserOnlineStatus = typeof userOnlineStatus.$inferSelect;
export type InsertUserOnlineStatus = z.infer<typeof insertUserOnlineStatusSchema>;
export type PlayerStats = typeof playerStats.$inferSelect;
export type InsertPlayerStats = z.infer<typeof insertPlayerStatsSchema>;
export type Draft = typeof drafts.$inferSelect;
export type InsertDraft = z.infer<typeof insertDraftSchema>;
export type DraftPick = typeof draftPicks.$inferSelect;
export type InsertDraftPick = z.infer<typeof insertDraftPickSchema>;
export type PlayerImport = typeof playerImports.$inferSelect;
export type InsertPlayerImport = z.infer<typeof insertPlayerImportSchema>;

// Discriminated union types for player statistics
export type GoalieStats = {
  type: 'goalie';
  userId: string;
  teamId?: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  shootoutLosses: number;
  goalsAgainst: number;
  goalsAgainstAverage: number;
  user: User;
};

export type SkaterStats = {
  type: 'skater';
  id?: string;
  leagueId?: string;
  seasonId?: string;
  userId: string;
  gamesPlayed: number;
  goals: number;
  assists: number;
  penaltyMinutes: number;
  points: number;
  isGoalie?: boolean;
  user: User;
};

export type PlayerStatsUnion = GoalieStats | SkaterStats;
export type ImportedPlayer = typeof importedPlayers.$inferSelect;
export type InsertImportedPlayer = z.infer<typeof insertImportedPlayerSchema>;
export type PlayerMergeRequest = typeof playerMergeRequests.$inferSelect;
export type InsertPlayerMergeRequest = z.infer<typeof insertPlayerMergeRequestSchema>;
export type ScheduleImport = typeof scheduleImports.$inferSelect;
export type InsertScheduleImport = z.infer<typeof insertScheduleImportSchema>;
export type ImportedSchedule = typeof importedSchedules.$inferSelect;
export type InsertImportedSchedule = z.infer<typeof insertImportedScheduleSchema>;
export type GameRsvp = typeof gameRsvps.$inferSelect;
export type InsertGameRsvp = z.infer<typeof insertGameRsvpSchema>;
export type SubstituteRequest = typeof substituteRequests.$inferSelect;
export type InsertSubstituteRequest = z.infer<typeof insertSubstituteRequestSchema>;
export type SubstitutionApproval = typeof substitutionApprovals.$inferSelect;
export type InsertSubstitutionApproval = z.infer<typeof insertSubstitutionApprovalSchema>;
export type Announcement = typeof announcements.$inferSelect;
export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;
export type AnnouncementAttachment = typeof announcementAttachments.$inferSelect;
export type InsertAnnouncementAttachment = z.infer<typeof insertAnnouncementAttachmentSchema>;
export type AnnouncementReaction = typeof announcementReactions.$inferSelect;
export type InsertAnnouncementReaction = z.infer<typeof insertAnnouncementReactionSchema>;
export type AnnouncementPoll = typeof announcementPolls.$inferSelect;
export type InsertAnnouncementPoll = z.infer<typeof insertAnnouncementPollSchema>;
export type AnnouncementPollVote = typeof announcementPollVotes.$inferSelect;
export type InsertAnnouncementPollVote = z.infer<typeof insertAnnouncementPollVoteSchema>;
export type CreateAnnouncementRequest = z.infer<typeof createAnnouncementRequestSchema>;
export type UpdateAnnouncementRequest = z.infer<typeof updateAnnouncementRequestSchema>;
export type CreateAnnouncementAttachmentRequest = z.infer<typeof createAnnouncementAttachmentRequestSchema>;
export type CreateAnnouncementReactionRequest = z.infer<typeof createAnnouncementReactionRequestSchema>;
export type CreateAnnouncementPollRequest = z.infer<typeof createAnnouncementPollRequestSchema>;
export type CreateAnnouncementPollVoteRequest = z.infer<typeof createAnnouncementPollVoteRequestSchema>;
export type ChatPoll = typeof chatPolls.$inferSelect;
export type InsertChatPoll = z.infer<typeof insertChatPollSchema>;
export type ChatPollVote = typeof chatPollVotes.$inferSelect;
export type InsertChatPollVote = z.infer<typeof insertChatPollVoteSchema>;
export type CreateChatPollRequest = z.infer<typeof createChatPollRequestSchema>;
export type CreateChatPollVoteRequest = z.infer<typeof createChatPollVoteRequestSchema>;
export type Scrimmage = typeof scrimmages.$inferSelect;
export type InsertScrimmage = z.infer<typeof insertScrimmageSchema>;
export type ScrimmageRequest = typeof scrimmageRequests.$inferSelect;
export type InsertScrimmageRequest = z.infer<typeof insertScrimmageRequestSchema>;
export type CreateScrimmageRequest = z.infer<typeof createScrimmageRequestSchema>;
export type UpdateScrimmageRequest = z.infer<typeof updateScrimmageRequestSchema>;
export type CreateScrimmageJoinRequest = z.infer<typeof createScrimmageJoinRequestSchema>;

// Line combinations types
export type LineCombination = typeof lineCombinations.$inferSelect;
export type InsertLineCombination = z.infer<typeof insertLineCombinationSchema>;
export type LineCombinationAssignment = typeof lineCombinationAssignments.$inferSelect;
export type InsertLineCombinationAssignment = z.infer<typeof insertLineCombinationAssignmentSchema>;
export type CreateLineCombinationRequest = z.infer<typeof createLineCombinationRequestSchema>;
export type CreateLineCombinationAssignmentRequest = z.infer<typeof createLineCombinationAssignmentRequestSchema>;
export type UpdateLineCombinationRequest = z.infer<typeof updateLineCombinationRequestSchema>;

// Extended line combinations types
export type LineCombinationWithAssignments = LineCombination & {
  assignments: (LineCombinationAssignment & {
    player: User;
  })[];
};

export type LineAssignmentWithPlayer = LineCombinationAssignment & {
  player: User;
};

// Extended types with relationships
export type GameWithTeams = Game & {
  homeTeam: Team;
  awayTeam: Team;
};

export type TeamMemberWithUser = TeamMembership & {
  user: User;
};

export type UserTeam = Team;

// Feedback types
export type FeedbackSubmission = typeof feedbackSubmissions.$inferSelect;
export type InsertFeedbackSubmission = z.infer<typeof insertFeedbackSubmissionSchema>;
export type CreateFeedbackSubmissionRequest = z.infer<typeof createFeedbackSubmissionSchema>;
