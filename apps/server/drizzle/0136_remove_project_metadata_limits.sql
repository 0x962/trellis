ALTER TABLE "statuses" DROP CONSTRAINT "statuses_project_id_name_unique";--> statement-breakpoint
ALTER TABLE "statuses" DROP CONSTRAINT "statuses_project_id_slug_unique";--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_name_check";--> statement-breakpoint
ALTER TABLE "statuses" DROP CONSTRAINT "statuses_description_check";--> statement-breakpoint
ALTER TABLE "statuses" DROP CONSTRAINT "statuses_name_check";--> statement-breakpoint
ALTER TABLE "statuses" ADD CONSTRAINT "statuses_project_name_equality" EXCLUDE USING hash ((length("project_id")::text || ':' || "project_id" || "name") WITH =);--> statement-breakpoint
ALTER TABLE "statuses" ADD CONSTRAINT "statuses_project_slug_equality" EXCLUDE USING hash ((length("project_id")::text || ':' || "project_id" || "slug") WITH =);--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_name_check" CHECK (length("projects"."name") >= 1);--> statement-breakpoint
ALTER TABLE "statuses" ADD CONSTRAINT "statuses_name_check" CHECK (length("statuses"."name") >= 1);
