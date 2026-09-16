import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { comments } from "../schema.ts";
import { agentRuns } from "./agentRuns.ts";

export const commentDeliveries = pgTable(
	"comment_deliveries",
	{
		id: text().primaryKey(),
		commentId: text("comment_id")
			.notNull()
			.references(() => comments.id, { onDelete: "cascade" }),
		// `personaId` keeps the selected persona after deletion. `dispatchMentions`
		// then marks the saved delivery as failed and keeps that result visible.
		personaId: text("persona_id"),
		runId: text("run_id").references(() => agentRuns.id, { onDelete: "cascade" }),
		personaName: text("persona_name").notNull(),
		terminalId: text("terminal_id"),
		sessionId: text("session_id"),
		state: text().notNull().default("pending"),
		error: text(),
	},
	(t) => [
		check("comment_deliveries_recipient_check", sql`${t.personaId} IS NOT NULL OR ${t.runId} IS NOT NULL`),
		uniqueIndex("comment_deliveries_persona_recipient")
			.on(t.commentId, t.personaId)
			.where(sql`${t.personaId} IS NOT NULL`),
		uniqueIndex("comment_deliveries_run_recipient").on(t.commentId, t.runId).where(sql`${t.runId} IS NOT NULL`),
		index("comment_deliveries_state_idx").on(t.state),
	],
);
