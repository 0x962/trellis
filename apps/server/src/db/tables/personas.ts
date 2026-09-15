import { sql } from "drizzle-orm";
import { check, pgTable, text } from "drizzle-orm/pg-core";
import { at } from "./actors.ts";

export const personas = pgTable(
	"personas",
	{
		id: text().primaryKey(),
		name: text().notNull(),
		kind: text().notNull().default("reviewer"),
		// A palette token name from packages/ui, never a raw color value. The
		// web resolves the token through the theme, so one name draws right in
		// light and dark mode. The API enum holds the set of legal names.
		color: text().notNull().default("accent"),
		description: text().notNull().default(""),
		instruction: text().notNull(),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		check("personas_kind_check", sql`${t.kind} IN ('builder', 'reviewer', 'manager')`),
		check("personas_name_check", sql`length(${t.name}) BETWEEN 1 AND 120 AND ${t.name} ~ '[^[:space:]]'`),
		// One row outside the palette breaks the whole personas.list response,
		// because every row of it parses against one schema. The check keeps a
		// direct write to the database inside the set the API accepts.
		check(
			"personas_color_check",
			sql`${t.color} IN ('fg', 'fg-muted', 'fg-faint', 'accent', 'agent', 'success', 'warning', 'danger')`,
		),
		check("personas_description_check", sql`length(${t.description}) <= 2000`),
		check(
			"personas_instruction_check",
			sql`length(${t.instruction}) BETWEEN 1 AND 200000 AND ${t.instruction} ~ '[^[:space:]]'`,
		),
	],
);
