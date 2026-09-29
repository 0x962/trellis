CREATE TABLE "session_observer_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"observer_id" text NOT NULL,
	"generation" integer NOT NULL,
	"role" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "session_observer_messages_generation_check" CHECK ("session_observer_messages"."generation" > 0),
	CONSTRAINT "session_observer_messages_role_check" CHECK ("session_observer_messages"."role" IN ('user', 'assistant')),
	CONSTRAINT "session_observer_messages_body_check" CHECK (length("session_observer_messages"."body") > 0)
);
--> statement-breakpoint
CREATE TABLE "session_observers" (
	"run_id" text PRIMARY KEY NOT NULL,
	"observer_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"provider_id" text,
	"model_id" text NOT NULL,
	"activity_threshold" integer DEFAULT 20 NOT NULL,
	"generation_state" text DEFAULT 'idle' NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL,
	"generation_claim_id" text,
	"generation_cursor" text,
	"last_consumed_cursor" text,
	"error" text,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "session_observers_observer_id_unique" UNIQUE("observer_id"),
	CONSTRAINT "session_observers_activity_threshold_check" CHECK ("session_observers"."activity_threshold" > 0),
	CONSTRAINT "session_observers_generation_check" CHECK ("session_observers"."generation" >= 0),
	CONSTRAINT "session_observers_generation_state_check" CHECK ("session_observers"."generation_state" IN ('idle', 'generating')),
	CONSTRAINT "session_observers_claim_check" CHECK (("session_observers"."generation_state" = 'generating') = ("session_observers"."generation_claim_id" IS NOT NULL AND "session_observers"."generation_cursor" IS NOT NULL)),
	CONSTRAINT "session_observers_error_check" CHECK ("session_observers"."error" IS NULL OR length(btrim("session_observers"."error")) > 0)
);
--> statement-breakpoint
ALTER TABLE "session_observer_messages" ADD CONSTRAINT "session_observer_messages_observer_id_session_observers_observer_id_fk" FOREIGN KEY ("observer_id") REFERENCES "public"."session_observers"("observer_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_observers" ADD CONSTRAINT "session_observers_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_observer_messages_history_idx" ON "session_observer_messages" USING btree ("observer_id","created_at","id");--> statement-breakpoint
CREATE INDEX "session_observers_enabled_idx" ON "session_observers" USING btree ("run_id") WHERE "session_observers"."enabled";