import type { SearchOutput } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import { WORD_SIMILARITY_THRESHOLD } from "../migrate.ts";
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
// letter case. tickets.number is a Postgres integer, so a larger number
// names no ticket and the text goes through the text search path.
const identifierPattern = /^([A-Za-z][A-Za-z0-9]{1,9})-([1-9][0-9]*)$/;
const MAX_NUMBER = 2 ** 31 - 1;

const identifierOf = (q: string) => {
	const match = identifierPattern.exec(q);
	if (match === null || Number(match[2]) > MAX_NUMBER) return null;
	return { key: (match[1] as string).toUpperCase(), number: Number(match[2]) };
};

type Scope = (alias: string) => SQL;

const scopeOf =
	(projectIds: readonly string[] | undefined): Scope =>
	(alias) =>
		projectIds ? sql`${sql.raw(alias)}.project_id = ANY(${textArray(projectIds)})` : sql`true`;

// The text search hits: tickets by the `search` column and comments grouped
// by ticket, each ranked by ts_rank. `sim` is the column list a ticket row
// adds after its rank. A comment reads its ticket only to test the scope.
const textHits = (scope: Scope, narrowed: boolean, sim: SQL) => sql`
	SELECT t.id, ts_rank(t.search, query.ts) AS rank, ${sim}, true AS own
	FROM tickets t, query WHERE t.search @@ query.ts AND ${scope("t")}
	UNION ALL
	SELECT c.ticket_id, max(ts_rank(c.search, query.ts)), NULL::real, false
	FROM comments c ${narrowed ? sql`JOIN tickets t ON t.id = c.ticket_id` : sql``}, query
	WHERE c.search @@ query.ts AND ${scope("t")} GROUP BY c.ticket_id`;

// The similarity of the text to the title `t.title`: the word similarity of
// the whole text when every word passes `word <% title`, and NULL otherwise.
// word_similarity is the costly part of a search, so a one-word text computes
// it once and compares it with the threshold, which is what `<%` does. OFFSET
// 0 keeps the planner from copying the call into each place that reads it.
const similarityOf = (q: string, words: string[]) => {
	if (q.length < 3) return sql`NULL::real`;
	if (words.length === 1) {
		return sql`(SELECT CASE WHEN ws.s >= ${sql.raw(String(WORD_SIMILARITY_THRESHOLD))}::float8 THEN ws.s END
			FROM (SELECT word_similarity(${q}, t.title) AS s OFFSET 0) ws)`;
	}
	const tests = words.map((word) => sql`${word} <% t.title`);
	return sql`CASE WHEN ${sql.join(tests, sql` AND `)} THEN word_similarity(${q}, t.title) END`;
};

// A KEY-n text: the exact ticket first, then the text hits for the same
// text. The exact lookup and the text search are one statement.
const identifierPage = (
	q: string,
	id: { key: string; number: number },
	scope: Scope,
	narrowed: boolean,
	limit: number,
) => sql`
	exact AS (
		SELECT t.id FROM tickets t JOIN projects root ON root.id = t.root_id
		WHERE root.key = ${id.key} AND t.number = ${id.number} AND ${scope("t")}
	), query AS (SELECT ${tsquery(q)} AS ts), hits AS (${textHits(scope, narrowed, sql`NULL::real AS sim`)}), ranked AS (
		SELECT id, row_number() OVER (ORDER BY max(rank) DESC, id DESC) AS rn
		FROM hits WHERE id NOT IN (SELECT id FROM exact)
		GROUP BY id
		ORDER BY max(rank) DESC, id DESC
		LIMIT ${limit} - (SELECT count(*) FROM exact)
	), page AS (
		SELECT id, 0 AS rn FROM exact
		UNION ALL
		SELECT id, rn FROM ranked
	)`;

