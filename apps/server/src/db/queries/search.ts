import type { SearchOutput } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Db } from "../client.ts";
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
export type SearchRankInput = SearchInput & { rankProjectIds?: readonly string[] };

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

// `ids` is a text[] value of project ids. Without it, every project is in
// scope.
const scopeIn =
	(ids: SQL | undefined): Scope =>
	(alias) =>
		ids === undefined ? sql`true` : sql`${sql.raw(alias)}.project_id = ANY(${ids})`;

// The text search hits: tickets by the `search` column, ranked by ts_rank.
const textHits = (scope: Scope) => sql`
	SELECT t.id, ts_rank(t.search, query.ts) AS rank
	FROM tickets t, query WHERE t.search @@ query.ts AND ${scope("t")}`;

type IdentifierArgs = { key: SQL; number: SQL; q: SQL; limit: SQL; scope: Scope };

// A KEY-n text: the exact ticket first, then the text hits for the same
// text. The exact lookup and the text search are one statement. A KEY-n
// text holds a hyphen, and tsquery() sends every text with a hyphen in its
// last word through websearch_to_tsquery, so the statement calls it
// directly.
const identifierPage = ({ key, number, q, limit, scope }: IdentifierArgs) => sql`
	exact AS (
		SELECT t.id FROM tickets t JOIN projects root ON root.id = t.root_id
		WHERE root.key = ${key} AND t.number = ${number} AND ${scope("t")}
	), query AS (SELECT websearch_to_tsquery('english', ${q}) AS ts), hits AS (${textHits(scope)}), ranked AS (
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

// A KEY-n search must answer in 3 ms. Postgres plans a statement again on
// every call, and the plan of the KEY-n statement costs more time than its
// run. Postgres keeps the plan of a statement inside a PL/pgSQL function
// for the session, so the KEY-n statement lives in a session function. The
// SET clause gives the statements of that function a generic plan, which
// does not depend on the values, so Postgres plans the statement once per
// session. The same setting for the whole session would also give every
// other statement a generic plan, and a generic plan cannot use the value of
// a parameter to choose an index.
const identifierFunction = (narrowed: boolean) => (narrowed ? "search_identifier_in" : "search_identifier");

// The row type that both functions return: the summary columns of a page.
const SEARCH_ROW = "search_row";

// Creates the row type and the two KEY-n functions for this session. They
// are temporary objects, so every PGlite instance creates its own after its
// migrations. The functions take the key, the number, the text, and the
// limit, and the narrowed function also takes the project ids as a text[].
export const prepareSearch = async (db: Db) => {
	const dialect = new PgDialect();
	const emptyPage = sql`page AS (SELECT NULL::text AS id, 0::bigint AS rn WHERE false)`;
	await db.execute(
		sql`CREATE OR REPLACE TEMP VIEW ${sql.raw(SEARCH_ROW)} AS ${summaryStatement(emptyPage, sql``, sql`page.rn`)}`,
	);
	for (const narrowed of [false, true]) {
		const page = identifierPage({
			key: sql.raw("$1"),
			number: sql.raw("$2"),
			q: sql.raw("$3"),
			limit: sql.raw("$4"),
			scope: scopeIn(narrowed ? sql.raw("$5") : undefined),
		});
		const body = dialect.sqlToQuery(summaryStatement(page, sql``, sql`page.rn`)).sql;
		const args = narrowed ? "text, int, text, int, text[]" : "text, int, text, int";
		await db.execute(
			sql.raw(`CREATE OR REPLACE FUNCTION pg_temp.${identifierFunction(narrowed)}(${args})
				RETURNS SETOF ${SEARCH_ROW} LANGUAGE plpgsql SET plan_cache_mode = force_generic_plan
				AS $body$ BEGIN RETURN QUERY ${body}; END $body$`),
		);
	}
};

// Every other text. A ticket matches only through full-text search: complete
// words, and a prefix on the last word while the person types.
const textPage = (q: string, scope: Scope, limit: number, rankIds: SQL | undefined) => {
	const order =
		rankIds === undefined
			? sql`g.rank DESC, g.id DESC`
			: sql`CASE WHEN t.project_id = ANY(${rankIds}) THEN 0 ELSE 1 END, g.rank DESC, g.id DESC`;
	return sql`
	query AS (SELECT ${tsquery(q)} AS ts), hits AS (${textHits(scope)}), grouped AS (
		SELECT id, max(rank) AS rank FROM hits GROUP BY id
	), page AS (
		SELECT g.id, row_number() OVER (
			ORDER BY ${order}
		) AS rn
		FROM grouped g JOIN tickets t ON t.id = g.id
		ORDER BY ${order}
		LIMIT ${limit}
	)`;
};

const searchWords = (q: string) => q.trim().split(/\s+/).filter(Boolean);

const regexQuote = (value: string) => value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");

const wordPrefixPattern = (word: string) => `(^|[^[:alnum:]])${regexQuote(word)}[[:alnum:]]*`;

const projectsMatching = async (tx: Tx, q: string, projectIds: readonly string[] | undefined, limit: number) => {
	const words = searchWords(q).map(wordPrefixPattern);
	const matches = (column: SQL) =>
		sql.join(
			words.map((word) => sql`${column} ~* ${word}`),
			sql` AND `,
		);
	const found = await rows<ProjectSummaryRow>(
		tx,
		sql`WITH RECURSIVE ${projectCtes}
			SELECT ${projectSummaryColumns} ${projectSummaryJoins}
			WHERE ((${matches(sql`p.key`)}) OR (${matches(sql`p.slug`)}) OR (${matches(sql`p.name`)}))
				AND ${projectIds ? sql`p.id = ANY(${textArray(projectIds)})` : sql`true`}
			ORDER BY pp.path
			LIMIT ${limit}`,
	);
	return found.map(toProjectSummary);
};

// Tickets and projects for the text of the search box. A ticket found twice
// keeps its best rank. A KEY-n text names one ticket, so its answer holds no
// projects.
export const search = async (tx: Tx, input: SearchRankInput): Promise<SearchOutput> => {
	const limit = input.limit ?? SEARCH_LIMIT;
	const ids = input.projectIds === undefined ? undefined : textArray(input.projectIds);
	const rankIds = input.rankProjectIds === undefined ? undefined : textArray(input.rankProjectIds);
	const narrowed = ids !== undefined;
	const q = input.q.trim();
	if (q === "") return { tickets: [], projects: [] };
	await tx.execute(sql`SET LOCAL statement_timeout = ${sql.raw(String(SEARCH_TIMEOUT_MS))}`);
	const id = identifierOf(q);
	if (id !== null) {
		const scope = narrowed ? sql`, ${ids}` : sql``;
		const found = await rows<SummaryRow>(
			tx,
			sql`SELECT * FROM pg_temp.${sql.raw(identifierFunction(narrowed))}(${id.key}, ${id.number}, ${q}, ${limit}${scope})`,
		);
		return { tickets: found.map(toSummary), projects: [] };
	}
	const page = textPage(q, scopeIn(ids), limit, rankIds);
	const found = await rows<SummaryRow>(tx, summaryStatement(page, sql``, sql`page.rn`));
	return { tickets: found.map(toSummary), projects: await projectsMatching(tx, q, input.projectIds, limit) };
};
