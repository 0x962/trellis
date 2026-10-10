import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { at } from "./actors.ts";
import { hosts } from "./hosts/index.ts";

export const harnessAccounts = pgTable(
	"harness_accounts",
	{
		id: text().primaryKey(),
		name: text().notNull(),
		harness: text().notNull(),
		profilePath: text("profile_path").notNull(),
		isDefault: boolean("is_default").notNull().default(false),
		archivedAt: at("archived_at"),
		// The host that holds the profile directory. A caller that names no
		// host receives the local host through the default `local_host_id()`.
		hostId: text("host_id")
			.notNull()
			.default(sql`local_host_id()`)
			.references(() => hosts.id),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		uniqueIndex("harness_accounts_profile_idx")
			.on(t.hostId, t.harness, t.profilePath)
			.where(sql`${t.archivedAt} IS NULL`),
		uniqueIndex("harness_accounts_default_idx").on(t.harness).where(sql`${t.isDefault} AND ${t.archivedAt} IS NULL`),
		index("harness_accounts_host_id_idx").on(t.hostId),
	],
);