// Every other text. A ticket matches the trigram path when every word of
// the text is similar to a word of the title (`word <% title` at the
// threshold migrate sets); `sim` is then the word similarity of the whole
// text, and NULL otherwise. Text hits sort before similarity-only hits,
// then by rank, then by similarity, then by id.
//
// The order decides which rows the statement reads:
// - A text hit is on the ticket row already, so its similarity costs no read.
// - A ticket found by its comments alone reads its title only when its rank
//   ties or beats the rank at position `limit`. A lower rank never reaches
//   the page.
// - The trigram index runs only when the text hits fill less than the page.
//   Otherwise every similarity-only hit sorts after the page.
const textPage = (q: string, scope: Scope, narrowed: boolean, limit: number) => {
	const split = q.split(/\s+/);
	const words = split.map((word) => sql`${word} <% t.title`);
	const similarity = similarityOf(q, split);
	const trigramHits =
		q.length >= 3
			? sql`UNION ALL
			SELECT t.id, NULL::real, word_similarity(${q}, t.title)
			FROM tickets t
			WHERE (SELECT count(*) FROM grouped) < ${limit} AND ${sql.join(words, sql` AND `)} AND ${scope("t")}
				AND t.id NOT IN (SELECT id FROM grouped)`
			: sql``;
	return sql`query AS (SELECT ${tsquery(q)} AS ts), hits AS (${textHits(scope, narrowed, sql`${similarity} AS sim`)}), grouped AS (
		SELECT id, max(rank) AS rank, max(sim) AS sim, bool_or(own) AS own FROM hits GROUP BY id
	), cutoff AS (
		SELECT rank FROM grouped ORDER BY rank DESC LIMIT 1 OFFSET ${limit - 1}
	), candidates AS (
		SELECT g.id, g.rank, g.sim FROM grouped g WHERE g.own AND g.rank >= coalesce((SELECT rank FROM cutoff), 0)
		UNION ALL
		SELECT g.id, g.rank, ${similarity}
		FROM grouped g JOIN tickets t ON t.id = g.id
		WHERE NOT g.own AND g.rank >= coalesce((SELECT rank FROM cutoff), 0)
		${trigramHits}
	), page AS (
		SELECT id, row_number() OVER (ORDER BY rank DESC NULLS LAST, sim DESC NULLS LAST, id DESC) AS rn
		FROM candidates
		ORDER BY rank DESC NULLS LAST, sim DESC NULLS LAST, id DESC
		LIMIT ${limit}
	)`;
};

const projectsMatching = async (tx: Tx, q: string, projectIds: readonly string[] | undefined, limit: number) => {
	const pattern = `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
	const found = await rows<ProjectSummaryRow>(
		tx,
		sql`WITH RECURSIVE ${projectCtes}
			SELECT ${projectSummaryColumns} ${projectSummaryJoins}
			WHERE (p.key ILIKE ${pattern} OR p.slug ILIKE ${pattern} OR p.name ILIKE ${pattern})
				AND ${projectIds ? sql`p.id = ANY(${textArray(projectIds)})` : sql`true`}
			ORDER BY pp.path
			LIMIT ${limit}`,
	);
	return found.map(toProjectSummary);
};

// Tickets and projects for the text of the search box. A ticket found
// twice keeps its best rank. A KEY-n text names one ticket, so its answer
// holds no projects and no trigram hits.
export const search = async (tx: Tx, input: SearchInput): Promise<SearchOutput> => {
	const limit = input.limit ?? SEARCH_LIMIT;
	const scope = scopeOf(input.projectIds);
	const q = input.q.trim();
	await tx.execute(sql`SET LOCAL statement_timeout = ${sql.raw(String(SEARCH_TIMEOUT_MS))}`);
	const id = identifierOf(q);
	const narrowed = input.projectIds !== undefined;
	const page = id === null ? textPage(q, scope, narrowed, limit) : identifierPage(q, id, scope, narrowed, limit);
	const found = await rows<SummaryRow>(tx, summaryStatement(page, sql``, sql`page.rn`));
	const tickets = found.map(toSummary);
	if (id !== null) return { tickets, projects: [] };
	return { tickets, projects: await projectsMatching(tx, q, input.projectIds, limit) };
};
