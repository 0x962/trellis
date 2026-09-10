CREATE TABLE "trusted_folders" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "trusted_folders_project_id_path_unique" UNIQUE("project_id","path"),
	CONSTRAINT "trusted_folders_path_check" CHECK ("trusted_folders"."path" ~ '^/[^/]+(/[^/]+)*$' AND length("trusted_folders"."path") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "blocked_reason" text;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "blocked_path" text;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "blocked_detail" text;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD COLUMN "blocked_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "trusted_folders" ADD CONSTRAINT "trusted_folders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_blocked_reason_check" CHECK ("agent_sessions"."blocked_reason" IN ('folder-trust', 'runner-error', 'terminal-exited', 'no-register'));--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_blocked_at_check" CHECK (("agent_sessions"."blocked_reason" IS NULL) = ("agent_sessions"."blocked_at" IS NULL));--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_blocked_path_check" CHECK ("agent_sessions"."blocked_path" IS NULL OR "agent_sessions"."blocked_reason" = 'folder-trust');--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_blocked_detail_check" CHECK ("agent_sessions"."blocked_reason" IS NOT NULL OR "agent_sessions"."blocked_detail" IS NULL);