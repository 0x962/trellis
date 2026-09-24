import { index, integer, jsonb, pgTable, text, unique } from "drizzle-orm/pg-core";
import { tickets } from "../schema.ts";
import { at } from "./actors.ts";
import { projects } from "./projects.ts";
import { pullRequests } from "./pullRequests.ts";
export const flowExecutions = pgTable(
	"flow_executions",
	{
		id: text().primaryKey(),
		flowId: text("flow_id").notNull(),
		ticketId: text("ticket_id")
			.notNull()
			.references(() => tickets.id, { onDelete: "cascade" }),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		actorKind: text("actor_kind").notNull(),
		actorName: text("actor_name").notNull(),
		requestId: text("request_id").notNull(),
		request: jsonb().notNull(),
		diffId: text("diff_id").references(() => pullRequests.id, { onDelete: "set null" }),
		// The commit the caller named as the head of the pull request when the
		// run started. It says which code the run read. It is null for a run
		// started before this column existed, and for a run started with no
		// pull request.
		headSha: text("head_sha"),
		doc: jsonb().notNull(),
		state: jsonb().notNull(),
		revision: integer().notNull(),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		unique("flow_executions_actor_request_unique").on(t.actorKind, t.actorName, t.requestId),
		index("flow_executions_ticket_idx").on(t.ticketId),
		index("flow_executions_diff_flow_idx").on(t.diffId, t.flowId, t.createdAt),
	],
);
