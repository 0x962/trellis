ALTER TABLE "sessions" RENAME COLUMN "title_state" TO "name_state";--> statement-breakpoint
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_title_state_check";--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_name_state_check" CHECK ("sessions"."name_state" IN ('temporary', 'requested', 'set'));