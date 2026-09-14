CREATE TABLE "native_migrations" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"request_id" text NOT NULL,
	"request" jsonb NOT NULL,
	"before_inventory" jsonb NOT NULL,
	"document" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"rolled_back_at" timestamp (3) with time zone
);
--> statement-breakpoint
ALTER TABLE "native_migrations" ADD CONSTRAINT "native_migrations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "native_migrations_request_idx" ON "native_migrations" USING btree ("actor_name","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "native_migrations_active_project_idx" ON "native_migrations" USING btree ("project_id") WHERE "native_migrations"."rolled_back_at" IS NULL;