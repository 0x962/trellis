import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { at } from "./actors.ts";
import { projects } from "./projects.ts";
export const nativeMigrations = pgTable(
	"native_migrations",
	{
		id: text().primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id),
		actorName: text("actor_name").notNull(),
		requestId: text("request_id").notNull(),
		request: jsonb().notNull(),
		beforeInventory: jsonb("before_inventory").notNull(),
		document: jsonb().notNull(),
		createdAt: at("created_at").notNull(),
		rolledBackAt: at("rolled_back_at"),
	},
	(t) => [
		uniqueIndex("native_migrations_request_idx").on(t.actorName, t.requestId),
		uniqueIndex("native_migrations_active_project_idx").on(t.projectId).where(sql`${t.rolledBackAt} IS NULL`),
	],
);
