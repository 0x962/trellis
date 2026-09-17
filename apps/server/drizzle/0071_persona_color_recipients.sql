ALTER TABLE "comment_deliveries" DROP CONSTRAINT "comment_deliveries_recipient";--> statement-breakpoint
ALTER TABLE "comment_deliveries" ALTER COLUMN "run_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "color" text DEFAULT 'accent' NOT NULL;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "comment_deliveries" ADD COLUMN "persona_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "comment_deliveries_persona_recipient" ON "comment_deliveries" USING btree ("comment_id","persona_id") WHERE "comment_deliveries"."persona_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "comment_deliveries_run_recipient" ON "comment_deliveries" USING btree ("comment_id","run_id") WHERE "comment_deliveries"."run_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_color_check" CHECK ("personas"."color" IN ('fg', 'fg-muted', 'fg-faint', 'accent', 'agent', 'success', 'warning', 'danger'));--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_description_check" CHECK (length("personas"."description") <= 2000);--> statement-breakpoint
ALTER TABLE "comment_deliveries" ADD CONSTRAINT "comment_deliveries_recipient_check" CHECK ("comment_deliveries"."persona_id" IS NOT NULL OR "comment_deliveries"."run_id" IS NOT NULL);