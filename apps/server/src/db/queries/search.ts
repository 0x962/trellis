import type { SearchOutput } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { Tx } from "../tx.ts";
import { tsquery } from "./fts.ts";
import {
	type ProjectSummaryRow,
	projectCtes,
	projectSummaryColumns,
	projectSummaryJoins,
	toProjectSummary,
} from "./projectSummary.ts";
import { rows, textArray } from "./support.ts";
import { type SummaryRow, summaryStatement, toSummary } from "./ticketSummary.ts";

export type SearchInput = { q: string; projectIds?: readonly string[]; limit?: number };

export const SEARCH_LIMIT = 20;

// The search box takes at most 200 ms of database time; a slow query fails
// instead of holding the one connection.
export const SEARCH_TIMEOUT_MS = 200;

// A ticket identifier typed into the box: the key and the number, in any
// letter case.
const identifierPattern = /^([A-Za-z][A-Za-z0-9]{1,9})-([1-9][0-9]*)$/;

const exactTicket = async (tx: Tx, q: string, scope: ReturnType<typeof scopeOf>) => {
	const match = identifierPattern.exec(q.trim());
	if (match === null) return null;
	const found = await rows<{ id: string }>(
		tx,
		sql`SELECT t.id FROM tickets t JOIN projects root ON root.id = t.root_id
			WHERE root.key = ${(match[1] as string).toUpperCase()} AND t.number = ${Number(match[2])} AND ${scope("t")}`,
	);
	return found[0]?.id ?? null;
};

const scopeOf = (projectIds: readonly string[] | undefined) => (alias: string) =>
	projectIds ? sql`${sql.raw(alias)}.project_id = ANY(${textArray(projectIds)})` : sql`true`;

// Full text over tickets and comments (grouped by ticket) ranked by
// ts_rank, plus trigram matches on the title once the text is 3 characters
// or longer: every word of the text must be similar to a word of the title
// (`word <% title` at the threshold migrate sets), ranked by the word
// similarity of the whole text. A ticket found twice keeps its best rank.
// Text hits sort before similarity-only hits: a title or body match at any
// weight beats a fuzzy title.
export const search = async (tx: Tx, input: SearchInput): Promise<SearchOutput> => {
	const limit = input.limit ?? SEARCH_LIMIT;
	const scope = scopeOf(input.projectIds);
	await tx.execute(sql`SET LOCAL statement_timeout = ${sql.raw(String(SEARCH_TIMEOUT_MS))}`);
	const exact = await exactTicket(tx, input.q, scope);
	const q = input.q.trim();
	const words = q.split(/\s+/).map((word) => sql`${word} <% t.title`);
	const trigram =
		q.length >= 3
			? sql`UNION ALL
				SELECT t.id, NULL::real AS rank, word_similarity(${q}, t.title) AS sim
				FROM tickets t WHERE ${sql.join(words, sql` AND `)} AND ${scope("t")}`
			: sql``;
	const page = sql`query AS (SELECT ${tsquery(q)} AS ts), hits AS (
		SELECT t.id, ts_rank(t.search, query.ts) AS rank, NULL::real AS sim
		FROM tickets t, query WHERE t.search @@ query.ts AND ${scope("t")}
		UNION ALL
		SELECT c.ticket_id, max(ts_rank(c.search, query.ts)), NULL::real
		FROM comments c JOIN tickets t ON t.id = c.ticket_id, query
		WHERE c.search @@ query.ts AND ${scope("t")} GROUP BY c.ticket_id
		${trigram}
	), ranked AS (
		SELECT id, row_number() OVER (ORDER BY max(rank) DESC NULLS LAST, max(sim) DESC NULLS LAST, id DESC) AS rn
		FROM hits WHERE id IS DISTINCT FROM ${exact}
		GROUP BY id
		ORDER BY max(rank) DESC NULLS LAST, max(sim) DESC NULLS LAST, id DESC
		LIMIT ${exact === null ? limit : limit - 1}
	), page AS (
		SELECT t.id, 0 AS rn FROM tickets t WHERE t.id = ${exact}
		UNION ALL
		SELECT id, rn FROM ranked
	)`;
	const found = await rows<SummaryRow>(tx, summaryStatement(page, sql``, sql`page.rn`));
	const pattern = `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
	const projects = await rows<ProjectSummaryRow>(
		tx,
		sql`WITH RECURSIVE ${projectCtes}
			SELECT ${projectSummaryColumns} ${projectSummaryJoins}
			WHERE (p.key ILIKE ${pattern} OR p.slug ILIKE ${pattern} OR p.name ILIKE ${pattern})
				AND ${input.projectIds ? sql`p.id = ANY(${textArray(input.projectIds)})` : sql`true`}
			ORDER BY pp.path
			LIMIT ${limit}`,
	);
	return { tickets: found.map(toSummary), projects: projects.map(toProjectSummary) };
};
