import { index, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { at } from "./actors.ts";
import { agentRuns } from "./agentRuns.ts";

export const evidenceChecks = pgTable(
	"evidence_checks",
	{
		id: text().primaryKey(),
		runId: text("run_id")
			.notNull()
			.references(() => agentRuns.id, { onDelete: "cascade" }),
		attemptId: text("attempt_id").notNull(),
		document: jsonb().notNull(),
		createdAt: at("created_at").notNull(),
		finishedAt: at("finished_at"),
	},
	(t) => [index("evidence_checks_run_created_idx").on(t.runId, t.createdAt)],
);

export const evidenceArtifacts = pgTable(
	"evidence_artifacts",
	{
		id: text().primaryKey(),
		runId: text("run_id")
			.notNull()
			.references(() => agentRuns.id, { onDelete: "cascade" }),
		attemptId: text("attempt_id").notNull(),
		path: text().notNull(),
		document: jsonb().notNull(),
		createdAt: at("created_at").notNull(),
	},
	(t) => [index("evidence_artifacts_run_created_idx").on(t.runId, t.createdAt)],
);
