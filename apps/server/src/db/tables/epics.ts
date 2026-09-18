import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, unique } from "drizzle-orm/pg-core";
import { actorColumns, actorFk, at } from "./actors.ts";
import { projects } from "./projects.ts";

// An epic groups the tickets that deliver one plan inside a project. The
// `description` holds the plan as markdown. The actor columns name the last
// writer. `root_id` repeats the root of the project, so the composite
// foreign key keeps the epic and its project in one root, and the unique
// (root_id, slug) pair gives the epic its `KEY/slug` ref. The epic keeps
// no state column: its state derives from the tickets that point at it.
export const epics = pgTable(
	"epics",
	{
		id: text().primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		rootId: text("root_id").notNull(),
		slug: text().notNull(),
		name: text().notNull(),
		description: text().notNull().default(""),
		...actorColumns(),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		actorFk("epics_actor_fk", t),
		unique("epics_id_root_id_unique").on(t.id, t.rootId),
		unique("epics_root_id_slug_unique").on(t.rootId, t.slug),
		foreignKey({
			name: "epics_project_fk",
			columns: [t.projectId, t.rootId],
			foreignColumns: [projects.id, projects.rootId],
		}).onDelete("cascade"),
		check("epics_slug_check", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
		check("epics_name_check", sql`${t.name} = btrim(${t.name}) AND length(${t.name}) BETWEEN 1 AND 120`),
		check("epics_description_check", sql`length(${t.description}) <= 200000`),
		index("epics_project_id_idx").on(t.projectId),
	],
);
