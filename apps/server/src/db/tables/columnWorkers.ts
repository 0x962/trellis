import { boolean, pgTable, text } from "drizzle-orm/pg-core";
import { tickets } from "../schema.ts";
import { at } from "./actors.ts";
import { agentRuns } from "./agentRuns.ts";
import { statuses } from "./projects.ts";

export const columnWorkers = pgTable("column_workers", {
	ticketId: text("ticket_id")
		.primaryKey()
		.references(() => tickets.id, { onDelete: "cascade" }),
	statusId: text("status_id").references(() => statuses.id, { onDelete: "set null" }),
	runId: text("run_id")
		.notNull()
		.references(() => agentRuns.id, { onDelete: "cascade" }),
	retired: boolean().notNull().default(false),
	heartbeatAt: at("heartbeat_at"),
});
