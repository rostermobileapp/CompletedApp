-- Add display_id column to users table
ALTER TABLE "users" ADD COLUMN "display_id" varchar(6) UNIQUE;
