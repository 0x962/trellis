CREATE TABLE "agent_pings" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "agent_pings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"project_id" text NOT NULL,
	"at" timestamp (3) with time zone NOT NULL,
	"restarted" boolean NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_pings" ADD CONSTRAINT "agent_pings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_pings_project_id_id_idx" ON "agent_pings" USING btree ("project_id","id" DESC NULLS FIRST);