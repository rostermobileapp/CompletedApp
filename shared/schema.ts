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
  check,
  primaryKey,
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

// Visitor count table
export const visitorCount = pgTable("visitor_count", {
  id: integer("id").primaryKey().default(1),
  count: integer("count").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Visitor locations table — hashed IPs only, US/CA only
export const visitorLocations = pgTable("visitor_locations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  ipHash: text("ip_hash").notNull(),
  lat: decimal("lat", { precision: 9, scale: 6 }).notNull(),
  lng: decimal("lng", { precision: 9, scale: 6 }).notNull(),
  city: text("city"),
  country: text("country").notNull(),
  visitedAt: timestamp("visited_at").defaultNow().notNull(),
}, (table) => [
  index("idx_visitor_locations_ip_hash").on(table.ipHash),
  index("idx_visitor_locations_visited_at").on(table.visitedAt),
]);

export const insertVisitorLocationSchema = createInsertSchema(visitorLocations).omit({ id: true, visitedAt: true });
export type InsertVisitorLocation = z.infer<typeof insertVisitorLocationSchema>;
export type VisitorLocation = typeof visitorLocations.$inferSelect;

// User registration count - monotonically increasing, never decreases
export const userRegistrationCount = pgTable("user_registration_count", {
  id: integer("id").primaryKey().default(1),
  count: integer("count").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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

// Sub approval workflow enum - configures who must approve substitutions after the sub player confirms
export const subApprovalWorkflowEnum = pgEnum("sub_approval_workflow", [
  "substitute_only",
  "captain_only",
  "commissioner_only",
  "captain_and_commissioner",
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

// Duty scope enum
export const dutyScopeEnum = pgEnum("duty_scope", [
  "single_game",
  "every_game"
]);

// Scrimmage request status enum
export const scrimmageRequestStatusEnum = pgEnum("scrimmage_request_status", [
  "pending",
  "approved",
  "dismissed"
]);

// Recurrence type enum for recurring events
export const recurrenceTypeEnum = pgEnum("recurrence_type", [
  "none",
  "daily",
  "weekly",
  "monthly"
]);

// Game result type enum
export const gameResultTypeEnum = pgEnum("game_result_type", [
  "regulation",
  "overtime", 
  "shootout"
]);

// Tournament type enum
export const tournamentTypeEnum = pgEnum("tournament_type", [
  "season_playoff",
  "standalone"
]);

// Tournament format enum
export const tournamentFormatEnum = pgEnum("tournament_format", [
  "single_elimination",
  "double_elimination",
  "round_robin",
  "round_robin_split",
  "three_game_guarantee",
  "custom_bracket"
]);

// Tournament status enum
export const tournamentStatusEnum = pgEnum("tournament_status", [
  "draft",
  "active",
  "completed"
]);

// Tournament payment status enum
export const tournamentPaymentStatusEnum = pgEnum("tournament_payment_status", [
  "unpaid",
  "paid",
  "expired"
]);

// Tournament participant role enum
export const tournamentParticipantRoleEnum = pgEnum("tournament_participant_role", [
  "commissioner",
  "player"
]);

// Tournament participant status enum
export const tournamentParticipantStatusEnum = pgEnum("tournament_participant_status", [
  "pending",
  "approved",
  "rejected",
  "expired"
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

// Payment method enum for payment requests
export const paymentMethodEnum = pgEnum("payment_method", [
  "venmo",
  "cashapp",
  "cash",
  "other"
]);

// Player type enum
export const playerTypeEnum = pgEnum("player_type", [
  "Skater",
  "Goalie"
]);

export const competitiveLevelEnum = pgEnum("competitive_level", [
  "Recreational",
  "Competitive",
  "Semi-Pro",
  "Pro"
]);

export const rosterUseCaseEnum = pgEnum("roster_use_case", [
  "join_team",
  "manage_team",
  "manage_league"
]);

// Notification type enum
export const notificationTypeEnum = pgEnum("notification_type", [
  "payment_failed",
  "subscription_canceled",
  "subscription_renewed",
  "general",
  "scrimmage_invite",
  "scrimmage_reminder",
  "scrimmage_approved",
  "scrimmage_updated",
  "scrimmage_canceled",
  "game_reminder",
  "scrimmage_cohost_added",
  "scrimmage_cohost_removed",
  "player_rsvp",
  "photo_tag"
]);

// Users table (required for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  displayId: varchar("display_id", { length: 6 }).unique(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  age: integer("age"),
  dateOfBirth: varchar("date_of_birth"),
  phoneNumber: varchar("phone_number"),
  city: varchar("city"),
  zipCode: varchar("zip_code"),
  lat: decimal("lat", { precision: 9, scale: 6 }),
  lng: decimal("lng", { precision: 9, scale: 6 }),
  primarySport: sportEnum("primary_sport"),
  playerType: playerTypeEnum("player_type"),
  shoots: text("shoots"), // 'left' | 'right' — handedness for draft tool
  // Permission system fields
  role: userRoleEnum("role").default("free_tier").notNull(),
  specialPermissions: specialPermissionEnum("special_permissions").array(),
  isPrimaryCommissioner: boolean("is_primary_commissioner").default(false).notNull(),
  createdBy: varchar("created_by"), // Will add reference after table definition
  // Stripe subscription fields
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  // Apple IAP fields
  iapOriginalTransactionId: varchar("iap_original_transaction_id"),
  // Payment method fields for receiving payments
  venmoUsername: varchar("venmo_username"),
  cashappUsername: varchar("cashapp_username"),
  // Timezone preference for displaying dates/times
  timezone: varchar("timezone").default("America/New_York"),
  timezoneManuallySet: boolean("timezone_manually_set").default(false),
  // Navigation preferences
  navigationPreferences: jsonb("navigation_preferences"),
  competitiveLevel: competitiveLevelEnum("competitive_level"),
  rosterUseCase: rosterUseCaseEnum("roster_use_case"),
  // Onboarding tracking
  onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),
  onboardingProgress: jsonb("onboarding_progress"),
  selectedFacilityId: varchar("selected_facility_id"),
  // Referral attribution (set during onboarding)
  referralCode: varchar("referral_code", { length: 20 }),
  referralPartnerId: varchar("referral_partner_id").references(() => referralPartners.id, { onDelete: 'set null' }),
  referralSourceOther: text("referral_source_other"),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"), // Soft-delete tombstone; set instead of hard-deleting the row
});

// User notifications table
export const userNotifications = pgTable("user_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  type: notificationTypeEnum("type").notNull(),
  title: varchar("title").notNull(),
  message: text("message").notNull(),
  actionUrl: varchar("action_url"),
  actionText: varchar("action_text"),
  isRead: boolean("is_read").default(false).notNull(),
  isDismissed: boolean("is_dismissed").default(false).notNull(),
  // Optional reference to related entities (scrimmage, game, etc.)
  scrimmageId: varchar("scrimmage_id"), // Reference to scrimmage for scrimmage notifications
  gameId: varchar("game_id"), // Reference to game for game notifications
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_user_notifications_user").on(table.userId),
  index("idx_user_notifications_read").on(table.isRead),
  index("idx_user_notifications_scrimmage").on(table.scrimmageId),
  index("idx_user_notifications_game").on(table.gameId),
]);

// Push notification preferences table - stores user's OneSignal player ID and notification settings
export const notificationPreferences = pgTable("notification_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
  oneSignalPlayerId: varchar("onesignal_player_id"), // OneSignal player/subscription ID
  oneSignalExternalId: varchar("onesignal_external_id"), // External ID linked in OneSignal (should match user's displayId)
  // JSONB field for flexible notification type preferences
  // Default: all notification types enabled
  notificationSettings: jsonb("notification_settings").default({
    inAppMessages: true,
    paymentRequests: true,
    substitutionRequests: true,
    joinRequests: true,
    upcomingEvents: true,
    newsAnnouncements: true,
    scrimmageInvites: true,
    playerRsvpUpdates: true,
    photoTagNotifications: true,
  }).notNull(),
  pushEnabled: boolean("push_enabled").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_notification_prefs_user").on(table.userId),
  index("idx_notification_prefs_player_id").on(table.oneSignalPlayerId),
]);

// Leagues table
export const leagues = pgTable("leagues", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  uniqueLeagueId: varchar("unique_league_id").unique().notNull(), // For players to search and join
  sport: sportEnum("sport").notNull(),
  description: text("description"),
  location: varchar("location"),
  timezone: varchar("timezone").default("America/New_York"), // IANA timezone for date formatting
  rinkName: varchar("rink_name"), // Added for commissioner feature
  rinkAddress: text("rink_address"), // Added for commissioner feature
  facilityId: varchar("facility_id"), // Link to facility - will add reference after facilities table is defined
  season: varchar("season"),
  commissionerId: varchar("commissioner_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  maxTeams: integer("max_teams").default(16),
  isActive: boolean("is_active").default(true).notNull(),
  playoffStarted: boolean("playoff_started").default(false).notNull(),
  playoffBracket: jsonb("playoff_bracket"), // Store playoff bracket data
  subApprovalWorkflow: subApprovalWorkflowEnum("sub_approval_workflow").default("captain_and_commissioner").notNull(),
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
  uniqueTeamId: varchar("unique_team_id").unique(), // ABC123 format for standalone teams to be searchable
  leagueId: varchar("league_id").references(() => leagues.id), // Made nullable for standalone teams
  seasonId: varchar("season_id").references(() => seasons.id), // Made nullable for safe migration
  captainId: varchar("captain_id").references(() => users.id, { onDelete: 'cascade' }),
  creatorId: varchar("creator_id").references(() => users.id, { onDelete: 'cascade' }), // Track who created the team
  facilityId: varchar("facility_id").references(() => facilities.id), // Optional facility for standalone teams
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
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  leagueId: varchar("league_id").references(() => leagues.id).notNull(),
  skillLevel: varchar("skill_level"), // Text field for skill level (number or letter)
  status: membershipStatusEnum("status").default("pending").notNull(),
  message: text("message"), // Optional personalized message when requesting to join
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  approvedAt: timestamp("approved_at"),
  approvedBy: varchar("approved_by").references(() => users.id, { onDelete: 'cascade' }),
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
  isSkater: boolean("is_skater").default(true).notNull(), // Default to skater
  // League-specific permissions
  leagueRole: userRoleEnum("league_role").default("free_tier"), // Role within this specific league
  leagueSpecialPermissions: specialPermissionEnum("league_special_permissions").array(), // Special permissions within this league
});

// League-wide Player Pro grants — a commissioner pre-pays Player Pro for a
// fixed number of seats over a fixed month window. The grant is the source of
// truth for "this league has X paid Pro seats from M1 to M2"; individual seat
// assignments live in `leagueProSeats`.
export const leagueProGrants = pgTable("league_pro_grants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").references(() => leagues.id, { onDelete: 'cascade' }).notNull(),
  paidByUserId: varchar("paid_by_user_id").references(() => users.id, { onDelete: 'set null' }),
  seatCount: integer("seat_count").notNull(),
  // Month window stored as 'YYYY-MM' strings for unambiguous month math
  startMonth: varchar("start_month", { length: 7 }).notNull(),
  endMonth: varchar("end_month", { length: 7 }).notNull(),
  monthsCount: integer("months_count").notNull(),
  perPlayerMonthlyCents: integer("per_player_monthly_cents").notNull(),
  individualTotalCents: integer("individual_total_cents").notNull(),
  discountedTotalCents: integer("discounted_total_cents").notNull(),
  savingsCents: integer("savings_cents").notNull(),
  discountPercent: integer("discount_percent").notNull(),
  status: varchar("status", { length: 16 }).default("pending").notNull(), // pending | paid | cancelled
  stripeCheckoutSessionId: varchar("stripe_checkout_session_id").unique(),
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_league_pro_grants_league").on(table.leagueId),
  index("idx_league_pro_grants_status").on(table.status),
]);

// Individual Player Pro seat assignments tied to a grant. One row per
// (grant, user); the unique constraint guarantees the same user cannot
// occupy more than one seat in the same grant.
export const leagueProSeats = pgTable("league_pro_seats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  grantId: varchar("grant_id").references(() => leagueProGrants.id, { onDelete: 'cascade' }).notNull(),
  leagueId: varchar("league_id").references(() => leagues.id, { onDelete: 'cascade' }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
}, (table) => [
  unique("league_pro_seats_grant_user_unique").on(table.grantId, table.userId),
  index("idx_league_pro_seats_user_league").on(table.userId, table.leagueId),
  index("idx_league_pro_seats_grant").on(table.grantId),
]);

