import { index, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { actorColumns, actorFk, at } from "./actors.ts";
import { pages } from "./pages.ts";

export const pagePins = pgTable(
	"page_pins",
	{
		pageId: text("page_id")
			.notNull()
			.references(() => pages.id, { onDelete: "cascade" }),
		...actorColumns(),
		createdAt: at("created_at").notNull(),
	},
	(t) => [
		primaryKey({ name: "page_pins_pkey", columns: [t.pageId, t.actorName, t.actorKind] }),
		actorFk("page_pins_actor_fk", t),
		index("page_pins_actor_idx").on(t.actorKind, t.actorName, t.createdAt, t.pageId),
	],
);
