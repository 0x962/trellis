import { sql } from "drizzle-orm";
import { bigint, check, foreignKey, index, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { pageVersions } from "./pageVersions.ts";

export const pageAssets = pgTable(
	"page_assets",
	{
		pageId: text("page_id").notNull(),
		version: integer().notNull(),
		path: text().notNull(),
		sha256: text().notNull(),
		size: bigint({ mode: "number" }).notNull(),
		mime: text().notNull(),
	},
	(t) => [
		primaryKey({ name: "page_assets_pkey", columns: [t.pageId, t.version, t.path] }),
		foreignKey({
			name: "page_assets_version_fk",
			columns: [t.pageId, t.version],
			foreignColumns: [pageVersions.pageId, pageVersions.number],
		}).onDelete("cascade"),
		check(
			"page_assets_path_check",
			sql`octet_length(${t.path}) BETWEEN 1 AND 1024
				AND left(${t.path}, 1) <> '/'
				AND ${t.path} !~* '^[a-z]:/'
				AND position(E'\\\\' IN ${t.path}) = 0
				AND position('//' IN ${t.path}) = 0
				AND right(${t.path}, 1) <> '/'
				AND ${t.path} !~ '(^|/)\\.\\.?(/|$)'
				AND ${t.path} !~ '[[:cntrl:]]'
				AND lower(${t.path}) <> 'index.html'
				AND lower(${t.path}) <> '.trellis'
				AND lower(${t.path}) NOT LIKE '.trellis/%'`,
		),
		check("page_assets_sha256_check", sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
		check("page_assets_size_check", sql`${t.size} >= 0 AND ${t.size} <= 104857600`),
		check("page_assets_mime_check", sql`length(${t.mime}) BETWEEN 1 AND 255 AND ${t.mime} !~ '[[:cntrl:]]'`),
		index("page_assets_sha256_idx").on(t.sha256),
	],
);
