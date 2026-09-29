import { sql } from "drizzle-orm";
import { check, foreignKey, index, jsonb, pgTable, text, unique, uniqueIndex } from "drizzle-orm/pg-core";
import { at } from "./actors.ts";
import { agentRuns } from "./agentRuns.ts";
import { sessions } from "./sessions.ts";

export const sessionUpdateRequests = pgTable(
	"session_update_requests",
	{
		requestId: text("request_id").primaryKey(),
		sessionId: text("session_id")
			.notNull()
			.references(() => sessions.id, { onDelete: "cascade" }),
		requestedAt: at("requested_at").notNull(),
		state: text().notNull(),
		error: text(),
	},
	(t) => [
		unique("session_update_requests_session_request_unique").on(t.sessionId, t.requestId),
		uniqueIndex("session_update_requests_outstanding_idx")
			.on(t.sessionId)
			.where(sql`${t.state} IN ('pending', 'sent')`),
		index("session_update_requests_latest_idx").on(t.sessionId, t.requestedAt.desc(), t.requestId.desc()),
		check("session_update_requests_state_check", sql`${t.state} IN ('pending', 'sent', 'answered', 'failed')`),
		check("session_update_requests_error_check", sql`(${t.state} = 'failed') = (${t.error} IS NOT NULL)`),
	],
);

export const sessionUpdates = pgTable(
	"session_updates",
	{
		id: text().primaryKey(),
		sessionId: text("session_id")
			.notNull()
			.references(() => sessions.id, { onDelete: "cascade" }),
		runId: text("run_id")
			.notNull()
			.references(() => agentRuns.id),
		requestId: text("request_id"),
		body: text().notNull(),
		embeds: jsonb().notNull().default([]),
		createdAt: at("created_at").notNull(),
	},
	(t) => [
		foreignKey({
			name: "session_updates_request_fk",
			columns: [t.sessionId, t.requestId],
			foreignColumns: [sessionUpdateRequests.sessionId, sessionUpdateRequests.requestId],
		}),
		unique("session_updates_session_request_unique").on(t.sessionId, t.requestId),
		index("session_updates_latest_idx").on(t.sessionId, t.createdAt.desc(), t.id.desc()),
		check("session_updates_body_check", sql`length(btrim(${t.body})) > 0`),
		check("session_updates_embeds_check", sql`jsonb_typeof(${t.embeds}) = 'array'`),
	],
);
