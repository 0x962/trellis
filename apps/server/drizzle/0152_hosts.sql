CREATE TABLE "hosts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"local" boolean DEFAULT false NOT NULL,
	"endpoint" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enrolled_identity" text,
	"host_key_fingerprint" text,
	"os" text,
	"arch" text,
	"state" text NOT NULL,
	"retired_at" timestamp (3) with time zone,
	"revoked_at" timestamp (3) with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "hosts_name_check" CHECK ("hosts"."name" = btrim("hosts"."name") AND length("hosts"."name") >= 1),
	CONSTRAINT "hosts_kind_check" CHECK ("hosts"."kind" IN ('local', 'ssh')),
	CONSTRAINT "hosts_local_check" CHECK ("hosts"."local" = ("hosts"."kind" = 'local')),
	CONSTRAINT "hosts_state_check" CHECK ("hosts"."state" IN ('active', 'retired', 'revoked')),
	CONSTRAINT "hosts_revision_check" CHECK ("hosts"."revision" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "hosts_local_idx" ON "hosts" USING btree ("local") WHERE "hosts"."local";--> statement-breakpoint
CREATE TABLE "host_observations" (
	"host_id" text PRIMARY KEY NOT NULL,
	"observed_at" timestamp (3) with time zone NOT NULL,
	"result" text NOT NULL,
	"observed_identity" text,
	"protocol" integer,
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"detail" text,
	CONSTRAINT "host_observations_result_check" CHECK ("host_observations"."result" IN ('reachable', 'unreachable', 'identity_mismatch', 'incompatible'))
);
--> statement-breakpoint
ALTER TABLE "host_observations" ADD CONSTRAINT "host_observations_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "hosts" ("id", "name", "kind", "local", "state", "created_at", "updated_at")
SELECT (
	SELECT string_agg(substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', digit + 1, 1), '' ORDER BY position)
	FROM (
		SELECT position, ((floor(extract(epoch FROM now()) * 1000)::bigint >> (5 * (9 - position))) & 31)::int AS digit
		FROM generate_series(0, 9) AS position
		UNION ALL
		SELECT position, floor(random() * 32)::int AS digit
		FROM generate_series(10, 25) AS position
	) digits
), 'Execution host', 'local', true, 'active', now(), now();--> statement-breakpoint
CREATE FUNCTION local_host_id() RETURNS text LANGUAGE sql STABLE AS $$ SELECT id FROM hosts WHERE local $$;--> statement-breakpoint
CREATE TABLE "workspace_control" (
	"id" text PRIMARY KEY NOT NULL,
	"controller_owner_epoch" integer DEFAULT 1 NOT NULL,
	"default_host_id" text NOT NULL,
	"singleton" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "workspace_control_singleton_unique" UNIQUE("singleton"),
	CONSTRAINT "workspace_control_epoch_check" CHECK ("workspace_control"."controller_owner_epoch" >= 1),
	CONSTRAINT "workspace_control_singleton_check" CHECK ("workspace_control"."singleton")
);
--> statement-breakpoint
ALTER TABLE "workspace_control" ADD CONSTRAINT "workspace_control_default_host_id_hosts_id_fk" FOREIGN KEY ("default_host_id") REFERENCES "public"."hosts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "workspace_control" ("id", "controller_owner_epoch", "default_host_id", "singleton", "created_at", "updated_at")
SELECT (
	SELECT string_agg(substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', digit + 1, 1), '' ORDER BY position)
	FROM (
		SELECT position, ((floor(extract(epoch FROM now()) * 1000)::bigint >> (5 * (9 - position))) & 31)::int AS digit
		FROM generate_series(0, 9) AS position
		UNION ALL
		SELECT position, floor(random() * 32)::int AS digit
		FROM generate_series(10, 25) AS position
	) digits
), 1, local_host_id(), true, now(), now();--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "host_id" text;--> statement-breakpoint
ALTER TABLE "agent_execution_attempts" ADD COLUMN "host_id" text;--> statement-breakpoint
ALTER TABLE "flow_executions" ADD COLUMN "host_id" text;--> statement-breakpoint
ALTER TABLE "harness_accounts" ADD COLUMN "host_id" text;--> statement-breakpoint
UPDATE "agent_runs" SET "host_id" = local_host_id();--> statement-breakpoint
UPDATE "agent_execution_attempts" SET "host_id" = local_host_id();--> statement-breakpoint
UPDATE "flow_executions" SET "host_id" = local_host_id();--> statement-breakpoint
UPDATE "harness_accounts" SET "host_id" = local_host_id();--> statement-breakpoint
ALTER TABLE "agent_runs" ALTER COLUMN "host_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_execution_attempts" ALTER COLUMN "host_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "flow_executions" ALTER COLUMN "host_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "harness_accounts" ALTER COLUMN "host_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ALTER COLUMN "host_id" SET DEFAULT local_host_id();--> statement-breakpoint
ALTER TABLE "agent_execution_attempts" ALTER COLUMN "host_id" SET DEFAULT local_host_id();--> statement-breakpoint
ALTER TABLE "flow_executions" ALTER COLUMN "host_id" SET DEFAULT local_host_id();--> statement-breakpoint
ALTER TABLE "harness_accounts" ALTER COLUMN "host_id" SET DEFAULT local_host_id();--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_execution_attempts" ADD CONSTRAINT "agent_execution_attempts_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_executions" ADD CONSTRAINT "flow_executions_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harness_accounts" ADD CONSTRAINT "harness_accounts_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_host_id_idx" ON "agent_runs" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "agent_execution_attempts_host_id_idx" ON "agent_execution_attempts" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "flow_executions_host_id_idx" ON "flow_executions" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "harness_accounts_host_id_idx" ON "harness_accounts" USING btree ("host_id");--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "host_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "default_host_id" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_default_host_id_hosts_id_fk" FOREIGN KEY ("default_host_id") REFERENCES "public"."hosts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tickets_host_id_idx" ON "tickets" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "projects_default_host_id_idx" ON "projects" USING btree ("default_host_id");--> statement-breakpoint
CREATE TABLE "project_host_paths" (
	"project_id" text NOT NULL,
	"host_id" text NOT NULL,
	"directory" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "project_host_paths_project_id_host_id_pk" PRIMARY KEY("project_id","host_id"),
	CONSTRAINT "project_host_paths_directory_check" CHECK (length("project_host_paths"."directory") >= 1)
);
--> statement-breakpoint
ALTER TABLE "project_host_paths" ADD CONSTRAINT "project_host_paths_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_host_paths" ADD CONSTRAINT "project_host_paths_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_host_paths_host_id_idx" ON "project_host_paths" USING btree ("host_id");--> statement-breakpoint
INSERT INTO "project_host_paths" ("project_id", "host_id", "directory", "created_at", "updated_at")
SELECT "id", local_host_id(), "directory", now(), now() FROM "projects" WHERE length("directory") >= 1;--> statement-breakpoint
DROP INDEX "harness_accounts_profile_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "harness_accounts_profile_idx" ON "harness_accounts" USING btree ("host_id","harness","profile_path") WHERE "harness_accounts"."archived_at" IS NULL;
