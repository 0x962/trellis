import { type SQL, sql } from "drizzle-orm";
import { type AnyPgColumn, check, index, pgTable, primaryKey, text, uniqueIndex } from "drizzle-orm/pg-core";
import { checkIn, LABEL_COLORS } from "../enums.ts";
import { tickets } from "../schema.ts";
import { at } from "./actors.ts";
import { projects } from "./projects.ts";

// The rule for a label name and for a label group name: stored trimmed, 1 to
// 80 characters, no comma, no slash, and never `none` in any case. A comma
// separates the refs of a list filter, a slash separates the group from the
// label in a `group/name` ref, and `none` is the filter value for a ticket
// with no label.
const nameRule = (name: AnyPgColumn): SQL =>
	sql`${name} = btrim(${name}) AND length(${name}) BETWEEN 1 AND 80 AND position(',' IN ${name}) = 0 AND position('/' IN ${name}) = 0 AND lower(${name}) <> 'none'`;

// `project_id` is the root project of a tree. The root owns every label group
// of the tree, and every project of the tree reads the same groups. The
// services `labelGroups.ts` and `labels.ts` write the root id; no database
// rule checks it. A group name is unique in its root without regard to case.
export const labelGroups = pgTable(
	"label_groups",
	{
		id: text().primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		name: text().notNull(),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		uniqueIndex("label_groups_project_id_name_unique").on(t.projectId, sql`lower(${t.name})`),
		check("label_groups_name_check", nameRule(t.name)),
	],
);

// `project_id` is the root project of a tree, as for `label_groups`.
// `group_id` is NULL for a label with no group. A label name is unique among
// the labels of its group, or among the labels of the root that have no
// group, without regard to case. The service `labels.ts` also keeps a label
// with no group and a group of the same root from the same name, which two
// tables cannot state in one index.
export const labels = pgTable(
	"labels",
	{
		id: text().primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		groupId: text("group_id").references(() => labelGroups.id, { onDelete: "cascade" }),
		name: text().notNull(),
		color: text().notNull(),
		description: text().notNull().default(""),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		uniqueIndex("labels_group_id_name_unique")
			.on(t.groupId, sql`lower(${t.name})`)
			.where(sql`${t.groupId} IS NOT NULL`),
		uniqueIndex("labels_project_id_name_unique")
			.on(t.projectId, sql`lower(${t.name})`)
			.where(sql`${t.groupId} IS NULL`),
		check("labels_name_check", nameRule(t.name)),
		checkIn(t.color, LABEL_COLORS),
		check("labels_description_check", sql`char_length(${t.description}) <= 255`),
		index("labels_project_id_idx").on(t.projectId),
	],
);

// One row per label on a ticket. The delete of a ticket or of a label deletes
// its rows here. A ticket holds one label of a group at most; the service
// `services/tickets/labels.ts` keeps that rule, because the group of a label
// lives on the `labels` row and not here.
export const ticketLabels = pgTable(
	"ticket_labels",
	{
		ticketId: text("ticket_id")
			.notNull()
			.references(() => tickets.id, { onDelete: "cascade" }),
		labelId: text("label_id")
			.notNull()
			.references(() => labels.id, { onDelete: "cascade" }),
		createdAt: at("created_at").notNull(),
	},
	(t) => [
		primaryKey({ name: "ticket_labels_pkey", columns: [t.ticketId, t.labelId] }),
		index("ticket_labels_label_id_idx").on(t.labelId),
	],
);
