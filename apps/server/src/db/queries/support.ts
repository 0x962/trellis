import { type PrioritySchema, type ReviewStateSchema, StatusCategorySchema } from "@trellis/api";
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

// True when the description contains an "Options:" list. Blank lines can
// separate the heading from the first numbered option.
export const questionDescription = (ticket: SQL) =>
	sql`${ticket}.description ~ '(^|\n)[[:blank:]]*Options:[[:space:]]*[0-9]+[.)][[:blank:]]+[^[:space:]]'`;

// True when a ticket asks a question: a human reviewer, and an option list.
export const ticketQuestion = (ticket: SQL, status: SQL) =>
	sql`${status}.reviewer = 'human' AND ${questionDescription(ticket)}`;

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

// ticketPrs.ts sorts linked pull requests with these arrays. The first
// value is the state that needs the most work.
export const CI_WORST_FIRST = ["fail", "pending", "pass", "none"] as const;
export const PR_STATE_WORST_FIRST = ["open", "closed", "merged"] as const;
export const REVIEW_STATE_WORST_FIRST = [
	"changes_requested",
	"review_required",
	"none",
	"approved",
] as const satisfies readonly (typeof ReviewStateSchema.options)[number][];

export const ciRank = (column: SQL) => sql`array_position(${literalArray(CI_WORST_FIRST)}, ${column})`;

export const prStateRank = (column: SQL) => sql`array_position(${literalArray(PR_STATE_WORST_FIRST)}, ${column})`;

export const reviewStateRank = (column: SQL) =>
	sql`array_position(${literalArray(REVIEW_STATE_WORST_FIRST)}, ${column})`;

// The dotted path of every project (`CDE.web.auth`) and its depth. The tree
// has no maximum depth. The schema refuses parent_id = id and nothing else,
// so the CYCLE clause ends the walk when a planted cycle repeats a project.
export const pathsCte = sql`paths AS (
	SELECT id, key AS path, 0 AS depth FROM projects WHERE parent_id IS NULL
	UNION ALL
	SELECT p.id, paths.path || '.' || p.slug, paths.depth + 1
	FROM projects p JOIN paths ON p.parent_id = paths.id
) CYCLE id SET is_cycle USING cycle_path`;

export const rows = async <T>(tx: Tx, query: SQL) => {
	const result = await tx.execute(query);
	return result.rows as T[];
};

// A base64url JSON cursor. A cursor a client hands back is user input, so
// the caller checks what it decodes and throws InvalidCursorError on any
// part that is not the shape and range it wrote.
export const encodeCursor = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

export const decodeCursor = (cursor: string): unknown => JSON.parse(Buffer.from(cursor, "base64url").toString());

// A cursor that belongs to another filter, another sort, another cursor
// version, or no query at all.
export class InvalidCursorError extends Error {
	constructor() {
		super("The cursor does not belong to this query.");
		this.name = "InvalidCursorError";
	}
}

// The timestamp form `iso` writes: a four-digit year from 0001, a real
// calendar day, milliseconds, and Z. Postgres has no year 0000. Postgres
// rejects a day that does not exist. JavaScript rolls such a day into the
// next month, so the round trip through Date catches it.
const isoTimestamp = /^(\d{4})-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const isIsoTimestamp = (value: unknown): value is string => {
	if (typeof value !== "string") return false;
	const match = isoTimestamp.exec(value);
	if (match === null || match[1] === "0000") return false;
	const time = Date.parse(value);
	return Number.isFinite(time) && new Date(time).toISOString() === value;
};

// A value the Postgres `int` (int4) column type holds.
export const isInt4 = (value: unknown): value is number =>
	Number.isInteger(value) && (value as number) >= -(2 ** 31) && (value as number) <= 2 ** 31 - 1;
