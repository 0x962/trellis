import { sql } from "drizzle-orm";
import { boolean, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { at } from "./actors.ts";

export const harnessAccounts = pgTable(
	"harness_accounts",
	{
		id: text().primaryKey(),
		name: text().notNull(),
		harness: text().notNull(),
		profilePath: text("profile_path").notNull(),
		isDefault: boolean("is_default").notNull().default(false),
		archivedAt: at("archived_at"),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		uniqueIndex("harness_accounts_profile_idx").on(t.harness, t.profilePath).where(sql`${t.archivedAt} IS NULL`),
		uniqueIndex("harness_accounts_default_idx").on(t.harness).where(sql`${t.isDefault} AND ${t.archivedAt} IS NULL`),
	],
);
