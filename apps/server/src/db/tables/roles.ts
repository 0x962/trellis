import { sql } from "drizzle-orm";
import { check, pgTable, text } from "drizzle-orm/pg-core";
import { at } from "./actors.ts";

export const roles = pgTable(
	"roles",
	{
		id: text().primaryKey(),
		name: text().notNull(),
		body: text().notNull(),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [check("roles_name_check", sql`${t.name} = btrim(${t.name}) AND length(${t.name}) >= 1`)],
);
