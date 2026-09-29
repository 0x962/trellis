import { sql } from "drizzle-orm";
import { type AnyPgColumn, check, foreignKey, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { checkIn, STORED_ACTOR_KINDS } from "../enums.ts";

// Every timestamp keeps milliseconds only. A JavaScript Date carries
// milliseconds, so a value read back equals the value written, and a keyset
// cursor built from a row matches that row again.
export const at = (name: string) => timestamp(name, { withTimezone: true, precision: 3 });

export const actors = pgTable(
	"actors",
	{
		id: uuid().defaultRandom().primaryKey(),
		name: text().notNull(),
		kind: text().notNull(),
		firstSeenAt: at("first_seen_at").notNull(),
		lastSeenAt: at("last_seen_at").notNull(),
	},
	(t) => [
		index("actors_identity_equality").using("hash", sql`ARRAY[${t.kind}, ${t.name}]`),
		check("actors_name_check", sql`${t.name} ~ '^[ -~]+$' AND position(':' IN ${t.name}) = 0`),
		checkIn(t.kind, STORED_ACTOR_KINDS),
	],
);

export const actorColumns = () => ({
	actorId: uuid("actor_id").notNull(),
	actorName: text("actor_name").notNull(),
	actorKind: text("actor_kind").notNull(),
});

export const actorFk = (name: string, t: { actorId: AnyPgColumn }) =>
	foreignKey({ name, columns: [t.actorId], foreignColumns: [actors.id] });

export const settings = pgTable("settings", {
	key: text().primaryKey(),
	value: jsonb().notNull(),
	updatedAt: at("updated_at").notNull(),
});
