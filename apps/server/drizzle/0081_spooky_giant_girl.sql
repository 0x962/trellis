ALTER TABLE "flow_nodes" ADD COLUMN "harness" jsonb;--> statement-breakpoint
ALTER TABLE "flows" ADD COLUMN "harness" jsonb;--> statement-breakpoint
ALTER TABLE "flow_nodes" ADD CONSTRAINT "flow_nodes_harness_check" CHECK ("flow_nodes"."kind" IN ('agent', 'gate', 'loop') OR "flow_nodes"."harness" IS NULL);