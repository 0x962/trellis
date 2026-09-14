import { integer, jsonb, pgTable, primaryKey, text, unique } from "drizzle-orm/pg-core";
import { at } from "./actors.ts";
import { agentRuns } from "./agentRuns.ts";

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
	(t) => [primaryKey({ columns: [t.actorKind, t.actorName, t.requestId] })],
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
