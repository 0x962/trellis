ALTER TABLE "epics" DROP CONSTRAINT "epics_project_id_slug_unique";--> statement-breakpoint
ALTER TABLE "waves" DROP CONSTRAINT "waves_epic_id_slug_unique";--> statement-breakpoint
ALTER TABLE "epics" DROP CONSTRAINT "epics_name_check";--> statement-breakpoint
ALTER TABLE "waves" DROP CONSTRAINT "waves_name_check";--> statement-breakpoint
ALTER TABLE "epics" ADD CONSTRAINT "epics_project_slug_equality" EXCLUDE USING hash (("project_id" || '/' || "slug") WITH =);--> statement-breakpoint
ALTER TABLE "waves" ADD CONSTRAINT "waves_epic_slug_equality" EXCLUDE USING hash (("epic_id" || '/' || "slug") WITH =);--> statement-breakpoint
ALTER TABLE "epics" ADD CONSTRAINT "epics_name_check" CHECK ("epics"."name" = btrim("epics"."name") AND length("epics"."name") >= 1);--> statement-breakpoint
ALTER TABLE "waves" ADD CONSTRAINT "waves_name_check" CHECK ("waves"."name" = btrim("waves"."name") AND length("waves"."name") >= 1);