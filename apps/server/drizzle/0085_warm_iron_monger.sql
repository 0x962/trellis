SET lock_timeout = '3s';--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "result" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "files" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "leave_alone" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "verify" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "review_focus" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "outcome" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_files_check" CHECK (jsonb_typeof("tickets"."files") = 'array') NOT VALID;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_leave_alone_check" CHECK (jsonb_typeof("tickets"."leave_alone") = 'array') NOT VALID;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_verify_check" CHECK (jsonb_typeof("tickets"."verify") = 'array') NOT VALID;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_review_focus_check" CHECK (jsonb_typeof("tickets"."review_focus") = 'array') NOT VALID;--> statement-breakpoint
ALTER TABLE "tickets" VALIDATE CONSTRAINT "tickets_files_check";--> statement-breakpoint
ALTER TABLE "tickets" VALIDATE CONSTRAINT "tickets_leave_alone_check";--> statement-breakpoint
ALTER TABLE "tickets" VALIDATE CONSTRAINT "tickets_verify_check";--> statement-breakpoint
ALTER TABLE "tickets" VALIDATE CONSTRAINT "tickets_review_focus_check";--> statement-breakpoint
ALTER TABLE "activity" DROP CONSTRAINT "activity_description_check";--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_private_values_check" CHECK ("activity"."field" NOT IN ('description', 'result', 'outcome') OR ("activity"."from_value" IS NULL AND "activity"."to_value" IS NULL)) NOT VALID;--> statement-breakpoint
ALTER TABLE "activity" VALIDATE CONSTRAINT "activity_private_values_check";
