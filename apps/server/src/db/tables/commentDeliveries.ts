import { index, pgTable, text, unique } from "drizzle-orm/pg-core";
import { comments } from "../schema.ts";
import { agentRuns } from "./agentRuns.ts";

// The deliveries of ticket comments to agents, from an earlier version of
// trellis. No code reads or writes this table; it keeps the stored rows.
export const commentDeliveries = pgTable(
	"comment_deliveries",
	{
		id: text().primaryKey(),
		commentId: text("comment_id")
			.notNull()
			.references(() => comments.id, { onDelete: "cascade" }),
		runId: text("run_id")
			.notNull()
			.references(() => agentRuns.id, { onDelete: "cascade" }),
		agentName: text("agent_name").notNull(),
		terminalId: text("terminal_id"),
		sessionId: text("session_id"),
		state: text().notNull().default("pending"),
		error: text(),
	},
	(t) => [
		unique("comment_deliveries_recipient").on(t.commentId, t.runId),
		index("comment_deliveries_state_idx").on(t.state),
	],
);
