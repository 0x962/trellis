import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, unique } from "drizzle-orm/pg-core";
import { at } from "./actors.ts";
import { epics } from "./epics.ts";

// A wave is one ordered phase of an epic. `position` orders the phases
// inside the epic: a lower position comes first. The unique (epic_id, slug)
// pair gives the wave its `KEY/epic-slug/wave-slug` ref. The wave keeps no
// state column: its counts and its state derive from the tickets that point
// at it.
export const waves = pgTable(
	"waves",
	{
		id: text().primaryKey(),
		epicId: text("epic_id")
			.notNull()
			.references(() => epics.id, { onDelete: "cascade" }),
		slug: text().notNull(),
		name: text().notNull(),
		position: integer().notNull(),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		unique("waves_epic_id_slug_unique").on(t.epicId, t.slug),
		check("waves_slug_check", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
		check("waves_name_check", sql`${t.name} = btrim(${t.name}) AND length(${t.name}) BETWEEN 1 AND 120`),
		check("waves_position_check", sql`${t.position} >= 0`),
		index("waves_epic_id_position_idx").on(t.epicId, t.position),
	],
);
