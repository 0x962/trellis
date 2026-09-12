CREATE TABLE "flow_edges" (
	"id" text PRIMARY KEY NOT NULL,
	"flow_id" text NOT NULL,
	"from_node_id" text NOT NULL,
	"to_node_id" text NOT NULL,
	"branch" text DEFAULT 'out' NOT NULL,
	CONSTRAINT "flow_edges_from_node_id_branch_to_node_id_unique" UNIQUE("from_node_id","branch","to_node_id"),
	CONSTRAINT "flow_edges_not_self_check" CHECK ("flow_edges"."from_node_id" <> "flow_edges"."to_node_id"),
	CONSTRAINT "flow_edges_branch_check" CHECK ("flow_edges"."branch" IN ('out', 'yes', 'no'))
);
--> statement-breakpoint
CREATE TABLE "flow_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"flow_id" text NOT NULL,
	"parent_id" text,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"persona_id" text,
	"instruction" text DEFAULT '' NOT NULL,
	"model" text,
	"effort" text,
	"minutes" integer,
	"max_rounds" integer,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"width" double precision,
	"height" double precision,
	CONSTRAINT "flow_nodes_id_flow_id_unique" UNIQUE("id","flow_id"),
	CONSTRAINT "flow_nodes_parent_check" CHECK ("flow_nodes"."parent_id" <> "flow_nodes"."id"),
	CONSTRAINT "flow_nodes_kind_check" CHECK ("flow_nodes"."kind" IN ('agent', 'gate', 'human', 'budget', 'loop')),
	CONSTRAINT "flow_nodes_effort_check" CHECK ("flow_nodes"."effort" IN ('low', 'medium', 'high', 'xhigh', 'max')),
	CONSTRAINT "flow_nodes_title_check" CHECK ("flow_nodes"."title" = btrim("flow_nodes"."title") AND length("flow_nodes"."title") BETWEEN 1 AND 120),
	CONSTRAINT "flow_nodes_instruction_check" CHECK (length("flow_nodes"."instruction") <= 200000),
	CONSTRAINT "flow_nodes_model_check" CHECK ("flow_nodes"."model" IS NULL OR length("flow_nodes"."model") BETWEEN 1 AND 120),
	CONSTRAINT "flow_nodes_minutes_check" CHECK (("flow_nodes"."kind" = 'budget') = ("flow_nodes"."minutes" IS NOT NULL) AND ("flow_nodes"."minutes" IS NULL OR "flow_nodes"."minutes" BETWEEN 1 AND 1440)),
	CONSTRAINT "flow_nodes_max_rounds_check" CHECK (("flow_nodes"."kind" = 'loop') = ("flow_nodes"."max_rounds" IS NOT NULL) AND ("flow_nodes"."max_rounds" IS NULL OR "flow_nodes"."max_rounds" BETWEEN 1 AND 50)),
	CONSTRAINT "flow_nodes_size_check" CHECK (("flow_nodes"."width" IS NULL OR "flow_nodes"."width" >= 40) AND ("flow_nodes"."height" IS NULL OR "flow_nodes"."height" >= 40))
);
--> statement-breakpoint
CREATE TABLE "flows" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"briefing" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "flows_slug_unique" UNIQUE("slug"),
	CONSTRAINT "flows_slug_check" CHECK ("flows"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length("flows"."slug") <= 64),
	CONSTRAINT "flows_name_check" CHECK (length("flows"."name") BETWEEN 1 AND 120 AND "flows"."name" ~ '[^[:space:]]'),
	CONSTRAINT "flows_description_check" CHECK (length("flows"."description") <= 2000),
	CONSTRAINT "flows_briefing_check" CHECK (length("flows"."briefing") <= 200000),
	CONSTRAINT "flows_version_check" CHECK ("flows"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "flow_edges" ADD CONSTRAINT "flow_edges_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_edges" ADD CONSTRAINT "flow_edges_from_fk" FOREIGN KEY ("from_node_id","flow_id") REFERENCES "public"."flow_nodes"("id","flow_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_edges" ADD CONSTRAINT "flow_edges_to_fk" FOREIGN KEY ("to_node_id","flow_id") REFERENCES "public"."flow_nodes"("id","flow_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_nodes" ADD CONSTRAINT "flow_nodes_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_nodes" ADD CONSTRAINT "flow_nodes_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_nodes" ADD CONSTRAINT "flow_nodes_parent_fk" FOREIGN KEY ("parent_id","flow_id") REFERENCES "public"."flow_nodes"("id","flow_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flow_edges_flow_id_idx" ON "flow_edges" USING btree ("flow_id");--> statement-breakpoint
CREATE INDEX "flow_edges_to_node_id_idx" ON "flow_edges" USING btree ("to_node_id");--> statement-breakpoint
CREATE INDEX "flow_nodes_flow_id_idx" ON "flow_nodes" USING btree ("flow_id");--> statement-breakpoint
CREATE INDEX "flow_nodes_persona_id_idx" ON "flow_nodes" USING btree ("persona_id");