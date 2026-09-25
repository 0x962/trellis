import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, pgTable, primaryKey, text, unique } from "drizzle-orm/pg-core";
import { actorColumns, actorFk, at } from "./actors.ts";
import { agentRuns } from "./agentRuns.ts";
import { pages } from "./pages.ts";

// Migration 0120 holds the GIN index for the text search vector because
// drizzle-kit cannot render an expression index.
export const pageVersions = pgTable(
	"page_versions",
	{
		pageId: text("page_id")
			.notNull()
			.references(() => pages.id, { onDelete: "cascade" }),
		number: integer().notNull(),
		requestId: text("request_id").notNull(),
		label: text(),
		documentSha256: text("document_sha256").notNull(),
		documentSize: bigint("document_size", { mode: "number" }).notNull(),
		searchText: text("search_text").notNull().default(""),
		searchIndexed: boolean("search_indexed").notNull().default(false),
		sourceAgentId: text("source_agent_id").references(() => agentRuns.id, { onDelete: "set null" }),
		sourcePath: text("source_path").notNull(),
		...actorColumns(),
		createdAt: at("created_at").notNull(),
	},
	(t) => [
		primaryKey({ name: "page_versions_pkey", columns: [t.pageId, t.number] }),
		unique("page_versions_request_id_unique").on(t.requestId),
		actorFk("page_versions_actor_fk", t),
		check("page_versions_number_check", sql`${t.number} > 0`),
		check("page_versions_label_check", sql`${t.label} IS NULL OR length(${t.label}) BETWEEN 1 AND 200`),
		check("page_versions_document_sha256_check", sql`${t.documentSha256} ~ '^[0-9a-f]{64}$'`),
		check("page_versions_document_size_check", sql`${t.documentSize} > 0 AND ${t.documentSize} <= 16777216`),
		check("page_versions_search_text_check", sql`octet_length(${t.searchText}) <= 1048576`),
		check(
			"page_versions_source_path_check",
			sql`length(${t.sourcePath}) BETWEEN 1 AND 4096
				AND left(${t.sourcePath}, 1) <> '/'
				AND ${t.sourcePath} !~* '^[a-z]:/'
				AND position(E'\\\\' IN ${t.sourcePath}) = 0
				AND position('//' IN ${t.sourcePath}) = 0
				AND right(${t.sourcePath}, 1) <> '/'
				AND ${t.sourcePath} !~ '(^|/)\\.\\.?(/|$)'
				AND ${t.sourcePath} !~ '[[:cntrl:]]'`,
		),
		index("page_versions_document_sha256_idx").on(t.documentSha256),
		index("page_versions_source_agent_id_idx").on(t.sourceAgentId),
		index("page_versions_actor_created_at_idx").on(t.actorKind, t.actorName, t.createdAt.desc().nullsFirst()),
	],
);
