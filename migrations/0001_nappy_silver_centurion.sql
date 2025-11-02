CREATE TYPE "public"."duty_scope" AS ENUM('single_game', 'every_game');--> statement-breakpoint
CREATE TYPE "public"."recurrence_type" AS ENUM('none', 'daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TABLE "duty_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"duty_template_id" varchar NOT NULL,
	"game_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"team_id" varchar NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_duty_game_assignment" UNIQUE("duty_template_id","game_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "duty_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"icon" varchar NOT NULL,
	"scope" "duty_scope" NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_stars" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" varchar NOT NULL,
	"first_star_user_id" varchar NOT NULL,
	"second_star_user_id" varchar NOT NULL,
	"third_star_user_id" varchar NOT NULL,
	"awarded_by" varchar NOT NULL,
	"awarded_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_game_stars" UNIQUE("game_id")
);
--> statement-breakpoint
CREATE TABLE "invite_group_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" varchar NOT NULL,
	"user_id" varchar,
	"email" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_group_user" UNIQUE("group_id","user_id"),
	CONSTRAINT "unique_group_email" UNIQUE("group_id","email")
);
--> statement-breakpoint
CREATE TABLE "invite_groups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" varchar NOT NULL,
	"league_id" varchar,
	"name" varchar NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_reminders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"title" varchar NOT NULL,
	"description" text,
	"scheduled_at" timestamp NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "placeholder_players" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar NOT NULL,
	"first_name" varchar NOT NULL,
	"last_name" varchar NOT NULL,
	"email" varchar,
	"position" varchar,
	"jersey_number" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"added_by" varchar
);
--> statement-breakpoint
CREATE TABLE "scrimmage_invites" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scrimmage_id" varchar NOT NULL,
	"email" varchar NOT NULL,
	"invited_at" timestamp DEFAULT now() NOT NULL,
	"user_id" varchar,
	CONSTRAINT "unique_scrimmage_email_invite" UNIQUE("scrimmage_id","email")
);
--> statement-breakpoint
CREATE TABLE "team_league_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar NOT NULL,
	"league_id" varchar NOT NULL,
	"requested_by" varchar NOT NULL,
	"status" "membership_status" DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"approved_at" timestamp,
	"approved_by" varchar,
	"rejected_at" timestamp,
	CONSTRAINT "unique_team_league_request" UNIQUE("team_id","league_id")
);
--> statement-breakpoint
CREATE TABLE "visitor_count" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "games" ALTER COLUMN "league_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ALTER COLUMN "away_team_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ALTER COLUMN "league_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "opponent_name" varchar;--> statement-breakpoint
ALTER TABLE "league_memberships" ADD COLUMN "is_skater" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "facility_id" varchar;--> statement-breakpoint
ALTER TABLE "scrimmages" ADD COLUMN "is_recurring" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scrimmages" ADD COLUMN "recurrence_type" "recurrence_type" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "scrimmages" ADD COLUMN "recurrence_days" integer[];--> statement-breakpoint
ALTER TABLE "scrimmages" ADD COLUMN "recurrence_end_date" timestamp;--> statement-breakpoint
ALTER TABLE "scrimmages" ADD COLUMN "recurrence_count" integer;--> statement-breakpoint
ALTER TABLE "scrimmages" ADD COLUMN "parent_scrimmage_id" varchar;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "unique_team_id" varchar;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "creator_id" varchar;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "facility_id" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "user_number" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "navigation_preferences" jsonb;--> statement-breakpoint
ALTER TABLE "duty_assignments" ADD CONSTRAINT "duty_assignments_duty_template_id_duty_templates_id_fk" FOREIGN KEY ("duty_template_id") REFERENCES "public"."duty_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_assignments" ADD CONSTRAINT "duty_assignments_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_assignments" ADD CONSTRAINT "duty_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_assignments" ADD CONSTRAINT "duty_assignments_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_templates" ADD CONSTRAINT "duty_templates_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duty_templates" ADD CONSTRAINT "duty_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_stars" ADD CONSTRAINT "game_stars_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_stars" ADD CONSTRAINT "game_stars_first_star_user_id_users_id_fk" FOREIGN KEY ("first_star_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_stars" ADD CONSTRAINT "game_stars_second_star_user_id_users_id_fk" FOREIGN KEY ("second_star_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_stars" ADD CONSTRAINT "game_stars_third_star_user_id_users_id_fk" FOREIGN KEY ("third_star_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_stars" ADD CONSTRAINT "game_stars_awarded_by_users_id_fk" FOREIGN KEY ("awarded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_group_members" ADD CONSTRAINT "invite_group_members_group_id_invite_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."invite_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_group_members" ADD CONSTRAINT "invite_group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_groups" ADD CONSTRAINT "invite_groups_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_groups" ADD CONSTRAINT "invite_groups_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_reminders" ADD CONSTRAINT "personal_reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placeholder_players" ADD CONSTRAINT "placeholder_players_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placeholder_players" ADD CONSTRAINT "placeholder_players_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrimmage_invites" ADD CONSTRAINT "scrimmage_invites_scrimmage_id_scrimmages_id_fk" FOREIGN KEY ("scrimmage_id") REFERENCES "public"."scrimmages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrimmage_invites" ADD CONSTRAINT "scrimmage_invites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_league_requests" ADD CONSTRAINT "team_league_requests_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_league_requests" ADD CONSTRAINT "team_league_requests_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_league_requests" ADD CONSTRAINT "team_league_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_league_requests" ADD CONSTRAINT "team_league_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_duty_assignments_game_id" ON "duty_assignments" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "idx_duty_assignments_user_id" ON "duty_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_duty_assignments_template_id" ON "duty_assignments" USING btree ("duty_template_id");--> statement-breakpoint
CREATE INDEX "idx_duty_templates_team_id" ON "duty_templates" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_game_stars_game_id" ON "game_stars" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "idx_game_stars_first_star" ON "game_stars" USING btree ("first_star_user_id");--> statement-breakpoint
CREATE INDEX "idx_game_stars_second_star" ON "game_stars" USING btree ("second_star_user_id");--> statement-breakpoint
CREATE INDEX "idx_game_stars_third_star" ON "game_stars" USING btree ("third_star_user_id");--> statement-breakpoint
CREATE INDEX "idx_personal_reminders_user_id" ON "personal_reminders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_personal_reminders_scheduled_at" ON "personal_reminders" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_team_league_requests_team" ON "team_league_requests" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_team_league_requests_league" ON "team_league_requests" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX "idx_team_league_requests_status" ON "team_league_requests" USING btree ("status");--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_unique_team_id_unique" UNIQUE("unique_team_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_user_number_unique" UNIQUE("user_number");