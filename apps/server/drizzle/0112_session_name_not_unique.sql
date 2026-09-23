ALTER TABLE "sessions" DROP CONSTRAINT "sessions_name_unique";--> statement-breakpoint
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_name_check";--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_name_check" CHECK ("sessions"."name" = btrim("sessions"."name") AND char_length("sessions"."name") BETWEEN 1 AND 60);