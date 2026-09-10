ALTER TABLE "tickets" DROP CONSTRAINT "tickets_status_id_statuses_id_fk";
--> statement-breakpoint
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_project_fk";
--> statement-breakpoint
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_parent_fk";
--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_status_id_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."statuses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_project_fk" FOREIGN KEY ("project_id","root_id") REFERENCES "public"."projects"("id","root_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_parent_fk" FOREIGN KEY ("parent_id","root_id") REFERENCES "public"."tickets"("id","root_id") ON DELETE restrict ON UPDATE no action;