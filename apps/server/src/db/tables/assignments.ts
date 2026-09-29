import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, unique } from "drizzle-orm/pg-core";
import { at } from "./actors.ts";
import { agentRuns } from "./agentRuns.ts";

// The request identity includes the actor kind, actor name, and complete key.
// The migration installs agent_start_requests_identity as an equality exclusion
// constraint. Its hash index accepts long values and compares the full array.
export const agentStartRequests = pgTable(
	"agent_start_requests",
	{
		requestId: text("request_id").notNull(),
		actorName: text("actor_name").notNull(),
		actorKind: text("actor_kind").notNull(),
		runId: text("run_id")
			.notNull()
			.references(() => agentRuns.id, { onDelete: "cascade" }),
		target: jsonb().notNull(),
		createdAt: at("created_at").notNull(),
	},
	(t) => [
		index("agent_start_requests_identity").using("hash", sql`ARRAY[${t.actorKind}, ${t.actorName}, ${t.requestId}]`),
		index("agent_start_requests_request_id_idx").using("hash", t.requestId),
		index("agent_start_requests_latest_switch_idx")
			.on(t.runId, t.createdAt.desc())
			.where(sql`${t.target}->>'switchedTo' IS NOT NULL`),
	],
);

export const agentExecutionAttempts = pgTable(
	"agent_execution_attempts",
	{
		id: text().primaryKey(),
		runId: text("run_id")
			.notNull()
			.references(() => agentRuns.id, { onDelete: "cascade" }),
		generation: integer().notNull(),
		tokenHash: text("token_hash").notNull(),
		createdAt: at("created_at").notNull(),
	},
	(t) => [unique("agent_execution_attempts_run_generation_unique").on(t.runId, t.generation)],
);
