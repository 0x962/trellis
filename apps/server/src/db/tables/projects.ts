import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, text, unique, uniqueIndex } from "drizzle-orm/pg-core";
import { checkIn, REVIEWERS, STATUS_CATEGORIES } from "../enums.ts";
import { at } from "./actors.ts";

// Every project stands on its own. `key` is the prefix of every ticket
// identifier of the project, and `ticket_counter` is the last number it
// handed out. `slug` is the lower-case second name a client may type in
// place of the key. The slugs `board` and `settings` are web routes under
// a project URL, so no project takes them.
export const projects = pgTable(
	"projects",
	{
		id: text().primaryKey(),
		key: text().notNull().unique(),
		slug: text().notNull().unique(),
		name: text().notNull(),
		description: text().notNull().default(""),
		directory: text().notNull().default(""),
		ticketTemplate: text("ticket_template").notNull().default(""),
		ticketCounter: integer("ticket_counter").notNull().default(0),
		position: integer().notNull().default(0),
		archivedAt: at("archived_at"),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		check("projects_key_check", sql`${t.key} ~ '^[A-Z][A-Z0-9]{1,9}$'`),
		check(
			"projects_slug_check",
			sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND ${t.slug} NOT IN ('board', 'settings')`,
		),
		check("projects_name_check", sql`length(${t.name}) BETWEEN 1 AND 120`),
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
