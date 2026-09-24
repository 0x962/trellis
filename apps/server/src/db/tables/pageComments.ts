import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { actorColumns, actorFk, actors, at } from "./actors.ts";
import { pageVersions } from "./pageVersions.ts";

export const pageCommentThreads = pgTable(
	"page_comment_threads",
	{
		id: text().primaryKey(),
		pageId: text("page_id").notNull(),
		version: integer().notNull(),
		anchorKind: text("anchor_kind").notNull(),
		anchor: jsonb().notNull(),
		selectedText: text("selected_text"),
		...actorColumns(),
		resolvedAt: at("resolved_at"),
		resolvedByName: text("resolved_by_name"),
		resolvedByKind: text("resolved_by_kind"),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		foreignKey({
			name: "page_comment_threads_version_fk",
			columns: [t.pageId, t.version],
			foreignColumns: [pageVersions.pageId, pageVersions.number],
		}).onDelete("cascade"),
		actorFk("page_comment_threads_actor_fk", t),
		foreignKey({
			name: "page_comment_threads_resolved_by_fk",
			columns: [t.resolvedByName, t.resolvedByKind],
			foreignColumns: [actors.name, actors.kind],
		}),
		check("page_comment_threads_anchor_kind_check", sql`${t.anchorKind} IN ('element', 'text')`),
		check(
			"page_comment_threads_anchor_check",
			sql`jsonb_typeof(${t.anchor}) = 'object'
				AND ${t.anchor}->>'kind' IS NOT NULL
				AND ${t.anchor}->>'kind' = ${t.anchorKind}
				AND octet_length(${t.anchor}::text) <= 16384`,
		),
		check(
			"page_comment_threads_selected_text_check",
			sql`(${t.anchorKind} = 'element' AND ${t.selectedText} IS NULL)
				OR (${t.anchorKind} = 'text' AND ${t.selectedText} IS NOT NULL
					AND length(${t.selectedText}) BETWEEN 1 AND 2000)`,
		),
		check(
			"page_comment_threads_resolved_check",
			sql`(${t.resolvedAt} IS NULL) = (${t.resolvedByName} IS NULL)
				AND (${t.resolvedAt} IS NULL) = (${t.resolvedByKind} IS NULL)`,
		),
		index("page_comment_threads_page_version_created_idx").on(t.pageId, t.version, t.createdAt, t.id),
		index("page_comment_threads_open_idx").on(t.pageId, t.createdAt, t.id).where(sql`${t.resolvedAt} IS NULL`),
	],
);

export const pageComments = pgTable(
	"page_comments",
	{
		id: text().primaryKey(),
		threadId: text("thread_id")
			.notNull()
			.references(() => pageCommentThreads.id, { onDelete: "cascade" }),
		body: text().notNull(),
		...actorColumns(),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
		deletedAt: at("deleted_at"),
	},
	(t) => [
		actorFk("page_comments_actor_fk", t),
		check("page_comments_body_check", sql`length(${t.body}) BETWEEN 1 AND 10000`),
		index("page_comments_thread_created_idx").on(t.threadId, t.createdAt, t.id),
	],
);
