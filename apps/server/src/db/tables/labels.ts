import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { COLOR_TOKENS, checkIn } from "../enums.ts";
import { at } from "./actors.ts";
import { projects } from "./projects.ts";

export const labelGroups = pgTable(
	"label_groups",
	{
		id: text().primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		name: text().notNull(),
		position: integer().notNull(),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		uniqueIndex("label_groups_project_id_name_unique").on(t.projectId, sql`lower(${t.name})`),
		check("label_groups_name_check", sql`${t.name} = btrim(${t.name}) AND length(${t.name}) BETWEEN 1 AND 80`),
		check("label_groups_position_check", sql`${t.position} >= 0`),
		index("label_groups_project_id_position_idx").on(t.projectId, t.position, t.id),
	],
);

export const labels = pgTable(
	"labels",
	{
		id: text().primaryKey(),
		groupId: text("group_id")
			.notNull()
			.references(() => labelGroups.id, { onDelete: "cascade" }),
		name: text().notNull(),
		color: text().notNull().default("fg-muted"),
		position: integer().notNull(),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		uniqueIndex("labels_group_id_name_unique").on(t.groupId, sql`lower(${t.name})`),
		check("labels_name_check", sql`${t.name} = btrim(${t.name}) AND length(${t.name}) BETWEEN 1 AND 80`),
		checkIn(t.color, COLOR_TOKENS),
		check("labels_position_check", sql`${t.position} >= 0`),
		index("labels_group_id_position_idx").on(t.groupId, t.position, t.id),
	],
);
