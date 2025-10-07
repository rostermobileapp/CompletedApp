CREATE TYPE "public"."approval_status" AS ENUM('approved', 'denied');--> statement-breakpoint
CREATE TYPE "public"."approver_type" AS ENUM('opposing_captain', 'commissioner', 'substitute_player');--> statement-breakpoint
CREATE TYPE "public"."calendar_event_type" AS ENUM('league_game', 'scrimmage', 'tournament', 'open_play');--> statement-breakpoint
CREATE TYPE "public"."conversation_type" AS ENUM('direct', 'team_group', 'custom_group', 'captain_only');--> statement-breakpoint
CREATE TYPE "public"."draft_round_type" AS ENUM('snake', 'linear');--> statement-breakpoint
CREATE TYPE "public"."draft_status" AS ENUM('created', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."event_rsvp_status" AS ENUM('joined', 'maybe', 'declined');--> statement-breakpoint
CREATE TYPE "public"."event_visibility" AS ENUM('public', 'members_only', 'participants_only');--> statement-breakpoint
CREATE TYPE "public"."facility_membership_status" AS ENUM('active', 'expired', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."feedback_category" AS ENUM('product_improvement', 'report_issue');--> statement-breakpoint
CREATE TYPE "public"."game_result_type" AS ENUM('regulation', 'overtime', 'shootout');--> statement-breakpoint
CREATE TYPE "public"."line_type" AS ENUM('forward', 'defense');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('pending', 'approved', 'rejected', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."merge_status" AS ENUM('pending', 'approved', 'rejected', 'auto_suggested');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('sent', 'delivered', 'read');--> statement-breakpoint
CREATE TYPE "public"."online_status" AS ENUM('online', 'away', 'offline');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('venmo', 'cashapp', 'cash', 'other');--> statement-breakpoint
CREATE TYPE "public"."player_type" AS ENUM('Skater', 'Goalie');--> statement-breakpoint
CREATE TYPE "public"."position" AS ENUM('LW', 'C', 'RW', 'LD', 'RD');--> statement-breakpoint
CREATE TYPE "public"."rsvp_status" AS ENUM('attending', 'not_attending', 'no_response');--> statement-breakpoint
CREATE TYPE "public"."scrimmage_request_status" AS ENUM('pending', 'approved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."scrimmage_status" AS ENUM('open', 'roster_confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."special_permission" AS ENUM('admin', 'stat_manager');--> statement-breakpoint
CREATE TYPE "public"."sport" AS ENUM('hockey', 'basketball', 'soccer', 'baseball', 'softball', 'football', 'volleyball', 'tennis', 'other');--> statement-breakpoint
CREATE TYPE "public"."substitute_request_status" AS ENUM('pending_opponent_approval', 'pending_commissioner_approval', 'pending_substitute_approval', 'approved', 'denied', 'expired');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('commissioner', 'secondary_commissioner', 'player_pro', 'free_tier');--> statement-breakpoint
CREATE TABLE "announcement_attachments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"announcement_id" varchar NOT NULL,
	"type" varchar NOT NULL,
	"url" varchar NOT NULL,
	"filename" varchar,
	"file_size" integer,
	"mime_type" varchar,
	"link_title" varchar,
	"link_description" text,
	"link_image" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcement_poll_votes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"option_index" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_poll_user_vote" UNIQUE("poll_id","user_id","option_index")
);
--> statement-breakpoint
CREATE TABLE "announcement_polls" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"announcement_id" varchar NOT NULL,
	"question" text NOT NULL,
	"options" jsonb NOT NULL,
	"allow_multiple" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcement_reactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"announcement_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"emoji" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_announcement_user_emoji" UNIQUE("announcement_id","user_id","emoji")
);
--> statement-breakpoint
CREATE TABLE "announcement_read_status" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"announcement_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"read_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_announcement_user_read" UNIQUE("announcement_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "announcement_visibility" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"announcement_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_announcement_user_visibility" UNIQUE("announcement_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" varchar NOT NULL,
	"author_id" varchar NOT NULL,
	"team_id" varchar,
	"content" text NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" varchar NOT NULL,
	"sport_id" "sport" NOT NULL,
	"event_type" "calendar_event_type" NOT NULL,
	"title" varchar NOT NULL,
	"description" text,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp NOT NULL,
	"location_detail" varchar,
	"max_participants" integer,
	"current_participants_count" integer DEFAULT 0 NOT NULL,
	"requires_membership" boolean DEFAULT true NOT NULL,
	"requires_team_roster" boolean DEFAULT false NOT NULL,
	"visibility" "event_visibility" DEFAULT 'public' NOT NULL,
	"cost_per_participant" numeric(10, 2),
	"league_id" varchar,
	"game_id" varchar,
	"scrimmage_id" varchar,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_poll_votes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"option_index" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_chat_poll_user_vote" UNIQUE("poll_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "chat_polls" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" varchar NOT NULL,
	"question" text NOT NULL,
	"options" jsonb NOT NULL,
	"status" varchar DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_participants" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"left_at" timestamp,
	"last_read_at" timestamp,
	"hidden_at" timestamp,
	"history_cleared_at" timestamp,
	CONSTRAINT "unique_conversation_user" UNIQUE("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "conversation_type" NOT NULL,
	"title" varchar,
	"league_id" varchar NOT NULL,
	"team_id" varchar,
	"created_by" varchar NOT NULL,
	"last_message_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "draft_picks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" varchar NOT NULL,
	"team_id" varchar NOT NULL,
	"player_id" varchar,
	"round" integer NOT NULL,
	"pick" integer NOT NULL,
	"pick_in_round" integer NOT NULL,
	"picked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"status" "draft_status" DEFAULT 'created' NOT NULL,
	"round_type" "draft_round_type" DEFAULT 'snake' NOT NULL,
	"current_round" integer DEFAULT 1 NOT NULL,
	"current_turn" integer DEFAULT 1 NOT NULL,
	"total_rounds" integer DEFAULT 10 NOT NULL,
	"draft_order" jsonb,
	"time_per_pick" integer DEFAULT 120,
	"scheduled_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_participants" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"facility_membership_id" varchar NOT NULL,
	"rsvp_status" "event_rsvp_status" DEFAULT 'joined' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"checked_in" boolean DEFAULT false NOT NULL,
	CONSTRAINT "unique_event_user_participant" UNIQUE("event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "facilities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"address" text,
	"city" varchar,
	"state" varchar,
	"zip_code" varchar,
	"phone_number" varchar,
	"email" varchar,
	"website" varchar,
	"image_url" varchar,
	"sports" "sport"[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facility_memberships" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"facility_id" varchar NOT NULL,
	"membership_type" varchar DEFAULT 'basic' NOT NULL,
	"status" "facility_membership_status" DEFAULT 'active' NOT NULL,
	"start_date" timestamp DEFAULT now() NOT NULL,
	"end_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_user_facility_membership" UNIQUE("user_id","facility_id")
);
--> statement-breakpoint
CREATE TABLE "feedback_submissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"category" "feedback_category" NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_goalies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" varchar NOT NULL,
	"team_id" varchar NOT NULL,
	"goalie_user_id" varchar NOT NULL,
	"is_starter" boolean DEFAULT true NOT NULL,
	"goals_against" integer DEFAULT 0 NOT NULL,
	"minutes_played" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_game_team_goalie" UNIQUE("game_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "game_rsvps" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"team_id" varchar NOT NULL,
	"status" "rsvp_status" DEFAULT 'no_response' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_game_user_team_rsvp" UNIQUE("game_id","user_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "game_score_submissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" varchar NOT NULL,
	"submitted_by" varchar NOT NULL,
	"submitter_role" varchar NOT NULL,
	"home_score" integer NOT NULL,
	"away_score" integer NOT NULL,
	"is_commissioner_override" boolean DEFAULT false NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" varchar NOT NULL,
	"season_id" varchar,
	"home_team_id" varchar NOT NULL,
	"away_team_id" varchar NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"venue" varchar,
	"locker_room" varchar,
	"home_team_locker_room" varchar,
	"away_team_locker_room" varchar,
	"home_score" integer,
	"away_score" integer,
	"is_completed" boolean DEFAULT false NOT NULL,
	"home_beverage_duty_user_id" varchar,
	"home_beverage_duty_claimed_at" timestamp,
	"away_beverage_duty_user_id" varchar,
	"away_beverage_duty_claimed_at" timestamp,
	"result_type" "game_result_type" DEFAULT 'regulation',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imported_players" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" varchar NOT NULL,
	"league_id" varchar NOT NULL,
	"first_name" varchar,
	"last_name" varchar,
	"email" varchar,
	"phone_number" varchar,
	"position" varchar,
	"jersey_number" integer,
	"skill_level" varchar,
	"team_name" varchar,
	"team_id" varchar,
	"notes" text,
	"is_placeholder" boolean DEFAULT true NOT NULL,
	"merged_with_user_id" varchar,
	"merged_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imported_schedules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" varchar NOT NULL,
	"league_id" varchar NOT NULL,
	"game_date" timestamp,
	"game_time" varchar,
	"home_team_name" varchar,
	"away_team_name" varchar,
	"home_team_id" varchar,
	"away_team_id" varchar,
	"home_team_locker_room" varchar,
	"away_team_locker_room" varchar,
	"is_processed" boolean DEFAULT false NOT NULL,
	"game_id" varchar,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "league_memberships" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"league_id" varchar NOT NULL,
	"skill_level" varchar,
	"status" "membership_status" DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"approved_at" timestamp,
	"approved_by" varchar,
	"assigned_team_id" varchar,
	"position" varchar,
	"notes" text,
	"jersey_number" integer,
	"display_first_name" varchar,
	"display_last_name" varchar,
	"is_goalie" boolean DEFAULT false NOT NULL,
	"league_role" "user_role" DEFAULT 'free_tier',
	"league_special_permissions" "special_permission"[]
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"unique_league_id" varchar NOT NULL,
	"sport" "sport" NOT NULL,
	"description" text,
	"location" varchar,
	"rink_name" varchar,
	"rink_address" text,
	"season" varchar,
	"commissioner_id" varchar NOT NULL,
	"max_teams" integer DEFAULT 16,
	"is_active" boolean DEFAULT true NOT NULL,
	"playoff_started" boolean DEFAULT false NOT NULL,
	"playoff_bracket" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "leagues_unique_league_id_unique" UNIQUE("unique_league_id")
);
--> statement-breakpoint
CREATE TABLE "line_combination_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_combination_id" varchar NOT NULL,
	"position" "position" NOT NULL,
	"player_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_line_position" UNIQUE("line_combination_id","position")
);
--> statement-breakpoint
CREATE TABLE "line_combinations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar NOT NULL,
	"game_id" varchar,
	"name" varchar NOT NULL,
	"line_type" "line_type" NOT NULL,
	"line_number" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_team_game_line" UNIQUE("team_id","game_id","line_type","line_number")
);
--> statement-breakpoint
CREATE TABLE "message_attachments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" varchar NOT NULL,
	"type" varchar NOT NULL,
	"url" varchar NOT NULL,
	"filename" varchar,
	"file_size" integer,
	"mime_type" varchar,
	"thumbnail_url" varchar,
	"width" integer,
	"height" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_read_receipts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"read_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_message_user_read" UNIQUE("message_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"sender_id" varchar NOT NULL,
	"content" text,
	"message_type" varchar DEFAULT 'text' NOT NULL,
	"status" "message_status" DEFAULT 'sent' NOT NULL,
	"edited_at" timestamp,
	"reply_to_id" varchar,
	"payment_request_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_request_recipients" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_request_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"is_paid" boolean DEFAULT false NOT NULL,
	"payment_method" "payment_method",
	"paid_at" timestamp,
	"is_confirmed" boolean DEFAULT false NOT NULL,
	"confirmed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_payment_request_user" UNIQUE("payment_request_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "payment_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" varchar NOT NULL,
	"title" varchar NOT NULL,
	"description" text,
	"amount_per_person" numeric(10, 2) NOT NULL,
	"deadline" timestamp,
	"notes" text,
	"related_scrimmage_id" varchar,
	"related_conversation_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_imports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" varchar NOT NULL,
	"imported_by" varchar NOT NULL,
	"file_name" varchar NOT NULL,
	"total_records" integer NOT NULL,
	"successful_records" integer NOT NULL,
	"failed_records" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_merge_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" varchar NOT NULL,
	"imported_player_id" varchar NOT NULL,
	"existing_user_id" varchar NOT NULL,
	"confidence_score" numeric(3, 2),
	"matching_fields" jsonb,
	"status" "merge_status" DEFAULT 'auto_suggested' NOT NULL,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_stats" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"league_id" varchar NOT NULL,
	"season_id" varchar,
	"games_played" integer DEFAULT 0 NOT NULL,
	"goals" integer DEFAULT 0 NOT NULL,
	"assists" integer DEFAULT 0 NOT NULL,
	"penalty_minutes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_player_league_season_stats" UNIQUE("user_id","league_id","season_id")
);
--> statement-breakpoint
CREATE TABLE "schedule_imports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" varchar NOT NULL,
	"imported_by" varchar NOT NULL,
	"file_name" varchar NOT NULL,
	"total_records" integer NOT NULL,
	"successful_records" integer NOT NULL,
	"failed_records" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scrimmage_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scrimmage_id" varchar NOT NULL,
	"player_id" varchar NOT NULL,
	"status" "scrimmage_request_status" DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"approved_at" timestamp,
	"dismissed_at" timestamp,
	CONSTRAINT "unique_scrimmage_player_request" UNIQUE("scrimmage_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "scrimmages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" varchar NOT NULL,
	"creator_id" varchar NOT NULL,
	"title" varchar NOT NULL,
	"date_time" timestamp NOT NULL,
	"location" varchar NOT NULL,
	"max_players" integer NOT NULL,
	"skill_level" varchar,
	"notes" text,
	"cost_per_player" numeric(10, 2),
	"status" "scrimmage_status" DEFAULT 'open' NOT NULL,
	"announcement_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"league_id" varchar NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "substitute_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" varchar NOT NULL,
	"original_player_id" varchar NOT NULL,
	"substitute_player_id" varchar,
	"requesting_team_id" varchar NOT NULL,
	"requested_by" varchar NOT NULL,
	"status" "substitute_request_status" DEFAULT 'pending_opponent_approval' NOT NULL,
	"reason" text,
	"expires_at" timestamp,
	"finalized_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "substitution_approvals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"substitution_request_id" varchar NOT NULL,
	"approver_id" varchar NOT NULL,
	"approver_type" "approver_type" NOT NULL,
	"status" "approval_status" NOT NULL,
	"comments" text,
	"approved_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_approval_per_stage" UNIQUE("substitution_request_id","approver_type")
);
--> statement-breakpoint
CREATE TABLE "team_memberships" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"team_id" varchar NOT NULL,
	"position" varchar,
	"jersey_number" integer,
	"skill_level" varchar,
	"status" "membership_status" DEFAULT 'pending' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"approved_by" varchar
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"league_id" varchar NOT NULL,
	"season_id" varchar,
	"captain_id" varchar,
	"logo_url" varchar,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"ties" integer DEFAULT 0 NOT NULL,
	"goals_for" integer DEFAULT 0 NOT NULL,
	"goals_against" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "typing_indicators" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "unique_conversation_user_typing" UNIQUE("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "user_online_status" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"status" "online_status" DEFAULT 'offline' NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_online_status_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"age" integer,
	"date_of_birth" varchar,
	"phone_number" varchar,
	"city" varchar,
	"primary_sport" "sport",
	"player_type" "player_type",
	"role" "user_role" DEFAULT 'free_tier' NOT NULL,
	"special_permissions" "special_permission"[],
	"is_primary_commissioner" boolean DEFAULT false NOT NULL,
	"created_by" varchar,
	"stripe_customer_id" varchar,
	"stripe_subscription_id" varchar,
	"venmo_username" varchar,
	"cashapp_username" varchar,
	"last_updated" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "announcement_attachments" ADD CONSTRAINT "announcement_attachments_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_poll_votes" ADD CONSTRAINT "announcement_poll_votes_poll_id_announcement_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."announcement_polls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_poll_votes" ADD CONSTRAINT "announcement_poll_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_polls" ADD CONSTRAINT "announcement_polls_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_reactions" ADD CONSTRAINT "announcement_reactions_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_reactions" ADD CONSTRAINT "announcement_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_read_status" ADD CONSTRAINT "announcement_read_status_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_read_status" ADD CONSTRAINT "announcement_read_status_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_visibility" ADD CONSTRAINT "announcement_visibility_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_visibility" ADD CONSTRAINT "announcement_visibility_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_scrimmage_id_scrimmages_id_fk" FOREIGN KEY ("scrimmage_id") REFERENCES "public"."scrimmages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_poll_votes" ADD CONSTRAINT "chat_poll_votes_poll_id_chat_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."chat_polls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_poll_votes" ADD CONSTRAINT "chat_poll_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_polls" ADD CONSTRAINT "chat_polls_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_picks" ADD CONSTRAINT "draft_picks_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_picks" ADD CONSTRAINT "draft_picks_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_picks" ADD CONSTRAINT "draft_picks_player_id_users_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_facility_membership_id_facility_memberships_id_fk" FOREIGN KEY ("facility_membership_id") REFERENCES "public"."facility_memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_memberships" ADD CONSTRAINT "facility_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facility_memberships" ADD CONSTRAINT "facility_memberships_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_submissions" ADD CONSTRAINT "feedback_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_goalies" ADD CONSTRAINT "game_goalies_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_goalies" ADD CONSTRAINT "game_goalies_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_goalies" ADD CONSTRAINT "game_goalies_goalie_user_id_users_id_fk" FOREIGN KEY ("goalie_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_rsvps" ADD CONSTRAINT "game_rsvps_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_rsvps" ADD CONSTRAINT "game_rsvps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_rsvps" ADD CONSTRAINT "game_rsvps_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_score_submissions" ADD CONSTRAINT "game_score_submissions_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_score_submissions" ADD CONSTRAINT "game_score_submissions_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_home_beverage_duty_user_id_users_id_fk" FOREIGN KEY ("home_beverage_duty_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_away_beverage_duty_user_id_users_id_fk" FOREIGN KEY ("away_beverage_duty_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_players" ADD CONSTRAINT "imported_players_import_id_player_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."player_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_players" ADD CONSTRAINT "imported_players_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_players" ADD CONSTRAINT "imported_players_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_players" ADD CONSTRAINT "imported_players_merged_with_user_id_users_id_fk" FOREIGN KEY ("merged_with_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_schedules" ADD CONSTRAINT "imported_schedules_import_id_schedule_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."schedule_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_schedules" ADD CONSTRAINT "imported_schedules_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_schedules" ADD CONSTRAINT "imported_schedules_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_schedules" ADD CONSTRAINT "imported_schedules_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_schedules" ADD CONSTRAINT "imported_schedules_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_memberships" ADD CONSTRAINT "league_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_memberships" ADD CONSTRAINT "league_memberships_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_memberships" ADD CONSTRAINT "league_memberships_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_memberships" ADD CONSTRAINT "league_memberships_assigned_team_id_teams_id_fk" FOREIGN KEY ("assigned_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_commissioner_id_users_id_fk" FOREIGN KEY ("commissioner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_combination_assignments" ADD CONSTRAINT "line_combination_assignments_line_combination_id_line_combinations_id_fk" FOREIGN KEY ("line_combination_id") REFERENCES "public"."line_combinations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_combination_assignments" ADD CONSTRAINT "line_combination_assignments_player_id_users_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_combinations" ADD CONSTRAINT "line_combinations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_combinations" ADD CONSTRAINT "line_combinations_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_read_receipts" ADD CONSTRAINT "message_read_receipts_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_read_receipts" ADD CONSTRAINT "message_read_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_request_recipients" ADD CONSTRAINT "payment_request_recipients_payment_request_id_payment_requests_id_fk" FOREIGN KEY ("payment_request_id") REFERENCES "public"."payment_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_request_recipients" ADD CONSTRAINT "payment_request_recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_related_scrimmage_id_scrimmages_id_fk" FOREIGN KEY ("related_scrimmage_id") REFERENCES "public"."scrimmages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_related_conversation_id_conversations_id_fk" FOREIGN KEY ("related_conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_imports" ADD CONSTRAINT "player_imports_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_imports" ADD CONSTRAINT "player_imports_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_merge_requests" ADD CONSTRAINT "player_merge_requests_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_merge_requests" ADD CONSTRAINT "player_merge_requests_imported_player_id_imported_players_id_fk" FOREIGN KEY ("imported_player_id") REFERENCES "public"."imported_players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_merge_requests" ADD CONSTRAINT "player_merge_requests_existing_user_id_users_id_fk" FOREIGN KEY ("existing_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_merge_requests" ADD CONSTRAINT "player_merge_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_stats" ADD CONSTRAINT "player_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_stats" ADD CONSTRAINT "player_stats_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_stats" ADD CONSTRAINT "player_stats_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_imports" ADD CONSTRAINT "schedule_imports_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_imports" ADD CONSTRAINT "schedule_imports_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrimmage_requests" ADD CONSTRAINT "scrimmage_requests_scrimmage_id_scrimmages_id_fk" FOREIGN KEY ("scrimmage_id") REFERENCES "public"."scrimmages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrimmage_requests" ADD CONSTRAINT "scrimmage_requests_player_id_users_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrimmages" ADD CONSTRAINT "scrimmages_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrimmages" ADD CONSTRAINT "scrimmages_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrimmages" ADD CONSTRAINT "scrimmages_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitute_requests" ADD CONSTRAINT "substitute_requests_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitute_requests" ADD CONSTRAINT "substitute_requests_original_player_id_users_id_fk" FOREIGN KEY ("original_player_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitute_requests" ADD CONSTRAINT "substitute_requests_substitute_player_id_users_id_fk" FOREIGN KEY ("substitute_player_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitute_requests" ADD CONSTRAINT "substitute_requests_requesting_team_id_teams_id_fk" FOREIGN KEY ("requesting_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitute_requests" ADD CONSTRAINT "substitute_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitution_approvals" ADD CONSTRAINT "substitution_approvals_substitution_request_id_substitute_requests_id_fk" FOREIGN KEY ("substitution_request_id") REFERENCES "public"."substitute_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitution_approvals" ADD CONSTRAINT "substitution_approvals_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_captain_id_users_id_fk" FOREIGN KEY ("captain_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "typing_indicators" ADD CONSTRAINT "typing_indicators_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "typing_indicators" ADD CONSTRAINT "typing_indicators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_online_status" ADD CONSTRAINT "user_online_status_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_calendar_events_facility" ON "calendar_events" USING btree ("facility_id");--> statement-breakpoint
CREATE INDEX "idx_calendar_events_sport" ON "calendar_events" USING btree ("sport_id");--> statement-breakpoint
CREATE INDEX "idx_calendar_events_start_time" ON "calendar_events" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "idx_calendar_events_event_type" ON "calendar_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_chat_poll_votes_poll" ON "chat_poll_votes" USING btree ("poll_id");--> statement-breakpoint
CREATE INDEX "idx_chat_poll_votes_user" ON "chat_poll_votes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_chat_polls_message" ON "chat_polls" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_chat_polls_status" ON "chat_polls" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_conversation_participants_conversation" ON "conversation_participants" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_conversation_participants_user" ON "conversation_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_conversation_participants_hidden" ON "conversation_participants" USING btree ("hidden_at");--> statement-breakpoint
CREATE INDEX "idx_conversation_participants_history" ON "conversation_participants" USING btree ("history_cleared_at");--> statement-breakpoint
CREATE INDEX "idx_conversations_league_id" ON "conversations" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_team_id" ON "conversations" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_last_message" ON "conversations" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "idx_event_participants_event" ON "event_participants" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_event_participants_user" ON "event_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_event_participants_membership" ON "event_participants" USING btree ("facility_membership_id");--> statement-breakpoint
CREATE INDEX "idx_facilities_city" ON "facilities" USING btree ("city");--> statement-breakpoint
CREATE INDEX "idx_facilities_state" ON "facilities" USING btree ("state");--> statement-breakpoint
CREATE INDEX "idx_facility_memberships_user" ON "facility_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_facility_memberships_facility" ON "facility_memberships" USING btree ("facility_id");--> statement-breakpoint
CREATE INDEX "idx_facility_memberships_status" ON "facility_memberships" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_game_goalies_game_id" ON "game_goalies" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "idx_game_goalies_team_id" ON "game_goalies" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_game_goalies_user_id" ON "game_goalies" USING btree ("goalie_user_id");--> statement-breakpoint
CREATE INDEX "idx_line_assignments_combination" ON "line_combination_assignments" USING btree ("line_combination_id");--> statement-breakpoint
CREATE INDEX "idx_line_assignments_player" ON "line_combination_assignments" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "idx_line_combinations_team" ON "line_combinations" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_line_combinations_game" ON "line_combinations" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "idx_message_attachments_message" ON "message_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_message_read_receipts_message" ON "message_read_receipts" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_message_read_receipts_user" ON "message_read_receipts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_messages_conversation" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_messages_sender" ON "messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "idx_messages_created_at" ON "messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_payment_request_recipients_request" ON "payment_request_recipients" USING btree ("payment_request_id");--> statement-breakpoint
CREATE INDEX "idx_payment_request_recipients_user" ON "payment_request_recipients" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_payment_requests_creator" ON "payment_requests" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "idx_payment_requests_scrimmage" ON "payment_requests" USING btree ("related_scrimmage_id");--> statement-breakpoint
CREATE INDEX "idx_payment_requests_conversation" ON "payment_requests" USING btree ("related_conversation_id");--> statement-breakpoint
CREATE INDEX "idx_player_stats_league_id" ON "player_stats" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX "idx_player_stats_user_id" ON "player_stats" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "idx_substitute_requests_game_id" ON "substitute_requests" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "idx_substitute_requests_requesting_team_id" ON "substitute_requests" USING btree ("requesting_team_id");--> statement-breakpoint
CREATE INDEX "idx_substitution_approvals_request_id" ON "substitution_approvals" USING btree ("substitution_request_id");--> statement-breakpoint
CREATE INDEX "idx_typing_indicators_conversation" ON "typing_indicators" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_typing_indicators_expires" ON "typing_indicators" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_user_online_status_user" ON "user_online_status" USING btree ("user_id");