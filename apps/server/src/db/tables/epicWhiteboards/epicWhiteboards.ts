import { sql } from "drizzle-orm";
import { check, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { at } from "../actors.ts";
import { epics } from "../epics.ts";

// Keep this declaration aligned with migration 0150 so future migrations preserve saved board documents.
export const epicWhiteboards = pgTable(
	"epic_whiteboards",
	{
		epicId: text("epic_id")
			.primaryKey()
			.references(() => epics.id, { onDelete: "cascade" }),
		snapshot: jsonb().$type<Record<string, unknown>>().notNull(),
		revision: integer().notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		check("epic_whiteboards_snapshot_object", sql`jsonb_typeof(${t.snapshot}) = 'object'`),
		check("epic_whiteboards_revision_positive", sql`${t.revision} > 0`),
	],
);