// Team memberships table
export const teamMemberships = pgTable("team_memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  teamId: varchar("team_id").references(() => teams.id).notNull(),
  position: varchar("position"),
  jerseyNumber: integer("jersey_number"),
  skillLevel: varchar("skill_level"), // Text field for skill level (number or letter)
  status: membershipStatusEnum("status").default("pending").notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  approvedBy: varchar("approved_by").references(() => users.id, { onDelete: 'cascade' }),
  isCaptain: boolean("is_captain").default(false).notNull(), // Allows multiple captains per team
});

// Placeholder players table - for players added before they have accounts
export const placeholderPlayers = pgTable("placeholder_players", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // teamId is now nullable: league-level adds may not assign a team yet.
  teamId: varchar("team_id").references(() => teams.id),
  // leagueId/seasonId let placeholders live at the league level (e.g. created
  // via "Add Player" in the league Players tab without a team picked).
  leagueId: varchar("league_id").references(() => leagues.id),
  seasonId: varchar("season_id").references(() => seasons.id),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  email: varchar("email"), // Optional - may not have email yet
  phoneNumber: varchar("phone_number"),
  position: varchar("position"),
  jerseyNumber: integer("jersey_number"),
  skillLevel: varchar("skill_level"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  addedBy: varchar("added_by").references(() => users.id, { onDelete: 'cascade' }), // Who added this placeholder
});

// Team-to-league join requests table
export const teamLeagueRequests = pgTable("team_league_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").references(() => teams.id).notNull(),
  leagueId: varchar("league_id").references(() => leagues.id).notNull(),
  requestedBy: varchar("requested_by").references(() => users.id, { onDelete: 'cascade' }).notNull(), // Team creator who made the request
  status: membershipStatusEnum("status").default("pending").notNull(),
  message: text("message"), // Optional personalized message when requesting to join
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  approvedAt: timestamp("approved_at"),
  approvedBy: varchar("approved_by").references(() => users.id, { onDelete: 'cascade' }), // League commissioner who approved
  rejectedAt: timestamp("rejected_at"),
}, (table) => [
  unique("unique_team_league_request").on(table.teamId, table.leagueId),
  index("idx_team_league_requests_team").on(table.teamId),
  index("idx_team_league_requests_league").on(table.leagueId),
  index("idx_team_league_requests_status").on(table.status),
]);

// Games table
export const games = pgTable("games", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").references(() => leagues.id), // Made nullable for standalone team games
  seasonId: varchar("season_id").references(() => seasons.id), // Made nullable for safe migration
  homeTeamId: varchar("home_team_id").references(() => teams.id).notNull(),
  awayTeamId: varchar("away_team_id").references(() => teams.id), // Made nullable for standalone team games
  opponentName: varchar("opponent_name"), // Name of opponent when awayTeamId is null
  scheduledAt: timestamp("scheduled_at", { mode: 'string' }).notNull(),
  venue: varchar("venue"),
  lockerRoom: varchar("locker_room"),
  homeTeamLockerRoom: varchar("home_team_locker_room"),
  awayTeamLockerRoom: varchar("away_team_locker_room"),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  isCompleted: boolean("is_completed").default(false).notNull(),
  isScrimmage: boolean("is_scrimmage").default(false).notNull(), // True if scrimmage (doesn't count for standings/stats)
  homeBeverageDutyUserId: varchar("home_beverage_duty_user_id").references(() => users.id, { onDelete: 'cascade' }),
  homeBeverageDutyClaimedAt: timestamp("home_beverage_duty_claimed_at"),
  awayBeverageDutyUserId: varchar("away_beverage_duty_user_id").references(() => users.id, { onDelete: 'cascade' }),
  awayBeverageDutyClaimedAt: timestamp("away_beverage_duty_claimed_at"),
  resultType: gameResultTypeEnum("result_type").default("regulation"),
  color: text("color"), // Optional color for calendar display (e.g. "#ef4444")
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Duty templates table - defines the types of duties (beverage, custom, etc.)
export const dutyTemplates = pgTable("duty_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").references(() => teams.id).notNull(), // Which team this duty belongs to
  name: varchar("name").notNull(), // e.g., "Beverages", "Snacks", "Camera"
  icon: varchar("icon").notNull(), // Icon name from lucide-react
  scope: dutyScopeEnum("scope").notNull(), // single_game or every_game
  isDefault: boolean("is_default").default(false).notNull(), // true for beverage duty
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'cascade' }).notNull(), // Captain who created it
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_duty_templates_team_id").on(table.teamId),
]);

// Duty assignments table - tracks who claimed which duty for which game
// Note: gameId can be a regular game ID OR a tournament match ID (no foreign key constraint)
export const dutyAssignments = pgTable("duty_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dutyTemplateId: varchar("duty_template_id").references(() => dutyTemplates.id).notNull(),
  gameId: varchar("game_id").notNull(), // Can be game ID or tournament match ID
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(), // Who claimed it
  teamId: varchar("team_id").references(() => teams.id).notNull(), // Which team they're representing
  claimedAt: timestamp("claimed_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_duty_game_assignment").on(table.dutyTemplateId, table.gameId, table.teamId),
  index("idx_duty_assignments_game_id").on(table.gameId),
  index("idx_duty_assignments_user_id").on(table.userId),
  index("idx_duty_assignments_template_id").on(table.dutyTemplateId),
]);

// Duty exclusions table - tracks which duties are excluded from specific games
// Note: gameId can be a regular game ID OR a tournament match ID (no foreign key constraint)
export const dutyExclusions = pgTable("duty_exclusions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dutyTemplateId: varchar("duty_template_id").references(() => dutyTemplates.id).notNull(),
  gameId: varchar("game_id").notNull(), // Can be game ID or tournament match ID
  teamId: varchar("team_id").references(() => teams.id).notNull(),
  excludedAt: timestamp("excluded_at").defaultNow().notNull(),
  excludedBy: varchar("excluded_by").references(() => users.id, { onDelete: 'cascade' }).notNull(),
}, (table) => [
  unique("unique_duty_game_exclusion").on(table.dutyTemplateId, table.gameId, table.teamId),
  index("idx_duty_exclusions_game_id").on(table.gameId),
  index("idx_duty_exclusions_template_id").on(table.dutyTemplateId),
]);

// Tournaments table
export const tournaments = pgTable("tournaments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  leagueId: varchar("league_id").references(() => leagues.id), // null for standalone tournaments
  seasonId: varchar("season_id").references(() => seasons.id), // null for standalone
  type: tournamentTypeEnum("type").notNull(),
  format: tournamentFormatEnum("format").notNull(),
  status: tournamentStatusEnum("status").default("draft").notNull(),
  numTeams: integer("num_teams").notNull(),
  startDate: timestamp("start_date"),
  description: text("description"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  settings: jsonb("settings"), // seeding method, division count, etc.
  // Payment and access control fields
  uniqueTournamentId: varchar("unique_tournament_id", { length: 8 }).unique(),
  paymentStatus: tournamentPaymentStatusEnum("payment_status").default("unpaid"),
  paymentAmount: integer("payment_amount").default(0).notNull(), // in cents: teamCount × 1000
  paidTeamCount: integer("paid_team_count").default(0).notNull(), // number of teams paid for
  accessStartDate: timestamp("access_start_date"), // 3 days before first match
  accessEndDate: timestamp("access_end_date"), // 3 days after last match
  accessInvitesSentAt: timestamp("access_invites_sent_at"), // when window-open emails were sent
  accessClosingReminderSentAt: timestamp("access_closing_reminder_sent_at"), // when 24h-close push was sent
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  stripeCheckoutSessionId: varchar("stripe_checkout_session_id"),
  stripeProcessedSessionIds: text("stripe_processed_session_ids").array().default(sql`'{}'::text[]`).notNull(),
  // League visibility fields
  isVisibleToLeague: boolean("is_visible_to_league").default(false).notNull(),
  visibleToLeagueAt: timestamp("visible_to_league_at"),
  // Optional creator-uploaded logo (relative path, e.g. /tournament-logos/<uuid>)
  logoUrl: varchar("logo_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_tournaments_league_id").on(table.leagueId),
  index("idx_tournaments_season_id").on(table.seasonId),
  index("idx_tournaments_status").on(table.status),
  index("idx_tournaments_unique_id").on(table.uniqueTournamentId),
  index("idx_tournaments_payment_status").on(table.paymentStatus),
]);

// Tournament teams table
export const tournamentTeams = pgTable("tournament_teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tournamentId: varchar("tournament_id").references(() => tournaments.id).notNull(),
  teamId: varchar("team_id").references(() => teams.id), // null if new team for standalone
  teamName: varchar("team_name").notNull(), // denormalized for flexibility
  // Optional logo for this tournament-team. Stored as a normalized object-storage
  // path (e.g. /team-logos/<uuid>) — see /api/tournament-teams/:teamId PATCH.
  // Used for standalone tournament entries that have no linked teams row.
  logoUrl: varchar("logo_url"),
  seed: integer("seed").notNull(),
  division: varchar("division"), // for split round robin
  wins: integer("wins").default(0).notNull(),
  losses: integer("losses").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_tournament_teams_tournament_id").on(table.tournamentId),
  index("idx_tournament_teams_team_id").on(table.teamId),
]);

// Tournament matches table  
export const tournamentMatches = pgTable("tournament_matches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tournamentId: varchar("tournament_id").references(() => tournaments.id).notNull(),
  gameId: varchar("game_id").references(() => games.id), // link to actual game record for calendar
  round: varchar("round").notNull(), // "Round 1", "Semifinals", "Finals", "Division A"
  matchNumber: integer("match_number").notNull(),
  bracketType: varchar("bracket_type"), // "winners", "losers", "losers1", "losers2", "guarantee", "grand_final", "main", "championship", "consolation" etc.
  team1Id: varchar("team1_id").references(() => tournamentTeams.id),
  team2Id: varchar("team2_id").references(() => tournamentTeams.id),
  winnerId: varchar("winner_id").references(() => tournamentTeams.id),
  team1Score: integer("team1_score"),
  team2Score: integer("team2_score"),
  advancesToMatchId: varchar("advances_to_match_id"), // Self-reference - ID of next match winner advances to
  scheduledTime: timestamp("scheduled_time", { mode: 'string' }),
  location: varchar("location"),
  status: varchar("status").default("scheduled"), // scheduled, in_progress, completed
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_tournament_matches_tournament_id").on(table.tournamentId),
  index("idx_tournament_matches_game_id").on(table.gameId),
  index("idx_tournament_matches_team1").on(table.team1Id),
  index("idx_tournament_matches_team2").on(table.team2Id),
]);

// Tournament stats table - separate from season stats
export const tournamentStats = pgTable("tournament_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tournamentId: varchar("tournament_id").references(() => tournaments.id).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  teamId: varchar("team_id").references(() => tournamentTeams.id).notNull(),
  gamesPlayed: integer("games_played").default(0).notNull(),
  goals: integer("goals").default(0).notNull(),
  assists: integer("assists").default(0).notNull(),
  points: integer("points").default(0).notNull(),
  penaltyMinutes: integer("penalty_minutes").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_tournament_user_team_stats").on(table.tournamentId, table.userId, table.teamId),
  index("idx_tournament_stats_tournament_id").on(table.tournamentId),
  index("idx_tournament_stats_user_id").on(table.userId),
  index("idx_tournament_stats_team_id").on(table.teamId),
]);

// Tournament participants table - tracks who has access to a tournament
export const tournamentParticipants = pgTable("tournament_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tournamentId: varchar("tournament_id").references(() => tournaments.id).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  tournamentTeamId: varchar("tournament_team_id").references(() => tournamentTeams.id), // assigned team
  role: tournamentParticipantRoleEnum("role").default("player").notNull(),
  status: tournamentParticipantStatusEnum("status").default("pending").notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"), // auto-set from tournament accessEndDate
  approvedBy: varchar("approved_by").references(() => users.id, { onDelete: 'cascade' }),
  approvedAt: timestamp("approved_at"),
  message: text("message"), // optional message when joining
  accessOpenedNotifiedAt: timestamp("access_opened_notified_at"), // when access-open push/email was delivered to this participant
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_tournament_user_participant").on(table.tournamentId, table.userId),
  index("idx_tournament_participants_tournament_id").on(table.tournamentId),
  index("idx_tournament_participants_user_id").on(table.userId),
  index("idx_tournament_participants_status").on(table.status),
  index("idx_tournament_participants_expires_at").on(table.expiresAt),
]);

