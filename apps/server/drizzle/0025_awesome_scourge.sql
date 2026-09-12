ALTER TABLE "flow_nodes" DROP CONSTRAINT "flow_nodes_effort_check";--> statement-breakpoint
ALTER TABLE "flow_nodes" DROP CONSTRAINT "flow_nodes_model_check";--> statement-breakpoint
ALTER TABLE "flow_nodes" DROP COLUMN "model";--> statement-breakpoint
ALTER TABLE "flow_nodes" DROP COLUMN "effort";