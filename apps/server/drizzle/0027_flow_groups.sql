ALTER TABLE "flow_nodes" DROP CONSTRAINT "flow_nodes_kind_check";--> statement-breakpoint
ALTER TABLE "flow_nodes" DROP CONSTRAINT "flow_nodes_title_check";--> statement-breakpoint
ALTER TABLE "flow_nodes" DROP CONSTRAINT "flow_nodes_minutes_check";--> statement-breakpoint
ALTER TABLE "flow_nodes" ADD COLUMN "parallel" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "flow_nodes" SET "kind" = 'group' WHERE "kind" = 'budget';--> statement-breakpoint
ALTER TABLE "flow_nodes" ADD CONSTRAINT "flow_nodes_parallel_check" CHECK ("flow_nodes"."kind" = 'group' OR "flow_nodes"."parallel" = false);--> statement-breakpoint
ALTER TABLE "flow_nodes" ADD CONSTRAINT "flow_nodes_kind_check" CHECK ("flow_nodes"."kind" IN ('agent', 'gate', 'human', 'group', 'loop'));--> statement-breakpoint
ALTER TABLE "flow_nodes" ADD CONSTRAINT "flow_nodes_title_check" CHECK (length("flow_nodes"."title") <= 120);--> statement-breakpoint
ALTER TABLE "flow_nodes" ADD CONSTRAINT "flow_nodes_minutes_check" CHECK (("flow_nodes"."kind" = 'group' OR "flow_nodes"."minutes" IS NULL) AND ("flow_nodes"."minutes" IS NULL OR "flow_nodes"."minutes" BETWEEN 1 AND 1440));