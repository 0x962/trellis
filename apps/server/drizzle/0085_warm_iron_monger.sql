ALTER TABLE "tickets" ADD COLUMN "result" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "files" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "leave_alone" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "verify" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "review_focus" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "outcome" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_files_check" CHECK (jsonb_typeof("tickets"."files") = 'array');--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_leave_alone_check" CHECK (jsonb_typeof("tickets"."leave_alone") = 'array');--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_verify_check" CHECK (jsonb_typeof("tickets"."verify") = 'array');--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_review_focus_check" CHECK (jsonb_typeof("tickets"."review_focus") = 'array');