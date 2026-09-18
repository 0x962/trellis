import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, text, unique } from "drizzle-orm/pg-core";
import { at } from "./actors.ts";
import { epics } from "./epics.ts";

// A milestone is one ordered phase of an epic. `position` orders the phases
// inside the epic: a lower position comes first. `root_id` repeats the root
// of the epic, so the composite foreign key keeps the milestone and its epic
// in one root. The unique (epic_id, slug) pair gives the milestone its
// `KEY/epic-slug/milestone-slug` ref. The milestone keeps no state column:
// its counts and its state derive from the tickets that point at it.
export const milestones = pgTable(
	"milestones",
	{
		id: text().primaryKey(),
		epicId: text("epic_id")
			.notNull()
			.references(() => epics.id, { onDelete: "cascade" }),
		rootId: text("root_id").notNull(),
		slug: text().notNull(),
		name: text().notNull(),
		position: integer().notNull(),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		unique("milestones_id_epic_id_unique").on(t.id, t.epicId),
		unique("milestones_epic_id_slug_unique").on(t.epicId, t.slug),
		foreignKey({
			name: "milestones_epic_fk",
			columns: [t.epicId, t.rootId],
			foreignColumns: [epics.id, epics.rootId],
		}).onDelete("cascade"),
		check("milestones_slug_check", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
		check("milestones_name_check", sql`${t.name} = btrim(${t.name}) AND length(${t.name}) BETWEEN 1 AND 120`),
		check("milestones_position_check", sql`${t.position} >= 0`),
		index("milestones_epic_id_position_idx").on(t.epicId, t.position),
	],
);
