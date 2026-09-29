import { sql } from "drizzle-orm";
import { check, index, pgTable, text } from "drizzle-orm/pg-core";
import { actorColumns, actorFk, at } from "./actors.ts";
import { projects } from "./projects.ts";

// An epic groups the tickets that deliver one plan inside a project. The
// `description` holds the plan as markdown. The actor columns name the last
// writer. The unique (project_id, slug) pair gives the epic its `KEY/slug`
// ref. The epic keeps no state column: its state derives from the tickets
// that point at it.
// `epics_project_slug_equality` keeps each slug unique within its project.
// The migration creates this hash index as an equality exclusion constraint,
// so long slugs fit. The slug syntax excludes the separator slash.
export const epics = pgTable(
	"epics",
	{
		id: text().primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		slug: text().notNull(),
		name: text().notNull(),
		description: text().notNull().default(""),
		...actorColumns(),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		actorFk("epics_actor_fk", t),
		index("epics_project_slug_equality").using("hash", sql`(${t.projectId} || '/' || ${t.slug})`),
		check("epics_slug_check", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
		check("epics_name_check", sql`${t.name} = btrim(${t.name}) AND length(${t.name}) >= 1`),
		index("epics_project_id_idx").on(t.projectId),
	],
);
