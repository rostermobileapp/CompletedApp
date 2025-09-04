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

// Subscription tiers enum
export const subscriptionTierEnum = pgEnum("subscription_tier", [
  "free",
  "player_plus",
  "commissioner"
]);

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

// Users table (required for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  age: integer("age"),
  phoneNumber: varchar("phone_number"),
  city: varchar("city"),
  subscriptionTier: subscriptionTierEnum("subscription_tier").default("free").notNull(),
  stripeCustomerId: varchar("stripe_customer_id"),
  stripeSubscriptionId: varchar("stripe_subscription_id"),
  primarySport: sportEnum("primary_sport"),
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

// Teams table
export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  leagueId: varchar("league_id").references(() => leagues.id).notNull(),
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
  skillRating: integer("skill_rating").default(5), // 1-10 rating system for commissioners
  status: membershipStatusEnum("status").default("pending").notNull(),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  approvedAt: timestamp("approved_at"),
  approvedBy: varchar("approved_by").references(() => users.id),
  // Additional player management fields
  assignedTeamId: varchar("assigned_team_id").references(() => teams.id),
  isCaptain: boolean("is_captain").default(false),
  position: varchar("position"),
  notes: text("notes"),
  jerseyNumber: integer("jersey_number"),
});

// Team memberships table
export const teamMemberships = pgTable("team_memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  teamId: varchar("team_id").references(() => teams.id).notNull(),
  position: varchar("position"),
  jerseyNumber: integer("jersey_number"),
  skillRating: integer("skill_rating").default(5), // 1-10 rating system for commissioners
  status: membershipStatusEnum("status").default("pending").notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  approvedBy: varchar("approved_by").references(() => users.id),
});

// Games table
export const games = pgTable("games", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").references(() => leagues.id).notNull(),
  homeTeamId: varchar("home_team_id").references(() => teams.id).notNull(),
  awayTeamId: varchar("away_team_id").references(() => teams.id).notNull(),
  scheduledAt: timestamp("scheduled_at").notNull(),
  venue: varchar("venue"),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  isCompleted: boolean("is_completed").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Messages table
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  senderId: varchar("sender_id").references(() => users.id).notNull(),
  recipientId: varchar("recipient_id").references(() => users.id),
  teamId: varchar("team_id").references(() => teams.id),
  leagueId: varchar("league_id").references(() => leagues.id),
  content: text("content").notNull(),
  messageType: varchar("message_type").default("text").notNull(), // text, image, gif
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  leagueMemberships: many(leagueMemberships),
  teamMemberships: many(teamMemberships),
  sentMessages: many(messages, { relationName: "sender" }),
  receivedMessages: many(messages, { relationName: "recipient" }),
  commissionsLeagues: many(leagues),
  captainedTeams: many(teams),
}));

export const leaguesRelations = relations(leagues, ({ one, many }) => ({
  commissioner: one(users, {
    fields: [leagues.commissionerId],
    references: [users.id],
  }),
  teams: many(teams),
  memberships: many(leagueMemberships),
  games: many(games),
  messages: many(messages),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  league: one(leagues, {
    fields: [teams.leagueId],
    references: [leagues.id],
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

export const gamesRelations = relations(games, ({ one }) => ({
  league: one(leagues, {
    fields: [games.leagueId],
    references: [leagues.id],
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
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
    relationName: "sender",
  }),
  recipient: one(users, {
    fields: [messages.recipientId],
    references: [users.id],
    relationName: "recipient",
  }),
  team: one(teams, {
    fields: [messages.teamId],
    references: [teams.id],
  }),
  league: one(leagues, {
    fields: [messages.leagueId],
    references: [leagues.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  firstName: true,
  lastName: true,
  primarySport: true,
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
});

export const insertMessageSchema = createInsertSchema(messages).omit({
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

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type League = typeof leagues.$inferSelect;
export type InsertLeague = z.infer<typeof insertLeagueSchema>;
export type Team = typeof teams.$inferSelect;
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type LeagueMembership = typeof leagueMemberships.$inferSelect;
export type InsertLeagueMembership = z.infer<typeof insertLeagueMembershipSchema>;
export type TeamMembership = typeof teamMemberships.$inferSelect;
export type InsertTeamMembership = z.infer<typeof insertTeamMembershipSchema>;
export type Game = typeof games.$inferSelect;
export type InsertGame = z.infer<typeof insertGameSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Draft = typeof drafts.$inferSelect;
export type InsertDraft = z.infer<typeof insertDraftSchema>;
export type DraftPick = typeof draftPicks.$inferSelect;
export type InsertDraftPick = z.infer<typeof insertDraftPickSchema>;
