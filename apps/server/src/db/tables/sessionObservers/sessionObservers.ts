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
		observerRunId: text("observer_run_id").references(() => agentRuns.id, { onDelete: "set null" }),
		enabled: boolean().notNull().default(false),
		activityThreshold: integer("activity_threshold").notNull().default(20),
		generationState: text("generation_state").notNull().default("idle"),
		generation: integer().notNull().default(0),
		generationClaimId: text("generation_claim_id"),
		generationCursor: text("generation_cursor"),
		lastConsumedCursor: text("last_consumed_cursor"),
		lastAttemptedCursor: text("last_attempted_cursor"),
		errorCode: text("error_code"),
		error: text(),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		unique("session_observers_observer_id_unique").on(t.observerId),
		unique("session_observers_observer_run_id_unique").on(t.observerRunId),
		index("session_observers_enabled_idx").on(t.runId).where(sql`${t.enabled}`),
		check("session_observers_activity_threshold_check", sql`${t.activityThreshold} > 0`),
		check("session_observers_generation_check", sql`${t.generation} >= 0`),
		check("session_observers_generation_state_check", sql`${t.generationState} IN ('idle', 'generating')`),
		check(
			"session_observers_claim_check",
			sql`(${t.generationState} = 'generating') = (${t.generationClaimId} IS NOT NULL AND ${t.generationCursor} IS NOT NULL)`,
		),
		check(
			"session_observers_error_code_check",
			sql`${t.errorCode} IS NULL OR ${t.errorCode} IN ('CLAUDE_ACCOUNT_UNAVAILABLE', 'CLAUDE_PROFILE_UNAVAILABLE', 'CLAUDE_MODEL_UNAVAILABLE', 'CLAUDE_CONVERSATION_LOST', 'CLAUDE_LAUNCH_UNCONFIRMED', 'CLAUDE_GENERATION_FAILED')`,
		),
		check(
			"session_observers_error_check",
			sql`(${t.errorCode} IS NULL AND ${t.error} IS NULL) OR (${t.errorCode} IS NOT NULL AND length(btrim(${t.error})) > 0)`,
		),
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
		position: integer().notNull(),
		role: text().notNull(),
		body: text().notNull(),
		createdAt: at("created_at").notNull(),
	},
	(t) => [
		unique("session_observer_messages_position_unique").on(t.observerId, t.generation, t.position),
		check("session_observer_messages_generation_check", sql`${t.generation} > 0`),
		check("session_observer_messages_position_check", sql`${t.position} >= 0`),
		check("session_observer_messages_role_check", sql`${t.role} IN ('user', 'assistant')`),
		check("session_observer_messages_body_check", sql`length(${t.body}) > 0`),
	],
);
