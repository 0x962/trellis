import { sql } from "drizzle-orm";
import { check, pgTable, text } from "drizzle-orm/pg-core";
import { at } from "./actors.ts";

export const personas = pgTable(
	"personas",
	{
		id: text().primaryKey(),
		name: text().notNull(),
		instruction: text().notNull(),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		check("personas_name_check", sql`length(${t.name}) BETWEEN 1 AND 120 AND ${t.name} ~ '[^[:space:]]'`),
		check(
			"personas_instruction_check",
			sql`length(${t.instruction}) BETWEEN 1 AND 200000 AND ${t.instruction} ~ '[^[:space:]]'`,
		),
	],
);
