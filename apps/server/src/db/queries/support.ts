import { type PrioritySchema, StatusCategorySchema } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import type { Tx } from "../tx.ts";

// A timestamp leaves the database as the ISO string a client parses:
// UTC, milliseconds, and a trailing Z. The driver hands a timestamptz back
// as Postgres text, which carries the session time zone instead.
export const iso = (column: SQL) => sql`to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// A list of strings as one bound text[] parameter. The sql tag expands a
// raw array into a comma list, which `= ANY` cannot take.
export const textArray = (values: readonly string[]) => sql`${sql.param([...values])}::text[]`;

// A closed set as an inline array literal, for `array_position` ranks. The
// values come from the api enums, which hold no quote characters.
const literalArray = (values: readonly string[]) =>
	sql.raw(`ARRAY[${values.map((value) => `'${value}'`).join(", ")}]::text[]`);

// Category rank in workflow order: todo, started, review, done, canceled.
export const categoryRank = (column: SQL) =>
	sql`array_position(${literalArray(StatusCategorySchema.options)}, ${column})`;

// Priority rank from most to least urgent; `none` sorts last.
export const PRIORITY_ORDER = [
	"urgent",
	"high",
	"medium",
	"low",
	"none",
] as const satisfies readonly (typeof PrioritySchema.options)[number][];

export const priorityRank = (column: SQL) => sql`array_position(${literalArray(PRIORITY_ORDER)}, ${column})`;

// The worst CI state across a set of pull requests is the one with the
// highest rank; the worst pull request state is the one that still needs
// work.
export const CI_WORST_FIRST = ["fail", "pending", "pass", "none"] as const;
export const PR_STATE_WORST_FIRST = ["open", "closed", "merged"] as const;

export const ciRank = (column: SQL) => sql`array_position(${literalArray(CI_WORST_FIRST)}, ${column})`;

export const prStateRank = (column: SQL) => sql`array_position(${literalArray(PR_STATE_WORST_FIRST)}, ${column})`;

// The dotted path of every project (`CDE.web.auth`) and its depth. The
// walk stops at depth 64, so a planted parent cycle ends the query.
export const pathsCte = sql`paths AS (
	SELECT id, key AS path, 0 AS depth FROM projects WHERE parent_id IS NULL
	UNION ALL
	SELECT p.id, paths.path || '.' || p.slug, paths.depth + 1
	FROM projects p JOIN paths ON p.parent_id = paths.id
	WHERE paths.depth < 64
)`;

export const rows = async <T>(tx: Tx, query: SQL) => {
	const result = await tx.execute(query);
	return result.rows as T[];
};

// A base64url JSON cursor. A cursor a client hands back is user input, so
// the caller checks what it decodes.
export const encodeCursor = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

export const decodeCursor = (cursor: string): unknown => JSON.parse(Buffer.from(cursor, "base64url").toString());
