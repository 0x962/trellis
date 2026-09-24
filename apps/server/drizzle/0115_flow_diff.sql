ALTER TABLE "flow_executions" ADD COLUMN "diff_id" text;--> statement-breakpoint
ALTER TABLE "flow_executions" ADD CONSTRAINT "flow_executions_diff_id_pull_requests_id_fk" FOREIGN KEY ("diff_id") REFERENCES "public"."pull_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flow_executions_diff_flow_idx" ON "flow_executions" USING btree ("diff_id","flow_id","created_at");
--> statement-breakpoint
UPDATE flow_executions execution
SET diff_id = sole.diff_id
FROM (
	SELECT ticket_id, min(pull_request_id) AS diff_id
	FROM ticket_pull_requests
	GROUP BY ticket_id HAVING count(*) = 1
) sole
WHERE execution.ticket_id = sole.ticket_id;
