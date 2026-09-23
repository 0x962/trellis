import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, pgTable, text, unique, uniqueIndex } from "drizzle-orm/pg-core";
import { checkIn, PROJECT_COLORS, REVIEWERS, STATUS_CATEGORIES } from "../enums.ts";
import { at } from "./actors.ts";

// A root has a key, its own id as root_id, and the ticket counter. A child
// has a parent in the same root, a slug, no key, and a counter of zero.
// The slugs `board` and `settings` are web routes under a project path.
// The UNIQUE NULLS NOT DISTINCT (parent_id, slug) constraint lives in the
// migration 0002_constraints: drizzle-kit cannot render NULLS NOT DISTINCT.
// `color` is the name of one of the five color slots, and the index below
// gives a slot to one project at a time. A project without a color holds
// NULL, and any number of projects hold NULL.
export const projects = pgTable(
	"projects",
	{
		id: text().primaryKey(),
		parentId: text("parent_id"),
		rootId: text("root_id").notNull(),
		key: text().unique(),
		slug: text().notNull(),
		name: text().notNull(),
		description: text().notNull().default(""),
		directory: text().notNull().default(""),
		ticketTemplate: text("ticket_template").notNull().default(""),
		ticketCounter: integer("ticket_counter").notNull().default(0),
		color: text(),
		position: integer().notNull().default(0),
		archivedAt: at("archived_at"),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		unique("projects_id_root_id_unique").on(t.id, t.rootId),
		foreignKey({ name: "projects_parent_fk", columns: [t.parentId, t.rootId], foreignColumns: [t.id, t.rootId] }),
		check("projects_key_check", sql`${t.key} ~ '^[A-Z][A-Z0-9]{1,9}$'`),
		check(
			"projects_slug_check",
			sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND ${t.slug} NOT IN ('board', 'settings')`,
		),
		check("projects_name_check", sql`length(${t.name}) BETWEEN 1 AND 120`),
		check("projects_root_is_self", sql`(${t.parentId} IS NULL) = (${t.rootId} = ${t.id})`),
		check("projects_root_has_key", sql`(${t.parentId} IS NULL) = (${t.key} IS NOT NULL)`),
		check("projects_parent_not_self", sql`${t.parentId} <> ${t.id}`),
		check("projects_counter_on_root", sql`${t.parentId} IS NULL OR ${t.ticketCounter} = 0`),
		checkIn(t.color, PROJECT_COLORS),
		uniqueIndex("projects_color_idx").on(t.color),
		index("projects_root_id_idx").on(t.rootId),
	],
);

export const repos = pgTable(
	"repos",
	{
		id: text().primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		owner: text().notNull(),
		repo: text().notNull(),
	},
	(t) => [
		unique("repos_project_id_owner_repo_unique").on(t.projectId, t.owner, t.repo),
		check("repos_owner_check", sql`${t.owner} = lower(${t.owner}) AND length(${t.owner}) > 0`),
		check("repos_repo_check", sql`${t.repo} = lower(${t.repo}) AND length(${t.repo}) > 0`),
	],
);

// A review status names who reviews; every other category carries no
// reviewer. One status per project is the default for a new ticket.
// `description` is markdown that describes the status.
export const statuses = pgTable(
	"statuses",
	{
		id: text().primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		name: text().notNull(),
		description: text().notNull().default(""),
		slug: text().notNull(),
		category: text().notNull(),
		reviewer: text(),
		color: text().notNull(),
		position: integer().notNull(),
		isDefault: boolean("is_default").notNull().default(false),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		unique("statuses_project_id_name_unique").on(t.projectId, t.name),
		unique("statuses_project_id_slug_unique").on(t.projectId, t.slug),
		uniqueIndex("statuses_default_idx").on(t.projectId).where(sql`${t.isDefault}`),
		checkIn(t.category, STATUS_CATEGORIES),
		checkIn(t.reviewer, REVIEWERS),
		check("statuses_reviewer_for_review", sql`(${t.category} = 'review') = (${t.reviewer} IS NOT NULL)`),
		check("statuses_name_check", sql`length(${t.name}) BETWEEN 1 AND 40`),
		check("statuses_description_check", sql`char_length(${t.description}) <= 2000`),
	],
);
