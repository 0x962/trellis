import { index, integer, jsonb, pgTable, text, unique } from "drizzle-orm/pg-core";
import { tickets } from "../schema.ts";
import { at } from "./actors.ts";
import { projects } from "./projects.ts";
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
		defaultPersonaId: text("default_persona_id").notNull(),
		actorKind: text("actor_kind").notNull(),
		actorName: text("actor_name").notNull(),
		requestId: text("request_id").notNull(),
		request: jsonb().notNull(),
		doc: jsonb().notNull(),
		personas: jsonb().notNull(),
		state: jsonb().notNull(),
		revision: integer().notNull(),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		unique("flow_executions_actor_request_unique").on(t.actorKind, t.actorName, t.requestId),
		index("flow_executions_ticket_idx").on(t.ticketId),
	],
);
