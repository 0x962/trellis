import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, text, unique } from "drizzle-orm/pg-core";
import { actorColumns, actorFk, actors, at } from "./actors.ts";
import { projects } from "./projects.ts";

export const pages = pgTable(
	"pages",
	{
		id: text().primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		slug: text().notNull(),
		title: text().notNull(),
		summary: text().notNull().default(""),
		version: integer().notNull().default(1),
		latestVersion: integer("latest_version").notNull().default(1),
		creatorActorName: text("creator_actor_name").notNull(),
		creatorActorKind: text("creator_actor_kind").notNull(),
		...actorColumns(),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
		deletedAt: at("deleted_at"),
		deletedActorName: text("deleted_actor_name"),
		deletedActorKind: text("deleted_actor_kind"),
	},
	(t) => [
		unique("pages_project_id_slug_unique").on(t.projectId, t.slug),
		foreignKey({
			name: "pages_creator_actor_fk",
			columns: [t.creatorActorName, t.creatorActorKind],
			foreignColumns: [actors.name, actors.kind],
		}),
		actorFk("pages_actor_fk", t),
		foreignKey({
			name: "pages_deleted_actor_fk",
			columns: [t.deletedActorName, t.deletedActorKind],
			foreignColumns: [actors.name, actors.kind],
		}),
		check("pages_slug_check", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
		check("pages_title_check", sql`${t.title} = btrim(${t.title}) AND length(${t.title}) BETWEEN 1 AND 200`),
		check("pages_summary_check", sql`length(${t.summary}) <= 2000`),
		check("pages_version_check", sql`${t.version} > 0`),
		check("pages_latest_version_check", sql`${t.latestVersion} > 0 AND ${t.latestVersion} <= ${t.version}`),
		check(
			"pages_deleted_check",
			sql`(${t.deletedAt} IS NULL) = (${t.deletedActorName} IS NULL)
				AND (${t.deletedAt} IS NULL) = (${t.deletedActorKind} IS NULL)`,
		),
		index("pages_project_id_updated_at_id_idx")
			.on(t.projectId, t.updatedAt.desc().nullsFirst(), t.id.desc().nullsFirst())
			.where(sql`${t.deletedAt} IS NULL`),
		index("pages_deleted_at_idx").on(t.deletedAt).where(sql`${t.deletedAt} IS NOT NULL`),
	],
);
