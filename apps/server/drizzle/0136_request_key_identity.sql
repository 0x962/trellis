ALTER TABLE "agent_start_requests" DROP CONSTRAINT "agent_start_requests_actor_kind_actor_name_request_id_pk";--> statement-breakpoint
ALTER TABLE "agent_start_requests" ADD CONSTRAINT "agent_start_requests_identity" EXCLUDE USING hash ((ARRAY["actor_kind", "actor_name", "request_id"]) WITH =);--> statement-breakpoint
CREATE INDEX "agent_start_requests_request_id_idx" ON "agent_start_requests" USING hash ("request_id");
