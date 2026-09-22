import { sql } from "drizzle-orm";
import { type AnyPgColumn, boolean, check, foreignKey, index, pgTable, text } from "drizzle-orm/pg-core";
import { actorColumns, actorFk, actors, at } from "./actors.ts";
import { epicResources } from "./epicResources.ts";

// One row is one comment on a document resource. The comments of one thread
// share `thread_id`, and the first comment of a thread has `id = thread_id`.
// That first row alone holds the thread fields: the anchor, `text_removed`
// and the resolve columns. A delete of the first row deletes the thread.
//
// The anchor is the commented text (`quote`) with up to 32 characters of the
// text before it (`prefix`) and after it (`suffix`). The document markdown
// holds no trace of a comment, so an agent reads clean markdown. The editor
// finds the anchor in the document by its text, and it writes the anchor
// again when an edit moves or changes that text. `text_removed` is true when
// an edit deleted the whole commented text.
export const resourceComments = pgTable(
	"resource_comments",
	{
		id: text().primaryKey(),
		resourceId: text("resource_id")
			.notNull()
			.references(() => epicResources.id, { onDelete: "cascade" }),
		threadId: text("thread_id")
			.notNull()
			.references((): AnyPgColumn => resourceComments.id, { onDelete: "cascade" }),
		body: text().notNull(),
		quote: text(),
		prefix: text(),
		suffix: text(),
		textRemoved: boolean("text_removed").notNull().default(false),
		resolvedAt: at("resolved_at"),
		resolvedByName: text("resolved_by_name"),
		resolvedByKind: text("resolved_by_kind"),
		...actorColumns(),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		actorFk("resource_comments_actor_fk", t),
		foreignKey({
			name: "resource_comments_resolved_by_fk",
			columns: [t.resolvedByName, t.resolvedByKind],
			foreignColumns: [actors.name, actors.kind],
		}),
		check("resource_comments_body_check", sql`length(${t.body}) BETWEEN 1 AND 10000`),
		check(
			"resource_comments_thread_check",
			sql`(${t.id} = ${t.threadId} AND ${t.quote} IS NOT NULL AND ${t.prefix} IS NOT NULL AND ${t.suffix} IS NOT NULL)
				OR (${t.id} <> ${t.threadId} AND ${t.quote} IS NULL AND ${t.prefix} IS NULL AND ${t.suffix} IS NULL
					AND NOT ${t.textRemoved} AND ${t.resolvedAt} IS NULL)`,
		),
		check(
			"resource_comments_anchor_check",
			sql`${t.quote} IS NULL OR (length(${t.quote}) BETWEEN 1 AND 2000 AND length(${t.prefix}) <= 32 AND length(${t.suffix}) <= 32)`,
		),
		check(
			"resource_comments_resolved_check",
			sql`(${t.resolvedAt} IS NULL) = (${t.resolvedByName} IS NULL) AND (${t.resolvedAt} IS NULL) = (${t.resolvedByKind} IS NULL)`,
		),
		index("resource_comments_resource_id_idx").on(t.resourceId, t.createdAt),
		index("resource_comments_thread_id_idx").on(t.threadId),
	],
);
