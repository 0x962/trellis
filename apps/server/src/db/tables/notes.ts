import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { checkIn, NOTE_AUDIENCES } from "../enums.ts";
import { actorColumns, actorFk, at } from "./actors.ts";
import { projects } from "./projects.ts";

// A note belongs to one project and reaches every agent of that project and
// its sub-projects at start. The actor columns name the last writer. A note
// with `expires_at` in the past stays in the table and leaves every read,
// so a note about a passing state needs no delete.
export const notes = pgTable(
	"notes",
	{
		id: text().primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		title: text().notNull(),
		body: text().notNull(),
		audience: text().notNull().default("all"),
		expiresAt: at("expires_at"),
		...actorColumns(),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		actorFk("notes_actor_fk", t),
		check("notes_title_check", sql`${t.title} = btrim(${t.title}) AND length(${t.title}) BETWEEN 1 AND 120`),
		check("notes_body_check", sql`length(${t.body}) BETWEEN 1 AND 4000`),
		checkIn(t.audience, NOTE_AUDIENCES),
		// Two notes of one project never share a title, compared without case.
		uniqueIndex("notes_project_id_title_idx").on(t.projectId, sql`lower(${t.title})`),
		index("notes_project_id_updated_at_idx").on(t.projectId, t.updatedAt.desc().nullsFirst()),
	],
);
