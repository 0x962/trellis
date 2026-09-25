import type { PageSummary } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { tsquery } from "../../db/queries/fts.ts";
import { rows, textArray } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { pageSelect, type RawPage, toSummary } from "./rows.ts";

export type PageSearchInput = {
	q: string;
	projectIds?: readonly string[];
	rankProjectIds?: readonly string[];
	limit: number;
};

const scopeOf = (ids: SQL | undefined) => (ids === undefined ? sql`true` : sql`p.project_id = ANY(${ids})`);

const searchVector = (value: SQL) => sql`to_tsvector('english', ${value})`;

export const pageSearchStatement = (ctx: ServiceCtx, input: PageSearchInput): SQL => {
	const query = tsquery(input.q.trim());
	const projectIds = input.projectIds === undefined ? undefined : textArray(input.projectIds);
	const rankProjectIds = input.rankProjectIds === undefined ? undefined : textArray(input.rankProjectIds);
	const projectOrder =
		rankProjectIds === undefined ? sql`` : sql`CASE WHEN p.project_id = ANY(${rankProjectIds}) THEN 0 ELSE 1 END,`;
	return sql`WITH query AS (SELECT ${query} AS ts), hits AS (
			SELECT p.id, 3 AS search_rank, ts_rank(${searchVector(sql`p.title`)}, query.ts) AS search_score
			FROM pages p CROSS JOIN query
			WHERE p.deleted_at IS NULL AND ${scopeOf(projectIds)} AND ${searchVector(sql`p.title`)} @@ query.ts
			UNION ALL
			SELECT p.id, 2 AS search_rank, ts_rank(${searchVector(sql`p.summary`)}, query.ts) AS search_score
			FROM pages p CROSS JOIN query
			WHERE p.deleted_at IS NULL AND ${scopeOf(projectIds)} AND ${searchVector(sql`p.summary`)} @@ query.ts
			UNION ALL
			SELECT p.id, 1 AS search_rank, ts_rank(${searchVector(sql`latest.search_text`)}, query.ts) AS search_score
			FROM pages p
			JOIN page_versions latest ON latest.page_id = p.id AND latest.number = p.latest_version
			CROSS JOIN query
			WHERE p.deleted_at IS NULL AND ${scopeOf(projectIds)} AND ${searchVector(sql`latest.search_text`)} @@ query.ts
		), ranked AS (
			SELECT DISTINCT ON (id) id, search_rank, search_score
			FROM hits ORDER BY id, search_rank DESC, search_score DESC
		)
		${pageSelect(ctx, sql`ranked.search_rank`)}
		JOIN ranked ON ranked.id = p.id
		ORDER BY ${projectOrder} ranked.search_rank DESC, ranked.search_score DESC,
			latest.created_at DESC, p.id DESC
		LIMIT ${input.limit}`;
};

export const searchPages = async (ctx: ServiceCtx, tx: Tx, input: PageSearchInput): Promise<PageSummary[]> => {
	const q = input.q.trim();
	if (q === "") return [];
	const found = await rows<RawPage>(tx, pageSearchStatement(ctx, { ...input, q }));
	return found.map(toSummary);
};
