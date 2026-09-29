ALTER TABLE "flow_nodes" DROP CONSTRAINT "flow_nodes_title_check";--> statement-breakpoint
ALTER TABLE "flow_nodes" DROP CONSTRAINT "flow_nodes_instruction_check";--> statement-breakpoint
ALTER TABLE "flow_nodes" DROP CONSTRAINT "flow_nodes_minutes_check";--> statement-breakpoint
ALTER TABLE "flow_nodes" DROP CONSTRAINT "flow_nodes_max_rounds_check";--> statement-breakpoint
ALTER TABLE "flow_nodes" DROP CONSTRAINT "flow_nodes_size_check";--> statement-breakpoint
ALTER TABLE "flows" DROP CONSTRAINT "flows_description_check";--> statement-breakpoint
ALTER TABLE "flows" DROP CONSTRAINT "flows_briefing_check";--> statement-breakpoint
ALTER TABLE "flows" DROP CONSTRAINT "flows_slug_check";--> statement-breakpoint
ALTER TABLE "flows" DROP CONSTRAINT "flows_name_check";--> statement-breakpoint
ALTER TABLE "pr_flow_waivers" DROP CONSTRAINT "pr_flow_waivers_reason_check";--> statement-breakpoint
ALTER TABLE "flow_nodes" ADD CONSTRAINT "flow_nodes_coordinates_check" CHECK ("flow_nodes"."x" NOT IN ('Infinity'::double precision, '-Infinity'::double precision, 'NaN'::double precision) AND "flow_nodes"."y" NOT IN ('Infinity'::double precision, '-Infinity'::double precision, 'NaN'::double precision));--> statement-breakpoint
ALTER TABLE "flow_nodes" ADD CONSTRAINT "flow_nodes_minutes_check" CHECK (("flow_nodes"."kind" = 'group' OR "flow_nodes"."minutes" IS NULL) AND ("flow_nodes"."minutes" IS NULL OR "flow_nodes"."minutes" > 0));--> statement-breakpoint
ALTER TABLE "flow_nodes" ADD CONSTRAINT "flow_nodes_max_rounds_check" CHECK (("flow_nodes"."kind" = 'loop') = ("flow_nodes"."max_rounds" IS NOT NULL) AND ("flow_nodes"."max_rounds" IS NULL OR "flow_nodes"."max_rounds" > 0));--> statement-breakpoint
ALTER TABLE "flow_nodes" ADD CONSTRAINT "flow_nodes_size_check" CHECK (("flow_nodes"."width" IS NULL OR ("flow_nodes"."width" NOT IN ('Infinity'::double precision, '-Infinity'::double precision, 'NaN'::double precision) AND "flow_nodes"."width" >= 40)) AND ("flow_nodes"."height" IS NULL OR ("flow_nodes"."height" NOT IN ('Infinity'::double precision, '-Infinity'::double precision, 'NaN'::double precision) AND "flow_nodes"."height" >= 40)));--> statement-breakpoint
ALTER TABLE "flows" ADD CONSTRAINT "flows_slug_check" CHECK ("flows"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');--> statement-breakpoint
ALTER TABLE "flows" ADD CONSTRAINT "flows_name_check" CHECK (length("flows"."name") >= 1 AND "flows"."name" ~ '[^[:space:]]');--> statement-breakpoint
ALTER TABLE "pr_flow_waivers" ADD CONSTRAINT "pr_flow_waivers_reason_check" CHECK (length("pr_flow_waivers"."reason") >= 1);