import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text } from "drizzle-orm/pg-core";
import { actorColumns, actorFk, at } from "./actors.ts";
import { projects } from "./projects.ts";

export const pageUploads = pgTable(
	"page_uploads",
	{
		id: text().primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		sha256: text().notNull(),
		size: bigint({ mode: "number" }).notNull(),
		mime: text().notNull(),
		originalName: text("original_name").notNull(),
		...actorColumns(),
		createdAt: at("created_at").notNull(),
		expiresAt: at("expires_at").notNull(),
	},
	(t) => [
		actorFk("page_uploads_actor_fk", t),
		check("page_uploads_sha256_check", sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
		check("page_uploads_size_check", sql`${t.size} >= 0 AND ${t.size} <= 104857600`),
		check("page_uploads_mime_check", sql`length(${t.mime}) BETWEEN 1 AND 255 AND ${t.mime} !~ '[[:cntrl:]]'`),
		check(
			"page_uploads_original_name_check",
			sql`length(${t.originalName}) BETWEEN 1 AND 255
				AND position('/' IN ${t.originalName}) = 0
				AND position(E'\\\\' IN ${t.originalName}) = 0
				AND ${t.originalName} !~ '[[:cntrl:]]'`,
		),
		check("page_uploads_expiry_check", sql`${t.expiresAt} > ${t.createdAt}`),
		index("page_uploads_project_actor_idx").on(t.projectId, t.actorKind, t.actorName, t.createdAt),
		index("page_uploads_sha256_idx").on(t.sha256),
		index("page_uploads_expires_at_idx").on(t.expiresAt),
	],
);
