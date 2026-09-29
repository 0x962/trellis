import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, unique } from "drizzle-orm/pg-core";
import { at } from "../actors.ts";
import { agentRuns } from "../agentRuns.ts";

export const sessionObservers = pgTable(
	"session_observers",
	{
		runId: text("run_id")
			.primaryKey()
			.references(() => agentRuns.id, { onDelete: "cascade" }),
		observerId: text("observer_id").notNull(),
		enabled: boolean().notNull().default(false),
		providerId: text("provider_id").notNull(),
		modelId: text("model_id").notNull(),
		activityThreshold: integer("activity_threshold").notNull().default(20),
		generationState: text("generation_state").notNull().default("idle"),
		generation: integer().notNull().default(0),
		generationClaimId: text("generation_claim_id"),
		generationCursor: text("generation_cursor"),
		lastConsumedCursor: text("last_consumed_cursor"),
		error: text(),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		unique("session_observers_observer_id_unique").on(t.observerId),
		index("session_observers_enabled_idx").on(t.runId).where(sql`${t.enabled}`),
		check("session_observers_activity_threshold_check", sql`${t.activityThreshold} > 0`),
		check("session_observers_generation_check", sql`${t.generation} >= 0`),
		check("session_observers_generation_state_check", sql`${t.generationState} IN ('idle', 'generating')`),
		check(
			"session_observers_claim_check",
			sql`(${t.generationState} = 'generating') = (${t.generationClaimId} IS NOT NULL AND ${t.generationCursor} IS NOT NULL)`,
		),
		check("session_observers_error_check", sql`${t.error} IS NULL OR length(btrim(${t.error})) > 0`),
	],
);

export const sessionObserverMessages = pgTable(
	"session_observer_messages",
	{
		id: text().primaryKey(),
		observerId: text("observer_id")
			.notNull()
			.references(() => sessionObservers.observerId, { onDelete: "cascade" }),
		generation: integer().notNull(),
		role: text().notNull(),
		body: text().notNull(),
		createdAt: at("created_at").notNull(),
	},
	(t) => [
		index("session_observer_messages_history_idx").on(t.observerId, t.createdAt, t.id),
		check("session_observer_messages_generation_check", sql`${t.generation} > 0`),
		check("session_observer_messages_role_check", sql`${t.role} IN ('user', 'assistant')`),
		check("session_observer_messages_body_check", sql`length(${t.body}) > 0`),
	],
);
