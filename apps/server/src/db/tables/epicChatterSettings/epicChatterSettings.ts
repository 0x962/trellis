import { boolean, pgTable, text } from "drizzle-orm/pg-core";
import { epics } from "../epics.ts";

export const epicChatterSettings = pgTable("epic_chatter_settings", {
	epicId: text("epic_id")
		.primaryKey()
		.references(() => epics.id, { onDelete: "cascade" }),
	enabled: boolean().notNull().default(true),
});
