CREATE TABLE "comment_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"comment_id" text NOT NULL,
	"run_id" text NOT NULL,
	"persona_name" text NOT NULL,
	"terminal_id" text,
	"session_id" text,
	"state" text DEFAULT 'pending' NOT NULL,
	"error" text,
	CONSTRAINT "comment_deliveries_recipient" UNIQUE("comment_id","run_id")
);
--> statement-breakpoint
ALTER TABLE "comment_deliveries" ADD CONSTRAINT "comment_deliveries_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_deliveries" ADD CONSTRAINT "comment_deliveries_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_deliveries_state_idx" ON "comment_deliveries" USING btree ("state");
--> statement-breakpoint
UPDATE "agent_runs" SET "name" = "persona_name";