// Tournament scorekeeper invites - tracks who can score matches for a tournament
export const tournamentScorekeeperInvites = pgTable("tournament_scorekeeper_invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tournamentId: varchar("tournament_id").references(() => tournaments.id, { onDelete: 'cascade' }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  invitedBy: varchar("invited_by").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_tournament_scorekeeper").on(table.tournamentId, table.userId),
  index("idx_tournament_scorekeeper_tournament_id").on(table.tournamentId),
  index("idx_tournament_scorekeeper_user_id").on(table.userId),
]);

export type TournamentScorekeeperInvite = typeof tournamentScorekeeperInvites.$inferSelect;

// Tournament photos table - stores photos uploaded to tournaments
export const tournamentPhotos = pgTable("tournament_photos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tournamentId: varchar("tournament_id").references(() => tournaments.id, { onDelete: 'cascade' }).notNull(),
  uploadedBy: varchar("uploaded_by").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull().default(0),
  caption: text("caption"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
}, (table) => [
  index("idx_tournament_photos_tournament_id").on(table.tournamentId),
  index("idx_tournament_photos_uploaded_by").on(table.uploadedBy),
  index("idx_tournament_photos_uploaded_at").on(table.uploadedAt),
]);

// League photos table - stores photos uploaded to leagues
export const leaguePhotos = pgTable("league_photos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").references(() => leagues.id, { onDelete: 'cascade' }).notNull(),
  uploadedBy: varchar("uploaded_by").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull().default(0),
  caption: text("caption"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
}, (table) => [
  index("idx_league_photos_league_id").on(table.leagueId),
  index("idx_league_photos_uploaded_by").on(table.uploadedBy),
  index("idx_league_photos_uploaded_at").on(table.uploadedAt),
]);

// Tournament photo tags - junction table for tagging users in tournament photos
export const tournamentPhotoTags = pgTable("tournament_photo_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  photoId: varchar("photo_id").references(() => tournamentPhotos.id, { onDelete: 'cascade' }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  taggedBy: varchar("tagged_by").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  taggedAt: timestamp("tagged_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_tournament_photo_user_tag").on(table.photoId, table.userId),
  index("idx_tournament_photo_tags_photo_id").on(table.photoId),
  index("idx_tournament_photo_tags_user_id").on(table.userId),
]);

// League photo tags - junction table for tagging users in league photos
export const leaguePhotoTags = pgTable("league_photo_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  photoId: varchar("photo_id").references(() => leaguePhotos.id, { onDelete: 'cascade' }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  taggedBy: varchar("tagged_by").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  taggedAt: timestamp("tagged_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_league_photo_user_tag").on(table.photoId, table.userId),
  index("idx_league_photo_tags_photo_id").on(table.photoId),
  index("idx_league_photo_tags_user_id").on(table.userId),
]);

// Personal reminders table
export const personalReminders = pgTable("personal_reminders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  scheduledAt: timestamp("scheduled_at", { mode: 'string' }).notNull(),
  isCompleted: boolean("is_completed").default(false).notNull(),
  notificationSentAt: timestamp("notification_sent_at"),
  color: text("color"), // Optional color for calendar display (e.g. "#ef4444")
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_personal_reminders_user_id").on(table.userId),
  index("idx_personal_reminders_scheduled_at").on(table.scheduledAt),
]);

// Game score submissions table
export const gameScoreSubmissions = pgTable("game_score_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("game_id").references(() => games.id).notNull(),
  submittedBy: varchar("submitted_by").references(() => users.id, { onDelete: 'cascade' }).notNull(),
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
  goalieUserId: varchar("goalie_user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
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

// Game stars table - tracks the 3 stars awarded after each game
export const gameStars = pgTable("game_stars", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("game_id").references(() => games.id).notNull(),
  firstStarUserId: varchar("first_star_user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  secondStarUserId: varchar("second_star_user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  thirdStarUserId: varchar("third_star_user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  awardedBy: varchar("awarded_by").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  awardedAt: timestamp("awarded_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_game_stars").on(table.gameId),
  index("idx_game_stars_game_id").on(table.gameId),
  index("idx_game_stars_first_star").on(table.firstStarUserId),
  index("idx_game_stars_second_star").on(table.secondStarUserId),
  index("idx_game_stars_third_star").on(table.thirdStarUserId),
]);

// Game RSVPs table
export const gameRsvps = pgTable("game_rsvps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("game_id").references(() => games.id).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  teamId: varchar("team_id").references(() => teams.id).notNull(),
  status: rsvpStatusEnum("status").default("no_response").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_game_user_team_rsvp").on(table.gameId, table.userId, table.teamId),
]);

// Tournament Match RSVPs table - separate from game_rsvps due to different foreign key
export const tournamentMatchRsvps = pgTable("tournament_match_rsvps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  matchId: varchar("match_id").references(() => tournamentMatches.id).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  teamId: varchar("team_id").notNull(),
  status: rsvpStatusEnum("status").default("no_response").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_tournament_match_user_team_rsvp").on(table.matchId, table.userId, table.teamId),
]);

// Substitute requests table
export const substituteRequests = pgTable("substitute_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("game_id").references(() => games.id),
  teamEventId: varchar("team_event_id").references(() => teamEvents.id),
  originalPlayerId: varchar("original_player_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  substitutePlayerId: varchar("substitute_player_id").references(() => users.id, { onDelete: 'cascade' }),
  requestingTeamId: varchar("requesting_team_id").references(() => teams.id).notNull(),
  requestedBy: varchar("requested_by").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  status: substituteRequestStatusEnum("status").default("pending_opponent_approval").notNull(),
  reason: text("reason"),
  expiresAt: timestamp("expires_at"),
  finalizedAt: timestamp("finalized_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_substitute_requests_game_id").on(table.gameId),
  index("idx_substitute_requests_team_event_id").on(table.teamEventId),
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
  approverId: varchar("approver_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
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
  leagueId: varchar("league_id").references(() => leagues.id), // For league-based conversations
  tournamentId: varchar("tournament_id").references(() => tournaments.id), // For tournament-based conversations
  teamId: varchar("team_id").references(() => teams.id), // For team group chats
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  lastMessageAt: timestamp("last_message_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_conversations_league_id").on(table.leagueId),
  index("idx_conversations_tournament_id").on(table.tournamentId),
  index("idx_conversations_team_id").on(table.teamId),
  index("idx_conversations_last_message").on(table.lastMessageAt),
]);

// Conversation participants table
export const conversationParticipants = pgTable("conversation_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
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
  conversationId: varchar("conversation_id").references(() => conversations.id, { onDelete: 'cascade' }).notNull(),
  senderId: varchar("sender_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  content: text("content"),
  messageType: varchar("message_type").default("text").notNull(), // text, image, gif, file, poll, payment_request
  status: messageStatusEnum("status").default("sent").notNull(),
  editedAt: timestamp("edited_at"), // For message editing
  replyToId: varchar("reply_to_id"), // For threaded replies - self reference added later
  paymentRequestId: varchar("payment_request_id"), // For payment_request messages - reference added later
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
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
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
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
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
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
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
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
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
  leagueId: varchar("league_id").references(() => leagues.id), // Either leagueId or tournamentId must be set, not both
  tournamentId: varchar("tournament_id").references(() => tournaments.id), // For tournament-specific announcements
  authorId: varchar("author_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  teamId: varchar("team_id").references(() => teams.id), // null = commissioner post for everyone, set = team captain post for specific team
  content: text("content").notNull(),
  isPinned: boolean("is_pinned").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_announcements_league_id").on(table.leagueId),
  index("idx_announcements_tournament_id").on(table.tournamentId),
]);

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
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
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
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  optionIndex: integer("option_index").notNull(), // Index of selected option in options array
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_poll_user_vote").on(table.pollId, table.userId, table.optionIndex),
]);

// Announcement read status table - tracks which announcements each user has read
export const announcementReadStatus = pgTable("announcement_read_status", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  announcementId: varchar("announcement_id").references(() => announcements.id).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  readAt: timestamp("read_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_announcement_user_read").on(table.announcementId, table.userId),
]);

// Announcement visibility table - tracks who can see targeted announcements
// If no records exist for an announcement, it's visible to all league members (default behavior)
export const announcementVisibility = pgTable("announcement_visibility", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  announcementId: varchar("announcement_id").references(() => announcements.id).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_announcement_user_visibility").on(table.announcementId, table.userId),
]);

// Announcement comments table
export const announcementComments = pgTable("announcement_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  announcementId: varchar("announcement_id").references(() => announcements.id).notNull(),
  authorId: varchar("author_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  content: text("content").notNull(),
  parentId: varchar("parent_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_announcement_comments_announcement_id").on(table.announcementId),
]);

// Scrimmages table
export const scrimmages = pgTable("scrimmages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").references(() => leagues.id).notNull(),
  creatorId: varchar("creator_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  title: varchar("title").notNull(),
  dateTime: timestamp("date_time", { mode: 'string' }).notNull(),
  location: varchar("location").notNull(),
  maxPlayers: integer("max_players").notNull(),
  skillLevel: varchar("skill_level"), // Optional skill level requirement
  notes: text("notes"), // Additional notes/requirements
  costPerPlayer: decimal("cost_per_player", { precision: 10, scale: 2 }), // Optional cost per player
  // Optional per-scrimmage payment link overrides. When set, players paying for
  // this scrimmage should be sent to these URLs instead of the creator's
  // profile-level Venmo / Cash App handles. Stored as fully-normalized https
  // URLs (see normalizeVenmoLink / normalizeCashAppLink in this file).
  venmoLinkOverride: text("venmo_link_override"),
  cashappLinkOverride: text("cashapp_link_override"),
  status: scrimmageStatusEnum("status").default("open").notNull(),
  announcementId: varchar("announcement_id").references(() => announcements.id), // Link to auto-created announcement
  // Recurring event fields
  isRecurring: boolean("is_recurring").default(false).notNull(),
  recurrenceType: recurrenceTypeEnum("recurrence_type").default("none").notNull(),
  recurrenceDays: integer("recurrence_days").array(), // Array of day numbers (0=Sunday, 1=Monday, etc.)
  recurrenceEndDate: timestamp("recurrence_end_date"), // When to stop creating recurring events
  recurrenceCount: integer("recurrence_count"), // Number of times to repeat (alternative to end date)
  parentScrimmageId: varchar("parent_scrimmage_id"), // Link to parent scrimmage if this is part of a recurring series
  // Reminder settings - hours before the scrimmage to send reminders (e.g., 24, 48, 168 for 1 day, 2 days, 1 week)
  reminderHoursBefore: integer("reminder_hours_before").array(), // Array of hours before to send reminders
  // Invitation scheduling for recurring scrimmages
  inviteDaysBefore: integer("invite_days_before"), // Number of days before each occurrence to send invites (e.g., 5 for Sunday invite for Friday scrimmage)
  inviteTimeOfDay: varchar("invite_time_of_day"), // Time to send invites in HH:MM format (e.g., "09:00" for 9am)
  inviteSentAt: timestamp("invite_sent_at"), // When the invite was sent for this occurrence (null if not sent yet)
  color: text("color"), // Optional color for calendar display (e.g. "#ef4444" or "blue")
  inviteGroupId: varchar("invite_group_id").references(() => inviteGroups.id, { onDelete: 'set null' }), // Live invite group for recurring scrimmages — re-fetched at each send time
  inviteUserIds: text("invite_user_ids").array().notNull().default(sql`'{}'::text[]`), // Directly-selected individual user IDs — merged with live group on recurring sends
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Scrimmage requests table
export const scrimmageRequests = pgTable("scrimmage_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scrimmageId: varchar("scrimmage_id").references(() => scrimmages.id).notNull(),
  playerId: varchar("player_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  status: scrimmageRequestStatusEnum("status").default("pending").notNull(),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  approvedAt: timestamp("approved_at"),
  dismissedAt: timestamp("dismissed_at"),
  teamAssignment: varchar("team_assignment"), // 'light' | 'dark' | null — assigned team colour
}, (table) => [
  unique("unique_scrimmage_player_request").on(table.scrimmageId, table.playerId),
]);

// Scrimmage co-hosts table - allows multiple users to manage a scrimmage
export const scrimmageCoHosts = pgTable("scrimmage_co_hosts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scrimmageId: varchar("scrimmage_id").references(() => scrimmages.id).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  canApproveRequests: boolean("can_approve_requests").default(true).notNull(),
  canSendReminders: boolean("can_send_reminders").default(true).notNull(),
  canManagePayments: boolean("can_manage_payments").default(true).notNull(),
  addedAt: timestamp("added_at").defaultNow().notNull(),
  addedBy: varchar("added_by").references(() => users.id, { onDelete: 'cascade' }).notNull(),
}, (table) => [
  unique("unique_scrimmage_cohost").on(table.scrimmageId, table.userId),
]);

