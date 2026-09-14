CREATE TABLE "manager_controller_cursors" (
	"project_id" text PRIMARY KEY NOT NULL,
	"activity_id" bigint DEFAULT 0 NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manager_dispatches" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"run_id" text,
	"terminal_id" text,
	"session_id" text,
	"generation" integer DEFAULT 0 NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"events" jsonb NOT NULL,
	"due_at" timestamp (3) with time zone NOT NULL,
	"error" text,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "manager_dispatches_state_check" CHECK ("manager_dispatches"."state" IN ('pending', 'sending', 'sent', 'unknown'))
);
--> statement-breakpoint
ALTER TABLE "manager_controller_cursors" ADD CONSTRAINT "manager_controller_cursors_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_dispatches" ADD CONSTRAINT "manager_dispatches_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "manager_dispatches_active_project_idx" ON "manager_dispatches" USING btree ("project_id") WHERE "manager_dispatches"."state" IN ('pending', 'sending', 'unknown');