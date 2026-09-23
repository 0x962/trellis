CREATE TABLE "pr_flow_waivers" (
	"pull_request_id" text NOT NULL,
	"head_sha" text NOT NULL,
	"reason" text NOT NULL,
	"actor_name" text NOT NULL,
	"actor_kind" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "pr_flow_waivers_pkey" PRIMARY KEY("pull_request_id","head_sha"),
	CONSTRAINT "pr_flow_waivers_head_sha_check" CHECK (length("pr_flow_waivers"."head_sha") BETWEEN 1 AND 64),
	CONSTRAINT "pr_flow_waivers_reason_check" CHECK (length("pr_flow_waivers"."reason") BETWEEN 1 AND 2000)
);
--> statement-breakpoint
ALTER TABLE "pr_flow_waivers" ADD CONSTRAINT "pr_flow_waivers_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_flow_waivers" ADD CONSTRAINT "pr_flow_waivers_actor_fk" FOREIGN KEY ("actor_name","actor_kind") REFERENCES "public"."actors"("name","kind") ON DELETE no action ON UPDATE no action;