// Invite groups table - allows users to save groups of people for quick invites
export const inviteGroups = pgTable("invite_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creatorId: varchar("creator_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  leagueId: varchar("league_id").references(() => leagues.id), // Optional: group can be league-specific or user-wide
  name: varchar("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Invite group members table - stores members (users or emails) in each group
export const inviteGroupMembers = pgTable("invite_group_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").references(() => inviteGroups.id).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }), // If member is a registered user
  email: varchar("email"), // If member is invited by email (not yet registered)
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_group_user").on(table.groupId, table.userId),
  unique("unique_group_email").on(table.groupId, table.email),
]);

// Scrimmage invites table - tracks email-based invites for non-members
export const scrimmageInvites = pgTable("scrimmage_invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scrimmageId: varchar("scrimmage_id").references(() => scrimmages.id).notNull(),
  email: varchar("email").notNull(),
  invitedAt: timestamp("invited_at").defaultNow().notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }), // If the invited email matches a registered user
}, (table) => [
  unique("unique_scrimmage_email_invite").on(table.scrimmageId, table.email),
]);

// Scrimmage reminder tracking table - prevents duplicate reminders
export const scrimmageRemindersSent = pgTable("scrimmage_reminders_sent", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scrimmageId: varchar("scrimmage_id").references(() => scrimmages.id).notNull(),
  playerId: varchar("player_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  hoursBefore: integer("hours_before").notNull(), // Which reminder was sent (e.g., 24, 48, 168)
  sentAt: timestamp("sent_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_scrimmage_player_reminder").on(table.scrimmageId, table.playerId, table.hoursBefore),
]);

// Facility membership status enum
export const facilityMembershipStatusEnum = pgEnum("facility_membership_status", [
  "active",
  "expired",
  "suspended"
]);

// Calendar event type enum
export const calendarEventTypeEnum = pgEnum("calendar_event_type", [
  "league_game",
  "scrimmage",
  "tournament",
  "open_play"
]);

// Calendar event visibility enum
export const eventVisibilityEnum = pgEnum("event_visibility", [
  "public",
  "members_only",
  "participants_only"
]);

// Event RSVP status enum
export const eventRsvpStatusEnum = pgEnum("event_rsvp_status", [
  "joined",
  "maybe",
  "declined"
]);

// Facilities table
export const facilities = pgTable("facilities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  description: text("description"),
  address: text("address"),
  city: varchar("city"),
  state: varchar("state"),
  zipCode: varchar("zip_code"),
  phoneNumber: varchar("phone_number"),
  email: varchar("email"),
  website: varchar("website"),
  imageUrl: varchar("image_url"),
  sports: sportEnum("sports").array(), // Array of sports offered
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_facilities_city").on(table.city),
  index("idx_facilities_state").on(table.state),
]);

// Facility memberships table
export const facilityMemberships = pgTable("facility_memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  facilityId: varchar("facility_id").references(() => facilities.id).notNull(),
  membershipType: varchar("membership_type").default("basic").notNull(), // basic, premium, etc.
  status: facilityMembershipStatusEnum("status").default("active").notNull(),
  startDate: timestamp("start_date").defaultNow().notNull(),
  endDate: timestamp("end_date"), // Nullable for ongoing memberships
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_user_facility_membership").on(table.userId, table.facilityId),
  index("idx_facility_memberships_user").on(table.userId),
  index("idx_facility_memberships_facility").on(table.facilityId),
  index("idx_facility_memberships_status").on(table.status),
]);

// Calendar events table
export const calendarEvents = pgTable("calendar_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  facilityId: varchar("facility_id").references(() => facilities.id).notNull(),
  sportId: sportEnum("sport_id").notNull(),
  eventType: calendarEventTypeEnum("event_type").notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  locationDetail: varchar("location_detail"), // e.g., "Court 1", "Field 2"
  maxParticipants: integer("max_participants"),
  currentParticipantsCount: integer("current_participants_count").default(0).notNull(),
  requiresMembership: boolean("requires_membership").default(true).notNull(),
  requiresTeamRoster: boolean("requires_team_roster").default(false).notNull(),
  visibility: eventVisibilityEnum("visibility").default("public").notNull(),
  costPerParticipant: decimal("cost_per_participant", { precision: 10, scale: 2 }),
  // Link to existing entities
  leagueId: varchar("league_id").references(() => leagues.id), // For league games
  gameId: varchar("game_id").references(() => games.id), // For league games
  scrimmageId: varchar("scrimmage_id").references(() => scrimmages.id), // For scrimmages
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_calendar_events_facility").on(table.facilityId),
  index("idx_calendar_events_sport").on(table.sportId),
  index("idx_calendar_events_start_time").on(table.startTime),
  index("idx_calendar_events_event_type").on(table.eventType),
]);

// Event participants table
export const eventParticipants = pgTable("event_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").references(() => calendarEvents.id).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  facilityMembershipId: varchar("facility_membership_id").references(() => facilityMemberships.id).notNull(),
  rsvpStatus: eventRsvpStatusEnum("rsvp_status").default("joined").notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  checkedIn: boolean("checked_in").default(false).notNull(),
}, (table) => [
  unique("unique_event_user_participant").on(table.eventId, table.userId),
  index("idx_event_participants_event").on(table.eventId),
  index("idx_event_participants_user").on(table.userId),
  index("idx_event_participants_membership").on(table.facilityMembershipId),
]);

// Team event type enum
export const teamEventTypeEnum = pgEnum("team_event_type", [
  "general",      // General events like parties, meetings
  "practice",     // Team practice
  "scrimmage",    // Internal scrimmage (just your team) or vs another team
  "social"        // Team social events
]);

// Team events table - for general team events, scrimmages, etc.
export const teamEvents = pgTable("team_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").references(() => teams.id).notNull(),
  creatorId: varchar("creator_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  eventType: teamEventTypeEnum("event_type").notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  scheduledAt: timestamp("scheduled_at", { mode: 'string' }).notNull(),
  endTime: timestamp("end_time", { mode: 'string' }), // Optional end time
  location: varchar("location"),
  // For scrimmages against another team
  opponentTeamId: varchar("opponent_team_id").references(() => teams.id),
  opponentName: varchar("opponent_name"), // If opponent is not in the system
  isInternalScrimmage: boolean("is_internal_scrimmage").default(true), // True if just your team, false if vs opponent
  // Additional details
  notes: text("notes"),
  maxParticipants: integer("max_participants"),
  color: text("color"), // Optional color for calendar display (e.g. "#ef4444")
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_team_events_team").on(table.teamId),
  index("idx_team_events_scheduled").on(table.scheduledAt),
  index("idx_team_events_type").on(table.eventType),
  index("idx_team_events_creator").on(table.creatorId),
]);

// Team event RSVPs table
export const teamEventRsvps = pgTable("team_event_rsvps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamEventId: varchar("team_event_id").references(() => teamEvents.id).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  status: rsvpStatusEnum("status").default("no_response").notNull(),
  respondedAt: timestamp("responded_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_team_event_user_rsvp").on(table.teamEventId, table.userId),
  index("idx_team_event_rsvps_event").on(table.teamEventId),
  index("idx_team_event_rsvps_user").on(table.userId),
]);

// Payment requests table
export const paymentRequests = pgTable("payment_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creatorId: varchar("creator_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  amountPerPerson: decimal("amount_per_person", { precision: 10, scale: 2 }).notNull(),
  deadline: timestamp("deadline"),
  notes: text("notes"),
  // Optional per-invoice payment link overrides. When set, recipients paying
  // this invoice should be sent to these URLs instead of the creator's
  // profile-level Venmo / Cash App handles. Stored as fully-normalized https
  // URLs (see normalizeVenmoLink / normalizeCashAppLink in this file).
  venmoLinkOverride: text("venmo_link_override"),
  cashappLinkOverride: text("cashapp_link_override"),
  relatedScrimmageId: varchar("related_scrimmage_id").references(() => scrimmages.id),
  relatedConversationId: varchar("related_conversation_id").references(() => conversations.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_payment_requests_creator").on(table.creatorId),
  index("idx_payment_requests_scrimmage").on(table.relatedScrimmageId),
  index("idx_payment_requests_conversation").on(table.relatedConversationId),
]);

// Payment request recipients table
// Recipients can be either a registered user (userId) OR a team-scoped placeholder
// player (placeholderPlayerId). Exactly one of the two FKs is set per row. When a
// placeholder is later replaced/merged with a real user, the corresponding rows are
// migrated from placeholderPlayerId → userId so the invoice follows the player.
export const paymentRequestRecipients = pgTable("payment_request_recipients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  paymentRequestId: varchar("payment_request_id").references(() => paymentRequests.id).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
  placeholderPlayerId: varchar("placeholder_player_id").references(() => placeholderPlayers.id, { onDelete: 'cascade' }),
  isPaid: boolean("is_paid").default(false).notNull(),
  paymentMethod: paymentMethodEnum("payment_method"),
  paidAt: timestamp("paid_at"),
  isConfirmed: boolean("is_confirmed").default(false).notNull(),
  confirmedAt: timestamp("confirmed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  // Each user / placeholder can only be a recipient once per request.
  unique("unique_payment_request_user").on(table.paymentRequestId, table.userId),
  unique("unique_payment_request_placeholder").on(table.paymentRequestId, table.placeholderPlayerId),
  // Exactly one of userId / placeholderPlayerId must be set.
  check(
    "payment_request_recipient_exactly_one_fk",
    sql`(${table.userId} IS NOT NULL) <> (${table.placeholderPlayerId} IS NOT NULL)`,
  ),
  index("idx_payment_request_recipients_request").on(table.paymentRequestId),
  index("idx_payment_request_recipients_user").on(table.userId),
  index("idx_payment_request_recipients_placeholder").on(table.placeholderPlayerId),
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
  playerId: varchar("player_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
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
  "cancelled",
  "pending",
  "active",
  "paused",
  "awaiting_captains",
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
  seasonId: varchar("season_id").references(() => seasons.id),
  name: varchar("name").notNull(),
  status: draftStatusEnum("status").default("pending").notNull(),
  roundType: draftRoundTypeEnum("round_type").default("snake").notNull(),
  // Extended draft style: 'snake' | 'linear' | 'auction' | '3rd_round_reversal'
  draftStyle: varchar("draft_style"),
  // 'commissioner_assigned' | 'random_draw' | 'included_with_skaters'
  goalieMethod: varchar("goalie_method").default("included_with_skaters"),
  // Who physically makes picks during the draft.
  // 'captains'     – each team's captain makes their own picks (default)
  // 'commissioner' – the commissioner makes every pick on behalf of all teams
  pickMode: varchar("pick_mode").default("captains").notNull(),
  // 'auto_pick' | 'halve_next'
  timerExpiryRule: varchar("timer_expiry_rule").default("auto_pick"),
  skillRankingEnabled: boolean("skill_ranking_enabled").default(false).notNull(),
  // 'letters' (A-D) | 'numbers' (1-5)
  skillScale: varchar("skill_scale"),
  // jsonb { [userId]: noteText }
  playerNotes: jsonb("player_notes").default({}),
  // jsonb { [teamId]: userId } for commissioner-assigned goalies
  goalieAssignments: jsonb("goalie_assignments").default({}),
  // jsonb { [teamId]: userId } captain assignments set via the setup wizard
  captainAssignments: jsonb("captain_assignments").default({}),
  // jsonb { [teamId]: roundsArray[] } for buddy-forfeited rounds
  forfeitedRounds: jsonb("forfeited_rounds").default({}),
  currentRound: integer("current_round").default(1).notNull(),
  currentTurn: integer("current_turn").default(1).notNull(),
  totalRounds: integer("total_rounds").default(10).notNull(),
  draftOrder: jsonb("draft_order"), // Array of team IDs in draft order
  timePerPick: integer("time_per_pick").default(120), // seconds
  // Server-authoritative deadline for current pick
  currentTurnDeadline: timestamp("current_turn_deadline"),
  // Halved-timer override (set when prev captain forfeited via halve_next rule)
  nextTimerOverride: integer("next_timer_override"),
  // Buzzer-extension state for the timerExpiryRule="halve_next" rule.
  // Shape: { currentPickExtended: boolean, halvedNextTurn: { [teamId]: boolean } }
  // - currentPickExtended: did the current pick already get its 30s buzzer extension?
  // - halvedNextTurn: which captains owe a halved timer on their next turn?
  buzzerExtensionState: jsonb("buzzer_extension_state").default({}),
  // Per-user ready acknowledgement during the awaiting_captains lobby.
  // Shape: { [userId]: true }
  captainReadyState: jsonb("captain_ready_state").default({}),
  // Set when all captains are ready; clients show a 30-second countdown to this timestamp.
  // Cleared when the draft starts or the lobby is cancelled.
  launchAt: timestamp("launch_at"),
  scheduledAt: timestamp("scheduled_at"),
  startedAt: timestamp("started_at"),
  lockedAt: timestamp("locked_at"),
  completedAt: timestamp("completed_at"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Draft picks table
export const draftPicks = pgTable("draft_picks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  draftId: varchar("draft_id").references(() => drafts.id, { onDelete: 'cascade' }).notNull(),
  teamId: varchar("team_id").references(() => teams.id).notNull(),
  playerId: varchar("player_id").references(() => users.id, { onDelete: 'cascade' }),
  round: integer("round").notNull(),
  pick: integer("pick").notNull(), // Overall pick number
  pickInRound: integer("pick_in_round").notNull(), // Pick number within round
  isAutoBuddy: boolean("is_auto_buddy").default(false).notNull(),
  expiredAutoPick: boolean("expired_auto_pick").default(false).notNull(),
  forfeited: boolean("forfeited").default(false).notNull(),
  pickedAt: timestamp("picked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Draft buddy pairs - groups of players linked together via buddy system
export const draftBuddyPairs = pgTable("draft_buddy_pairs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  draftId: varchar("draft_id").references(() => drafts.id, { onDelete: 'cascade' }).notNull(),
  userIds: text("user_ids").array().notNull(), // 2+ user IDs linked together
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_draft_buddy_pairs_draft").on(table.draftId),
]);

// Draft chat messages - persisted captain chat during live draft
export const draftChatMessages = pgTable("draft_chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  draftId: varchar("draft_id").references(() => drafts.id, { onDelete: 'cascade' }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_draft_chat_messages_draft").on(table.draftId),
]);

// Draft keepers — players designated to stay on their team without going through the draft
// Either userId (real accounts) OR placeholderPlayerId (placeholder/imported accounts) must be set.
export const draftKeepers = pgTable("draft_keepers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  draftId: varchar("draft_id").references(() => drafts.id, { onDelete: 'cascade' }).notNull(),
  // For real user accounts — nullable to support placeholder players
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
  // For placeholder players (imported players without accounts) — nullable
  placeholderPlayerId: varchar("placeholder_player_id"),
  teamId: varchar("team_id").references(() => teams.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_draft_keepers_draft").on(table.draftId),
]);

// Player import sessions table
export const playerImports = pgTable("player_imports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").references(() => leagues.id).notNull(),
  importedBy: varchar("imported_by").references(() => users.id, { onDelete: 'cascade' }).notNull(),
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
  mergedWithUserId: varchar("merged_with_user_id").references(() => users.id, { onDelete: 'cascade' }),
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
  existingUserId: varchar("existing_user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  confidenceScore: decimal("confidence_score", { precision: 3, scale: 2 }), // 0.00 to 1.00
  matchingFields: jsonb("matching_fields"), // Store which fields matched
  status: mergeStatusEnum("status").default("auto_suggested").notNull(),
  reviewedBy: varchar("reviewed_by").references(() => users.id, { onDelete: 'cascade' }),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Schedule import sessions table
export const scheduleImports = pgTable("schedule_imports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").references(() => leagues.id).notNull(),
  importedBy: varchar("imported_by").references(() => users.id, { onDelete: 'cascade' }).notNull(),
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
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
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

// Game goals table - tracks individual goals scored in games
export const gameGoals = pgTable("game_goals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("game_id").references(() => games.id).notNull(),
  teamId: varchar("team_id").references(() => teams.id).notNull(),
  scorerId: varchar("scorer_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  primaryAssistId: varchar("primary_assist_id").references(() => users.id, { onDelete: 'cascade' }),
  secondaryAssistId: varchar("secondary_assist_id").references(() => users.id, { onDelete: 'cascade' }),
  goalNumber: integer("goal_number").notNull(),
  timestamp: varchar("timestamp"),
  period: integer("period").default(1),
  isSubmitted: boolean("is_submitted").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_game_goals_game_id").on(table.gameId),
  index("idx_game_goals_team_id").on(table.teamId),
  index("idx_game_goals_scorer_id").on(table.scorerId),
]);

// Game penalties table - tracks individual penalties in games
export const gamePenalties = pgTable("game_penalties", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  gameId: varchar("game_id").references(() => games.id).notNull(),
  teamId: varchar("team_id").references(() => teams.id).notNull(),
  playerId: varchar("player_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  penaltyNumber: integer("penalty_number").notNull(),
  minutes: integer("minutes").default(2),
  penaltyType: varchar("penalty_type"),
  timestamp: varchar("timestamp"),
  period: integer("period").default(1),
  isSubmitted: boolean("is_submitted").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_game_penalties_game_id").on(table.gameId),
  index("idx_game_penalties_team_id").on(table.teamId),
  index("idx_game_penalties_player_id").on(table.playerId),
]);

// Feedback category enum
export const feedbackCategoryEnum = pgEnum("feedback_category", [
  "product_improvement",
  "report_issue"
]);

// Feedback submissions table
export const feedbackSubmissions = pgTable("feedback_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
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
  facility: one(facilities, {
    fields: [leagues.facilityId],
    references: [facilities.id],
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
  dutyAssignments: many(dutyAssignments),
  goals: many(gameGoals),
  penalties: many(gamePenalties),
}));

// Game goals relations
export const gameGoalsRelations = relations(gameGoals, ({ one }) => ({
  game: one(games, {
    fields: [gameGoals.gameId],
    references: [games.id],
  }),
  team: one(teams, {
    fields: [gameGoals.teamId],
    references: [teams.id],
  }),
  scorer: one(users, {
    fields: [gameGoals.scorerId],
    references: [users.id],
    relationName: "scoredGoals",
  }),
  primaryAssist: one(users, {
    fields: [gameGoals.primaryAssistId],
    references: [users.id],
    relationName: "primaryAssists",
  }),
  secondaryAssist: one(users, {
    fields: [gameGoals.secondaryAssistId],
    references: [users.id],
    relationName: "secondaryAssists",
  }),
}));

// Game penalties relations
export const gamePenaltiesRelations = relations(gamePenalties, ({ one }) => ({
  game: one(games, {
    fields: [gamePenalties.gameId],
    references: [games.id],
  }),
  team: one(teams, {
    fields: [gamePenalties.teamId],
    references: [teams.id],
  }),
  player: one(users, {
    fields: [gamePenalties.playerId],
    references: [users.id],
  }),
}));

// Duty relations
export const dutyTemplatesRelations = relations(dutyTemplates, ({ one, many }) => ({
  team: one(teams, {
    fields: [dutyTemplates.teamId],
    references: [teams.id],
  }),
  createdBy: one(users, {
    fields: [dutyTemplates.createdBy],
    references: [users.id],
  }),
  assignments: many(dutyAssignments),
}));

export const dutyAssignmentsRelations = relations(dutyAssignments, ({ one }) => ({
  dutyTemplate: one(dutyTemplates, {
    fields: [dutyAssignments.dutyTemplateId],
    references: [dutyTemplates.id],
  }),
  game: one(games, {
    fields: [dutyAssignments.gameId],
    references: [games.id],
  }),
  user: one(users, {
    fields: [dutyAssignments.userId],
    references: [users.id],
  }),
  team: one(teams, {
    fields: [dutyAssignments.teamId],
    references: [teams.id],
  }),
}));

export const dutyExclusionsRelations = relations(dutyExclusions, ({ one }) => ({
  dutyTemplate: one(dutyTemplates, {
    fields: [dutyExclusions.dutyTemplateId],
    references: [dutyTemplates.id],
  }),
  game: one(games, {
    fields: [dutyExclusions.gameId],
    references: [games.id],
  }),
  team: one(teams, {
    fields: [dutyExclusions.teamId],
    references: [teams.id],
  }),
  excludedByUser: one(users, {
    fields: [dutyExclusions.excludedBy],
    references: [users.id],
  }),
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
  comments: many(announcementComments),
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

export const announcementCommentsRelations = relations(announcementComments, ({ one }) => ({
  announcement: one(announcements, {
    fields: [announcementComments.announcementId],
    references: [announcements.id],
  }),
  author: one(users, {
    fields: [announcementComments.authorId],
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
  calendarEvents: many(calendarEvents),
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

// Facility relations
export const facilitiesRelations = relations(facilities, ({ many }) => ({
  memberships: many(facilityMemberships),
  calendarEvents: many(calendarEvents),
}));

export const facilityMembershipsRelations = relations(facilityMemberships, ({ one, many }) => ({
  user: one(users, {
    fields: [facilityMemberships.userId],
    references: [users.id],
  }),
  facility: one(facilities, {
    fields: [facilityMemberships.facilityId],
    references: [facilities.id],
  }),
  eventParticipations: many(eventParticipants),
}));

export const calendarEventsRelations = relations(calendarEvents, ({ one, many }) => ({
  facility: one(facilities, {
    fields: [calendarEvents.facilityId],
    references: [facilities.id],
  }),
  league: one(leagues, {
    fields: [calendarEvents.leagueId],
    references: [leagues.id],
  }),
  game: one(games, {
    fields: [calendarEvents.gameId],
    references: [games.id],
  }),
  scrimmage: one(scrimmages, {
    fields: [calendarEvents.scrimmageId],
    references: [scrimmages.id],
  }),
  creator: one(users, {
    fields: [calendarEvents.createdBy],
    references: [users.id],
  }),
  participants: many(eventParticipants),
}));

export const eventParticipantsRelations = relations(eventParticipants, ({ one }) => ({
  event: one(calendarEvents, {
    fields: [eventParticipants.eventId],
    references: [calendarEvents.id],
  }),
  user: one(users, {
    fields: [eventParticipants.userId],
    references: [users.id],
  }),
  facilityMembership: one(facilityMemberships, {
    fields: [eventParticipants.facilityMembershipId],
    references: [facilityMemberships.id],
  }),
}));

// Team events relations
export const teamEventsRelations = relations(teamEvents, ({ one, many }) => ({
  team: one(teams, {
    fields: [teamEvents.teamId],
    references: [teams.id],
  }),
  creator: one(users, {
    fields: [teamEvents.creatorId],
    references: [users.id],
  }),
  opponentTeam: one(teams, {
    fields: [teamEvents.opponentTeamId],
    references: [teams.id],
  }),
  rsvps: many(teamEventRsvps),
}));

export const teamEventRsvpsRelations = relations(teamEventRsvps, ({ one }) => ({
  teamEvent: one(teamEvents, {
    fields: [teamEventRsvps.teamEventId],
    references: [teamEvents.id],
  }),
  user: one(users, {
    fields: [teamEventRsvps.userId],
    references: [users.id],
  }),
}));

// Payment request relations
export const paymentRequestsRelations = relations(paymentRequests, ({ one, many }) => ({
  creator: one(users, {
    fields: [paymentRequests.creatorId],
    references: [users.id],
  }),
  relatedScrimmage: one(scrimmages, {
    fields: [paymentRequests.relatedScrimmageId],
    references: [scrimmages.id],
  }),
  relatedConversation: one(conversations, {
    fields: [paymentRequests.relatedConversationId],
    references: [conversations.id],
  }),
  recipients: many(paymentRequestRecipients),
}));

export const paymentRequestRecipientsRelations = relations(paymentRequestRecipients, ({ one }) => ({
  paymentRequest: one(paymentRequests, {
    fields: [paymentRequestRecipients.paymentRequestId],
    references: [paymentRequests.id],
  }),
  user: one(users, {
    fields: [paymentRequestRecipients.userId],
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
  shoots: true,
});

// Onboarding schema for updating onboarding-related fields
export const updateOnboardingSchema = createInsertSchema(users).pick({
  firstName: true,
  lastName: true,
  email: true,
  phoneNumber: true,
  dateOfBirth: true,
  city: true,
  playerType: true,
  profileImageUrl: true,
  venmoUsername: true,
  cashappUsername: true,
  timezone: true,
  competitiveLevel: true,
  rosterUseCase: true,
  selectedFacilityId: true,
  onboardingProgress: true,
  onboardingCompleted: true,
  role: true,
});

export type UpdateOnboarding = z.infer<typeof updateOnboardingSchema>;

// Admin-only schema for updating user permissions (to be used by commissioners only)
export const updateUserPermissionsSchema = createInsertSchema(users).pick({
  role: true,
  specialPermissions: true,
  isPrimaryCommissioner: true,
  createdBy: true,
});

export const insertUserNotificationSchema = createInsertSchema(userNotifications).omit({
  id: true,
  createdAt: true,
});

// Notification settings schema for validation
export const notificationSettingsSchema = z.object({
  inAppMessages: z.boolean().default(true),
  paymentRequests: z.boolean().default(true),
  substitutionRequests: z.boolean().default(true),
  joinRequests: z.boolean().default(true),
  upcomingEvents: z.boolean().default(true),
  newsAnnouncements: z.boolean().default(true),
  scrimmageInvites: z.boolean().default(true),
});

export const insertNotificationPreferencesSchema = createInsertSchema(notificationPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateNotificationPreferencesSchema = z.object({
  oneSignalPlayerId: z.string().optional(),
  oneSignalExternalId: z.string().optional(),
  notificationSettings: notificationSettingsSchema.optional(),
  pushEnabled: z.boolean().optional(),
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

export const insertPlaceholderPlayerSchema = createInsertSchema(placeholderPlayers).omit({
  id: true,
  createdAt: true,
});

export const insertTeamLeagueRequestSchema = createInsertSchema(teamLeagueRequests).omit({
  id: true,
  requestedAt: true,
  approvedAt: true,
  approvedBy: true,
  rejectedAt: true,
});

export const insertGameSchema = createInsertSchema(games).omit({
  id: true,
  createdAt: true,
}).extend({
  // Keep datetime as string - stored as league-local time
  scheduledAt: z.string(),
});

export const insertDutyTemplateSchema = createInsertSchema(dutyTemplates).omit({
  id: true,
  createdAt: true,
});

export const insertDutyAssignmentSchema = createInsertSchema(dutyAssignments).omit({
  id: true,
  claimedAt: true,
});

export const insertPersonalReminderSchema = createInsertSchema(personalReminders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  notificationSentAt: true,
}).extend({
  // Keep datetime as string - stored as league-local time
  scheduledAt: z.string(),
});

export const insertGameScoreSubmissionSchema = createInsertSchema(gameScoreSubmissions).omit({
  id: true,
  submittedAt: true,
});

export const insertGameGoalieSchema = createInsertSchema(gameGoalies).omit({
  id: true,
  createdAt: true,
});

export const insertGameStarsSchema = createInsertSchema(gameStars).omit({
  id: true,
  awardedAt: true,
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
  messageType: z.enum(['text', 'image', 'gif', 'file', 'poll', 'payment_request']).default('text'),
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

// Game goals and penalties schemas
export const insertGameGoalSchema = createInsertSchema(gameGoals).omit({
  id: true,
  createdAt: true,
});

export const insertGamePenaltySchema = createInsertSchema(gamePenalties).omit({
  id: true,
  createdAt: true,
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

export const insertDraftBuddyPairSchema = createInsertSchema(draftBuddyPairs).omit({
  id: true,
  createdAt: true,
});

export const insertDraftChatMessageSchema = createInsertSchema(draftChatMessages).omit({
  id: true,
  createdAt: true,
});

// Draft setup wizard config schema (used by setup wizard endpoint)
export const draftSetupConfigSchema = z.object({
  draftStyle: z.enum(["snake", "linear", "auction", "3rd_round_reversal"]),
  goalieMethod: z.enum(["commissioner_assigned", "random_draw", "included_with_skaters"]),
  pickMode: z.enum(["captains", "commissioner"]).optional(),
  timerExpiryRule: z.enum(["auto_pick", "halve_next"]),
  timePerPick: z.number().int().min(15).max(600),
  totalRounds: z.number().int().min(1).max(30).optional(),
  skillRankingEnabled: z.boolean(),
  skillScale: z.enum(["letters", "numbers"]).nullable().optional(),
  skillLevels: z.record(z.string(), z.string()).optional(), // userId -> tier
  playerNotes: z.record(z.string(), z.string().max(200)).optional(),
  buddyPairs: z.array(z.array(z.string()).min(2)).optional(),
  goalieAssignments: z.record(z.string(), z.string()).optional(), // teamId -> userId
  captainAssignments: z.record(z.string(), z.string()).optional(), // teamId -> userId
  draftOrder: z.array(z.string()).optional(), // teamId order
  keepersByTeam: z.record(z.string(), z.array(z.string())).optional(), // teamId -> [userId]
});
export type DraftSetupConfig = z.infer<typeof draftSetupConfigSchema>;

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

export const insertAnnouncementCommentSchema = createInsertSchema(announcementComments).omit({
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
}).extend({
  teamAssignment: z.enum(['light', 'dark']).nullable().optional(),
});

export const insertScrimmageCoHostSchema = createInsertSchema(scrimmageCoHosts).omit({
  id: true,
  addedAt: true,
});

export const insertInviteGroupSchema = createInsertSchema(inviteGroups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInviteGroupMemberSchema = createInsertSchema(inviteGroupMembers).omit({
  id: true,
  createdAt: true,
});

export const insertScrimmageInviteSchema = createInsertSchema(scrimmageInvites).omit({
  id: true,
  invitedAt: true,
});

export const insertScrimmageReminderSentSchema = createInsertSchema(scrimmageRemindersSent).omit({
  id: true,
  sentAt: true,
});

// Team event schemas
export const insertTeamEventSchema = createInsertSchema(teamEvents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const createTeamEventRequestSchema = createInsertSchema(teamEvents).omit({
  id: true,
  creatorId: true, // Server-controlled
  createdAt: true,
  updatedAt: true,
}).extend({
  // Keep datetime as string - stored as league-local time
  scheduledAt: z.string(),
  endTime: z.string().optional().nullable(),
});

export const updateTeamEventRequestSchema = createInsertSchema(teamEvents).omit({
  id: true,
  teamId: true,      // Cannot change team
  creatorId: true,   // Server-controlled
  createdAt: true,
  updatedAt: true,
}).partial().extend({
  // Keep datetime as string - stored as league-local time
  scheduledAt: z.string().optional(),
  endTime: z.string().optional().nullable(),
});

export const insertTeamEventRsvpSchema = createInsertSchema(teamEventRsvps).omit({
  id: true,
  createdAt: true,
});

// ----- Per-request payment link override helpers -----
// Accept either a full URL (https://venmo.com/foo, https://cash.app/$bar) or a
// bare handle (foo, @foo, $bar) and normalize to a canonical https URL. Reject
// any other URL host so a captain cannot accidentally paste, say, a PayPal
// link into the Venmo override field.

const VENMO_HANDLE_RE = /^[A-Za-z0-9_-]{1,30}$/;
const CASHAPP_HANDLE_RE = /^[A-Za-z][A-Za-z0-9_]{0,19}$/;

export function normalizeVenmoLink(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Venmo link cannot be empty");

  if (/^https?:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new Error("Enter a valid Venmo URL or @handle");
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "venmo.com" && host !== "account.venmo.com") {
      throw new Error("Link must point to venmo.com");
    }
    // Strip leading "/u/" segment Venmo uses for some profile URLs.
    const path = url.pathname.replace(/^\/u\//, "/").replace(/^\/+/, "");
    const handle = path.split("/")[0]?.replace(/^@/, "");
    if (!handle || !VENMO_HANDLE_RE.test(handle)) {
      throw new Error("Venmo URL is missing a valid username");
    }
    return `https://venmo.com/${handle}`;
  }

  const handle = trimmed.replace(/^@/, "");
  if (!VENMO_HANDLE_RE.test(handle)) {
    throw new Error("Enter a valid Venmo @handle or full venmo.com URL");
  }
  return `https://venmo.com/${handle}`;
}

export function normalizeCashAppLink(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Cash App link cannot be empty");

  if (/^https?:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new Error("Enter a valid Cash App URL or $cashtag");
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "cash.app") {
      throw new Error("Link must point to cash.app");
    }
    const path = url.pathname.replace(/^\/+/, "");
    const handle = path.split("/")[0]?.replace(/^\$/, "");
    if (!handle || !CASHAPP_HANDLE_RE.test(handle)) {
      throw new Error("Cash App URL is missing a valid $cashtag");
    }
    return `https://cash.app/$${handle}`;
  }

  const handle = trimmed.replace(/^\$/, "");
  if (!CASHAPP_HANDLE_RE.test(handle)) {
    throw new Error("Enter a valid Cash App $cashtag or full cash.app URL");
  }
  return `https://cash.app/$${handle}`;
}

// Zod schema fragment shared by every place that accepts an override on input.
// Empty string, null and undefined all collapse to null (= "no override, fall
// back to creator profile"). Anything else is normalized via the helpers
// above and produces a clear validation error on bad input.
export const venmoLinkOverrideField = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v, ctx): string | null => {
    if (v === undefined || v === null) return null;
    const t = v.trim();
    if (t === "") return null;
    try {
      return normalizeVenmoLink(t);
    } catch (e) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: e instanceof Error ? e.message : "Invalid Venmo link",
      });
      return z.NEVER;
    }
  });

export const cashappLinkOverrideField = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v, ctx): string | null => {
    if (v === undefined || v === null) return null;
    const t = v.trim();
    if (t === "") return null;
    try {
      return normalizeCashAppLink(t);
    } catch (e) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: e instanceof Error ? e.message : "Invalid Cash App link",
      });
      return z.NEVER;
    }
  });

// Payment request schemas
export const insertPaymentRequestSchema = createInsertSchema(paymentRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPaymentRequestRecipientSchema = createInsertSchema(paymentRequestRecipients).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const createPaymentRequestSchema = createInsertSchema(paymentRequests).omit({
  id: true,
  creatorId: true, // Server-controlled
  createdAt: true,
  updatedAt: true,
  venmoLinkOverride: true,   // Re-added below with normalization.
  cashappLinkOverride: true, // Re-added below with normalization.
}).extend({
  // Keep datetime as string - stored as league-local time
  deadline: z.string().optional().nullable(),
  // League the invoice belongs to. Required so the server can authorize the
  // creator and validate that every recipient belongs to this league.
  leagueId: z.string().min(1, "League is required"),
  recipientUserIds: z.array(z.string()).default([]),
  placeholderPlayerIds: z.array(z.string()).default([]),
  venmoLinkOverride: venmoLinkOverrideField,
  cashappLinkOverride: cashappLinkOverrideField,
}).refine(
  (data) => (data.recipientUserIds?.length ?? 0) + (data.placeholderPlayerIds?.length ?? 0) >= 1,
  { message: "At least one recipient is required", path: ["recipientUserIds"] },
);

export const updatePaymentRequestRecipientSchema = z.object({
  isPaid: z.boolean(),
  paymentMethod: z.enum(['venmo', 'cashapp', 'cash', 'other']).optional(),
});

export const updatePaymentRequestSchema = z.object({
  title: z.string().min(1, "Title is required").optional(),
  description: z.string().optional().nullable(),
  amountPerPerson: z.union([z.string(), z.number()])
    .transform((v) => typeof v === 'number' ? v.toString() : v)
    .optional(),
  deadline: z.string().optional().nullable(),
  recipientUserIds: z.array(z.string()).optional(),
  placeholderPlayerIds: z.array(z.string()).optional(),
  venmoLinkOverride: venmoLinkOverrideField,
  cashappLinkOverride: cashappLinkOverrideField,
}).refine(
  (data) => {
    if (data.recipientUserIds === undefined && data.placeholderPlayerIds === undefined) {
      return true;
    }
    const userCount = data.recipientUserIds?.length ?? 0;
    const phCount = data.placeholderPlayerIds?.length ?? 0;
    return userCount + phCount >= 1;
  },
  { message: "At least one recipient is required", path: ["recipientUserIds"] },
);

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
  venmoLinkOverride: true,   // Re-added below with normalization.
  cashappLinkOverride: true, // Re-added below with normalization.
}).extend({
  venmoLinkOverride: venmoLinkOverrideField,
  cashappLinkOverride: cashappLinkOverrideField,
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
  venmoLinkOverride: true,   // Re-added below with normalization.
  cashappLinkOverride: true, // Re-added below with normalization.
}).partial().extend({
  // Keep datetime as string - stored as league-local time
  dateTime: z.string().optional(),
  venmoLinkOverride: venmoLinkOverrideField,
  cashappLinkOverride: cashappLinkOverrideField,
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
}).refine(data => data.gameId || data.teamEventId, {
  message: 'Either gameId or teamEventId must be provided',
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
  createdAt: true,
});

export const createFeedbackSubmissionSchema = z.object({
  category: z.enum(["product_improvement", "report_issue"]),
  message: z.string().min(1, "Message is required").max(5000, "Message is too long"),
});

// Facility schemas
export const insertFacilitySchema = createInsertSchema(facilities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const createFacilityRequestSchema = createInsertSchema(facilities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateFacilityRequestSchema = createInsertSchema(facilities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).partial();

export const insertFacilityMembershipSchema = createInsertSchema(facilityMemberships).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const createFacilityMembershipRequestSchema = createInsertSchema(facilityMemberships).omit({
  id: true,
  userId: true,     // Server-controlled
  startDate: true,  // Server-controlled
  createdAt: true,
  updatedAt: true,
});

export const insertCalendarEventSchema = createInsertSchema(calendarEvents).omit({
  id: true,
  currentParticipantsCount: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  startTime: z.string().transform((val) => new Date(val)),
  endTime: z.string().transform((val) => new Date(val)),
});

export const createCalendarEventRequestSchema = createInsertSchema(calendarEvents).omit({
  id: true,
  currentParticipantsCount: true,
  createdBy: true,  // Server-controlled
  createdAt: true,
  updatedAt: true,
}).extend({
  startTime: z.string().transform((val) => new Date(val)),
  endTime: z.string().transform((val) => new Date(val)),
});

export const updateCalendarEventRequestSchema = createInsertSchema(calendarEvents).omit({
  id: true,
  facilityId: true, // Cannot change facility
  currentParticipantsCount: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
}).partial().extend({
  startTime: z.string().transform((val) => new Date(val)).optional(),
  endTime: z.string().transform((val) => new Date(val)).optional(),
});

export const insertEventParticipantSchema = createInsertSchema(eventParticipants).omit({
  id: true,
  joinedAt: true,
});

export const createEventParticipantRequestSchema = createInsertSchema(eventParticipants).omit({
  id: true,
  eventId: true,            // Server-controlled
  userId: true,             // Server-controlled
  facilityMembershipId: true, // Server-controlled
  joinedAt: true,
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UserNotification = typeof userNotifications.$inferSelect;
export type InsertUserNotification = z.infer<typeof insertUserNotificationSchema>;
export type NotificationPreferences = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreferences = z.infer<typeof insertNotificationPreferencesSchema>;
export type UpdateNotificationPreferences = z.infer<typeof updateNotificationPreferencesSchema>;
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;
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
export type PlaceholderPlayer = typeof placeholderPlayers.$inferSelect;
export type InsertPlaceholderPlayer = z.infer<typeof insertPlaceholderPlayerSchema>;
export type TeamLeagueRequest = typeof teamLeagueRequests.$inferSelect;
export type InsertTeamLeagueRequest = z.infer<typeof insertTeamLeagueRequestSchema>;
export type Game = typeof games.$inferSelect;
export type InsertGame = z.infer<typeof insertGameSchema>;
export type DutyTemplate = typeof dutyTemplates.$inferSelect;
export type InsertDutyTemplate = z.infer<typeof insertDutyTemplateSchema>;
export type DutyAssignment = typeof dutyAssignments.$inferSelect;
export type InsertDutyAssignment = z.infer<typeof insertDutyAssignmentSchema>;
export type DutyExclusion = typeof dutyExclusions.$inferSelect;
export type InsertDutyExclusion = typeof dutyExclusions.$inferInsert;
export type PersonalReminder = typeof personalReminders.$inferSelect;
export type InsertPersonalReminder = z.infer<typeof insertPersonalReminderSchema>;
export type GameScoreSubmission = typeof gameScoreSubmissions.$inferSelect;
export type InsertGameScoreSubmission = z.infer<typeof insertGameScoreSubmissionSchema>;
export type GameGoalie = typeof gameGoalies.$inferSelect;
export type InsertGameGoalie = z.infer<typeof insertGameGoalieSchema>;
export type GameStar = typeof gameStars.$inferSelect;
export type InsertGameStar = z.infer<typeof insertGameStarsSchema>;
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
export type DraftBuddyPair = typeof draftBuddyPairs.$inferSelect;
export type InsertDraftBuddyPair = z.infer<typeof insertDraftBuddyPairSchema>;
export type DraftChatMessage = typeof draftChatMessages.$inferSelect;
export type InsertDraftChatMessage = z.infer<typeof insertDraftChatMessageSchema>;
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
  shutouts: number;
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

// Game goals and penalties types
export type GameGoal = typeof gameGoals.$inferSelect;
export type InsertGameGoal = z.infer<typeof insertGameGoalSchema>;
export type GamePenalty = typeof gamePenalties.$inferSelect;
export type InsertGamePenalty = z.infer<typeof insertGamePenaltySchema>;

// Extended game goal and penalty types with relationships
export type GameGoalWithDetails = GameGoal & {
  scorer: User;
  primaryAssist?: User | null;
  secondaryAssist?: User | null;
  team: Team;
};

export type GamePenaltyWithDetails = GamePenalty & {
  player: User;
  team: Team;
};

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
export type AnnouncementComment = typeof announcementComments.$inferSelect;
export type InsertAnnouncementComment = z.infer<typeof insertAnnouncementCommentSchema>;
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
export type ScrimmageCoHost = typeof scrimmageCoHosts.$inferSelect;
export type InsertScrimmageCoHost = z.infer<typeof insertScrimmageCoHostSchema>;
export type InviteGroup = typeof inviteGroups.$inferSelect;
export type InsertInviteGroup = z.infer<typeof insertInviteGroupSchema>;
export type InviteGroupMember = typeof inviteGroupMembers.$inferSelect;
export type InsertInviteGroupMember = z.infer<typeof insertInviteGroupMemberSchema>;
export type ScrimmageInvite = typeof scrimmageInvites.$inferSelect;
export type InsertScrimmageInvite = z.infer<typeof insertScrimmageInviteSchema>;
export type ScrimmageReminderSent = typeof scrimmageRemindersSent.$inferSelect;
export type InsertScrimmageReminderSent = z.infer<typeof insertScrimmageReminderSentSchema>;
export type PaymentRequest = typeof paymentRequests.$inferSelect;
export type InsertPaymentRequest = z.infer<typeof insertPaymentRequestSchema>;
export type CreatePaymentRequest = z.infer<typeof createPaymentRequestSchema>;
export type PaymentRequestRecipient = typeof paymentRequestRecipients.$inferSelect;
export type InsertPaymentRequestRecipient = z.infer<typeof insertPaymentRequestRecipientSchema>;
export type UpdatePaymentRequestRecipient = z.infer<typeof updatePaymentRequestRecipientSchema>;
export type CreateScrimmageJoinRequest = z.infer<typeof createScrimmageJoinRequestSchema>;
// Team event types
export type TeamEvent = typeof teamEvents.$inferSelect;
export type InsertTeamEvent = z.infer<typeof insertTeamEventSchema>;
export type CreateTeamEventRequest = z.infer<typeof createTeamEventRequestSchema>;
export type UpdateTeamEventRequest = z.infer<typeof updateTeamEventRequestSchema>;
export type TeamEventRsvp = typeof teamEventRsvps.$inferSelect;
export type InsertTeamEventRsvp = z.infer<typeof insertTeamEventRsvpSchema>;

// Extended team event types
export type TeamEventWithDetails = TeamEvent & {
  team: Team;
  creator: User;
  opponentTeam?: Team | null;
  rsvps: (TeamEventRsvp & { user: User })[];
};

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

// Facility types
export type Facility = typeof facilities.$inferSelect;
export type InsertFacility = z.infer<typeof insertFacilitySchema>;
export type CreateFacilityRequest = z.infer<typeof createFacilityRequestSchema>;
export type UpdateFacilityRequest = z.infer<typeof updateFacilityRequestSchema>;
export type FacilityMembership = typeof facilityMemberships.$inferSelect;
export type InsertFacilityMembership = z.infer<typeof insertFacilityMembershipSchema>;
export type CreateFacilityMembershipRequest = z.infer<typeof createFacilityMembershipRequestSchema>;
export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;
export type CreateCalendarEventRequest = z.infer<typeof createCalendarEventRequestSchema>;
export type UpdateCalendarEventRequest = z.infer<typeof updateCalendarEventRequestSchema>;
export type EventParticipant = typeof eventParticipants.$inferSelect;
export type InsertEventParticipant = z.infer<typeof insertEventParticipantSchema>;
export type CreateEventParticipantRequest = z.infer<typeof createEventParticipantRequestSchema>;

// Extended facility types with relationships
export type FacilityWithMemberships = Facility & {
  memberships: (FacilityMembership & { user: User })[];
};

export type CalendarEventWithDetails = CalendarEvent & {
  facility: Facility;
  creator: User;
  participants: (EventParticipant & { user: User })[];
};

export type EventParticipantWithUser = EventParticipant & {
  user: User;
};

// Visitor Count
export const insertVisitorCountSchema = createInsertSchema(visitorCount);
export type VisitorCount = typeof visitorCount.$inferSelect;
export type InsertVisitorCount = z.infer<typeof insertVisitorCountSchema>;

// User Registration Count
export const insertUserRegistrationCountSchema = createInsertSchema(userRegistrationCount);
export type UserRegistrationCount = typeof userRegistrationCount.$inferSelect;
export type InsertUserRegistrationCount = z.infer<typeof insertUserRegistrationCountSchema>;

// Tournament settings schema
export const tournamentSettingsSchema = z.object({
  byePolicy: z.enum(['top_seed_bye', 'play_in_game']).optional(),
  bracketType: z.enum(['seeded', 'blind_draw']).default('seeded'),
  showSeedNumbers: z.boolean().default(true),
  showGameNumbers: z.boolean().default(false),
}).passthrough(); // Allow additional properties for future expansion

export type TournamentSettings = z.infer<typeof tournamentSettingsSchema>;

// Tournament schemas
export const insertTournamentSchema = createInsertSchema(tournaments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTournamentTeamSchema = createInsertSchema(tournamentTeams).omit({ id: true, createdAt: true });
export const insertTournamentMatchSchema = createInsertSchema(tournamentMatches).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTournamentStatsSchema = createInsertSchema(tournamentStats).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTournamentParticipantSchema = createInsertSchema(tournamentParticipants).omit({ id: true, createdAt: true });
export const insertTournamentPhotoSchema = createInsertSchema(tournamentPhotos).omit({ id: true, uploadedAt: true });
export const insertLeaguePhotoSchema = createInsertSchema(leaguePhotos).omit({ id: true, uploadedAt: true });
export const insertTournamentPhotoTagSchema = createInsertSchema(tournamentPhotoTags).omit({ id: true, taggedAt: true });
export const insertLeaguePhotoTagSchema = createInsertSchema(leaguePhotoTags).omit({ id: true, taggedAt: true });

// League-wide Player Pro grants & seats
export const insertLeagueProGrantSchema = createInsertSchema(leagueProGrants).omit({
  id: true,
  paidAt: true,
  createdAt: true,
  updatedAt: true,
});
export const insertLeagueProSeatSchema = createInsertSchema(leagueProSeats).omit({
  id: true,
  assignedAt: true,
});
export type LeagueProGrant = typeof leagueProGrants.$inferSelect;
export type InsertLeagueProGrant = z.infer<typeof insertLeagueProGrantSchema>;
export type LeagueProSeat = typeof leagueProSeats.$inferSelect;
export type InsertLeagueProSeat = z.infer<typeof insertLeagueProSeatSchema>;

// Validation schema used by the commissioner-facing pricing/checkout endpoints.
// Sensible bounds: up to 1000 seats per grant, 24-month max window, year range
// limited to current year .. current year + 5 to prevent pathological totals
// or integer overflow on the cents columns.
const monthRe = /^(\d{4})-(0[1-9]|1[0-2])$/;
const minYear = new Date().getUTCFullYear();
const maxYear = minYear + 5;
const yearWithinBounds = (ym: string): boolean => {
  const m = monthRe.exec(ym);
  if (!m) return false;
  const y = Number(m[1]);
  return y >= minYear && y <= maxYear;
};
export const LEAGUE_PRO_MAX_SEATS = 1000;
export const LEAGUE_PRO_MAX_MONTHS = 24;
export const leagueProBulkInputSchema = z.object({
  seatCount: z.number().int().positive().max(LEAGUE_PRO_MAX_SEATS),
  startMonth: z
    .string()
    .regex(monthRe, 'startMonth must be YYYY-MM')
    .refine(yearWithinBounds, `startMonth year must be ${minYear}–${maxYear}`),
  endMonth: z
    .string()
    .regex(monthRe, 'endMonth must be YYYY-MM')
    .refine(yearWithinBounds, `endMonth year must be ${minYear}–${maxYear}`),
}).refine(
  ({ startMonth, endMonth }) => {
    const s = monthRe.exec(startMonth);
    const e = monthRe.exec(endMonth);
    if (!s || !e) return false;
    const months = (Number(e[1]) - Number(s[1])) * 12 + (Number(e[2]) - Number(s[2])) + 1;
    return months >= 1 && months <= LEAGUE_PRO_MAX_MONTHS;
  },
  { message: `Window must be 1–${LEAGUE_PRO_MAX_MONTHS} months`, path: ['endMonth'] },
);
export type LeagueProBulkInput = z.infer<typeof leagueProBulkInputSchema>;

// Update tournament match schema for PATCH operations
export const updateTournamentMatchSchema = z.object({
  // Keep datetime as string - stored as league-local time
  scheduledTime: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  team1Score: z.number().int().nullable().optional(),
  team2Score: z.number().int().nullable().optional(),
  status: z.string().optional(),
});

export type Tournament = typeof tournaments.$inferSelect;
export type InsertTournament = z.infer<typeof insertTournamentSchema>;
export type TournamentTeam = typeof tournamentTeams.$inferSelect;
export type InsertTournamentTeam = z.infer<typeof insertTournamentTeamSchema>;
export type TournamentMatch = typeof tournamentMatches.$inferSelect;
export type InsertTournamentMatch = z.infer<typeof insertTournamentMatchSchema>;
export type UpdateTournamentMatch = z.infer<typeof updateTournamentMatchSchema>;
export type TournamentStats = typeof tournamentStats.$inferSelect;
export type InsertTournamentStats = z.infer<typeof insertTournamentStatsSchema>;
export type TournamentParticipant = typeof tournamentParticipants.$inferSelect;
export type InsertTournamentParticipant = z.infer<typeof insertTournamentParticipantSchema>;
export type TournamentPhoto = typeof tournamentPhotos.$inferSelect;
export type InsertTournamentPhoto = z.infer<typeof insertTournamentPhotoSchema>;
export type LeaguePhoto = typeof leaguePhotos.$inferSelect;
export type InsertLeaguePhoto = z.infer<typeof insertLeaguePhotoSchema>;
export type TournamentPhotoTag = typeof tournamentPhotoTags.$inferSelect;
export type InsertTournamentPhotoTag = z.infer<typeof insertTournamentPhotoTagSchema>;
export type LeaguePhotoTag = typeof leaguePhotoTags.$inferSelect;
export type InsertLeaguePhotoTag = z.infer<typeof insertLeaguePhotoTagSchema>;

// Extended tournament types with relationships
export type TournamentWithDetails = Tournament & {
  teams: TournamentTeam[];
  matches: TournamentMatch[];
  creator: User;
  league: League;
  season?: Season;
};

export type TournamentMatchWithTeams = TournamentMatch & {
  team1?: TournamentTeam;
  team2?: TournamentTeam;
  winner?: TournamentTeam;
};

// Waitlist signups table for marketing and interest tracking
export const waitlistSignups = pgTable("waitlist_signups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: varchar("first_name").notNull(),
  email: varchar("email").notNull(),
  phone: varchar("phone"),
  howHeard: varchar("how_heard"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_waitlist_signups_email").on(table.email),
]);

export const insertWaitlistSignupSchema = createInsertSchema(waitlistSignups).omit({
  id: true,
  createdAt: true,
});

export type WaitlistSignup = typeof waitlistSignups.$inferSelect;
export type InsertWaitlistSignup = z.infer<typeof insertWaitlistSignupSchema>;

// Onboarding sport poll responses
export const onboardingSportPoll = pgTable("onboarding_sport_poll", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sports: text("sports").array().notNull(),
  otherSportText: varchar("other_sport_text"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertOnboardingSportPollSchema = createInsertSchema(onboardingSportPoll).omit({
  id: true,
  createdAt: true,
});

export type OnboardingSportPoll = typeof onboardingSportPoll.$inferSelect;
export type InsertOnboardingSportPoll = z.infer<typeof insertOnboardingSportPollSchema>;

// Event type enum for unified reminders
export const eventTypeEnum = pgEnum("event_type", ["game", "scrimmage"]);

// Trigger key enum for different reminder types
export const reminderTriggerEnum = pgEnum("reminder_trigger", ["2_days_6pm", "2_hours"]);

// Unified event reminders sent table - tracks reminders for both games and scrimmages
export const eventRemindersSent = pgTable("event_reminders_sent", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: eventTypeEnum("event_type").notNull(), // 'game' or 'scrimmage'
  eventId: varchar("event_id").notNull(), // game ID or scrimmage ID
  playerId: varchar("player_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  triggerKey: reminderTriggerEnum("trigger_key").notNull(), // '2_days_6pm' or '2_hours'
  sentAt: timestamp("sent_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_event_reminder").on(table.eventType, table.eventId, table.playerId, table.triggerKey),
  index("idx_event_reminders_event").on(table.eventType, table.eventId),
  index("idx_event_reminders_player").on(table.playerId),
]);

export const insertEventReminderSentSchema = createInsertSchema(eventRemindersSent).omit({
  id: true,
  sentAt: true,
});

export type EventReminderSent = typeof eventRemindersSent.$inferSelect;
export type InsertEventReminderSent = z.infer<typeof insertEventReminderSentSchema>;

// RSVP event type enum for RSVP reminders
export const rsvpEventTypeEnum = pgEnum("rsvp_event_type", ["game", "tournament_match", "team_event"]);

// RSVP reminders sent table - tracks RSVP reminders sent to users who haven't responded
export const rsvpRemindersSent = pgTable("rsvp_reminders_sent", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: rsvpEventTypeEnum("event_type").notNull(),
  eventId: varchar("event_id").notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_rsvp_reminder").on(table.eventType, table.eventId, table.userId),
  index("idx_rsvp_reminders_event").on(table.eventType, table.eventId),
  index("idx_rsvp_reminders_user").on(table.userId),
]);

export const insertRsvpReminderSentSchema = createInsertSchema(rsvpRemindersSent).omit({
  id: true,
  sentAt: true,
});

export type RsvpReminderSent = typeof rsvpRemindersSent.$inferSelect;
export type InsertRsvpReminderSent = z.infer<typeof insertRsvpReminderSentSchema>;

// ─── Referral Program ────────────────────────────────────────────────────────

export const referralPartnerStatusEnum = pgEnum("referral_partner_status", [
  "pending",
  "approved",
  "rejected",
]);

export const referralPlatformEnum = pgEnum("referral_platform", [
  "ios",
  "android",
  "web",
]);

export const referralConversionStatusEnum = pgEnum("referral_conversion_status", [
  "active",
  "cancelled",
  "refunded",
]);

// Referral partners — organizations that refer new subscribers
export const referralPartners = pgTable("referral_partners", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgName: varchar("org_name", { length: 255 }).notNull(),
  contactName: varchar("contact_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  orgType: varchar("org_type", { length: 100 }),
  hockeyAffiliation: text("hockey_affiliation"),
  proofDocumentPath: text("proof_document_path"),
  status: referralPartnerStatusEnum("status").default("pending").notNull(),
  referralCode: varchar("referral_code", { length: 20 }).unique(),
  payoutRate: decimal("payout_rate", { precision: 5, scale: 4 }).default("0.10").notNull(),
  adminNotes: text("admin_notes"),
  passwordHash: text("password_hash"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_referral_partners_status").on(table.status),
  index("idx_referral_partners_code").on(table.referralCode),
]);

export const insertReferralPartnerSchema = createInsertSchema(referralPartners).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type ReferralPartner = typeof referralPartners.$inferSelect;
export type InsertReferralPartner = z.infer<typeof insertReferralPartnerSchema>;

// Magic link tokens for partner portal auth
export const referralMagicLinks = pgTable("referral_magic_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  partnerId: varchar("partner_id").references(() => referralPartners.id, { onDelete: "cascade" }).notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_referral_magic_links_token").on(table.token),
  index("idx_referral_magic_links_partner").on(table.partnerId),
]);

export type ReferralMagicLink = typeof referralMagicLinks.$inferSelect;

// Referral conversions — tracks each subscriber referred by a partner
export const referralConversions = pgTable("referral_conversions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  partnerId: varchar("partner_id").references(() => referralPartners.id, { onDelete: "cascade" }).notNull(),
  referralCode: varchar("referral_code", { length: 20 }).notNull(),
  userId: varchar("user_id"),
  revenuecatEventId: varchar("revenuecat_event_id", { length: 255 }).unique(),
  conversionType: varchar("conversion_type", { length: 20 }).default("initial_purchase"),
  tier: varchar("tier", { length: 100 }),
  platform: referralPlatformEnum("platform"),
  grossPriceCents: integer("gross_price_cents").notNull().default(0),
  status: referralConversionStatusEnum("status").default("active").notNull(),
  convertedAt: timestamp("converted_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_referral_conversions_partner").on(table.partnerId),
  index("idx_referral_conversions_status").on(table.status),
  index("idx_referral_conversions_converted_at").on(table.convertedAt),
]);

export const insertReferralConversionSchema = createInsertSchema(referralConversions).omit({
  id: true, convertedAt: true, updatedAt: true,
});
export type ReferralConversion = typeof referralConversions.$inferSelect;
export type InsertReferralConversion = z.infer<typeof insertReferralConversionSchema>;

// Payout records — manual log of payouts issued to partners
export const referralPayouts = pgTable("referral_payouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  partnerId: varchar("partner_id").references(() => referralPartners.id, { onDelete: "cascade" }).notNull(),
  quarter: varchar("quarter", { length: 10 }).notNull(), // e.g. "2025-Q2"
  amountCents: integer("amount_cents").notNull(),
  method: varchar("method", { length: 100 }),
  reference: varchar("reference", { length: 255 }),
  notes: text("notes"),
  paidAt: timestamp("paid_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_referral_payouts_partner").on(table.partnerId),
  index("idx_referral_payouts_quarter").on(table.quarter),
]);

export const insertReferralPayoutSchema = createInsertSchema(referralPayouts).omit({
  id: true, createdAt: true,
});
export type ReferralPayout = typeof referralPayouts.$inferSelect;
export type InsertReferralPayout = z.infer<typeof insertReferralPayoutSchema>;

// Referral user links — tracks every user attributed to a partner at onboarding
// (separate from referral_conversions which only tracks paying subscribers)
export const referralUserLinks = pgTable("referral_user_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referralPartnerId: varchar("referral_partner_id").references(() => referralPartners.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").notNull(),
  linkedAt: timestamp("linked_at").defaultNow().notNull(),
  isPaid: boolean("is_paid").default(false).notNull(),
  paidTier: varchar("paid_tier", { length: 50 }),
  paidAt: timestamp("paid_at"),
}, (table) => [
  index("idx_referral_user_links_partner").on(table.referralPartnerId),
  index("idx_referral_user_links_user").on(table.userId),
  unique("uq_referral_user_links_partner_user").on(table.referralPartnerId, table.userId),
]);

export const insertReferralUserLinkSchema = createInsertSchema(referralUserLinks).omit({
  id: true, linkedAt: true,
});
export type ReferralUserLink = typeof referralUserLinks.$inferSelect;
export type InsertReferralUserLink = z.infer<typeof insertReferralUserLinkSchema>;

// Settings — key/value store for admin-editable referral program settings
export const referralSettings = pgTable("referral_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ReferralSetting = typeof referralSettings.$inferSelect;

// Photo upload quota — tracks monthly upload counts per paid user
// Primary key (userId, periodStart) makes current-month lookup a single-row read
export const photoUploadQuota = pgTable(
  "photo_upload_quota",
  {
    userId: varchar("user_id").notNull(),
    periodStart: varchar("period_start", { length: 10 }).notNull(), // "YYYY-MM-DD", first day of UTC month
    uploadCount: integer("upload_count").notNull().default(0),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.periodStart] }),
    index("idx_photo_upload_quota_user_period").on(table.userId, table.periodStart),
  ],
);

export type PhotoUploadQuota = typeof photoUploadQuota.$inferSelect;
