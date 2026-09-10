import { createHash } from "node:crypto";
import type { ListOutput, Sort } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import type { Tx } from "../tx.ts";
import {
	categoryRank,
	decodeCursor,
	encodeCursor,
	InvalidCursorError,
	isInt4,
	isIsoTimestamp,
	iso,
	priorityRank,
	rows,
} from "./support.ts";
import { filterKey, filterWhere, type TicketFilter } from "./ticketFilters.ts";
import { type SummaryRow, summaryStatement, toSummary } from "./ticketSummary.ts";

export { InvalidCursorError } from "./support.ts";

export type TicketListInput = TicketFilter & {
	sort?: Sort;
	cursor?: string;
	limit?: number;
};

// One sort field. `exprs` are the expressions the rows order by, `reads`
// how each one reads back into a cursor, and `keys` the cursor value
// types. `tie` says how two rows with equal sort values order by id:
// `desc` always, or `sort` for the direction of the sort itself.
type SortField = { exprs: SQL[]; reads: SQL[]; keys: CursorKey[]; tie: "desc" | "sort" };

// A cursor value: the Postgres type it casts to and the test a value a
// client hands back must pass before it reaches the database. The test
// covers the type and its range, so a value that passes casts without an
// error.
type CursorKey = { cast: string; valid: (value: unknown) => boolean };

const timestamptz: CursorKey = { cast: "timestamptz", valid: isIsoTimestamp };
const int: CursorKey = { cast: "int", valid: isInt4 };
const double: CursorKey = {
	cast: "double precision",
	valid: (value) => typeof value === "number" && Number.isFinite(value),
};

// Every sort breaks ties by id descending, newest first. The position sort
// is the board's order: a board column lists (position, id) ascending and
// `list` with `status=` continues that column past 100 cards, so its
// tiebreak follows the sort direction.
const fields: Record<string, SortField> = {
	updatedAt: { exprs: [sql`t.updated_at`], reads: [iso(sql`t.updated_at`)], keys: [timestamptz], tie: "desc" },
	createdAt: { exprs: [sql`t.created_at`], reads: [iso(sql`t.created_at`)], keys: [timestamptz], tie: "desc" },
	priority: {
		exprs: [priorityRank(sql`t.priority`)],
		reads: [priorityRank(sql`t.priority`)],
		keys: [int],
		tie: "desc",
	},
	number: { exprs: [sql`t.number`], reads: [sql`t.number`], keys: [int], tie: "desc" },
	status: {
		exprs: [categoryRank(sql`s.category`), sql`s.position`],
		reads: [categoryRank(sql`s.category`), sql`s.position`],
		keys: [int, int],
		tie: "desc",
	},
	position: { exprs: [sql`t.position`], reads: [sql`t.position`], keys: [double], tie: "sort" },
};

const idDescending = (field: SortField, descending: boolean) => field.tie === "desc" || descending;

const parseSort = (sort: Sort) => {
	const descending = sort.startsWith("-");
	const field = fields[descending ? sort.slice(1) : sort] as SortField;
	return { field, descending };
};

const CURSOR_VERSION = 1;

const queryHash = (filter: TicketFilter, sort: Sort) =>
	createHash("sha1")
		.update(JSON.stringify([filterKey(filter), sort]))
		.digest("hex")
		.slice(0, 8);

// The cursor is `{v, h, k}`: the version, the hash of filter plus sort, and
// the sort values plus the id of the last row of the page. A cursor is user
// input, so every part is checked before it reaches the database.
const readCursor = (cursor: string, hash: string, field: SortField): unknown[] => {
	let decoded: unknown;
	try {
		decoded = decodeCursor(cursor);
	} catch {
		throw new InvalidCursorError();
	}
	if (decoded === null || typeof decoded !== "object") throw new InvalidCursorError();
	const value = decoded as { v?: unknown; h?: unknown; k?: unknown };
	if (value.v !== CURSOR_VERSION || value.h !== hash) throw new InvalidCursorError();
	const k: unknown[] = Array.isArray(value.k) ? value.k : [];
	if (k.length !== field.keys.length + 1) throw new InvalidCursorError();
	if (typeof k[field.keys.length] !== "string") throw new InvalidCursorError();
	if (field.keys.some((key, i) => !key.valid(k[i]))) throw new InvalidCursorError();
	return k;
};

// Rows after the cursor position: a later sort value, or the same sort
// value and an id past the cursor's in the tiebreak order.
const afterCursor = (field: SortField, descending: boolean, key: unknown[]) => {
	const values = field.keys.map((cursorKey, i) => sql`${key[i]}::${sql.raw(cursorKey.cast)}`);
	const tuple = (parts: SQL[]) => sql`(${sql.join(parts, sql`, `)})`;
	const op = descending ? sql`<` : sql`>`;
	const idOp = idDescending(field, descending) ? sql`<` : sql`>`;
	const id = key[field.exprs.length] as string;
	return sql`(${tuple(field.exprs)} ${op} ${tuple(values)} OR (${tuple(field.exprs)} = ${tuple(values)} AND t.id ${idOp} ${id}))`;
};

const orderBy = (field: SortField, descending: boolean) => {
	const direction = descending ? sql`DESC` : sql`ASC`;
	const keys = field.exprs.map((expr) => sql`${expr} ${direction}`);
	const tie = idDescending(field, descending) ? sql`t.id DESC` : sql`t.id ASC`;
	return sql.join([...keys, tie], sql`, `);
};

// The page of summaries for the flat filter grammar. `limit` is 1 to 200.
// The rows never carry the description or the search column.
export const ticketList = async (tx: Tx, input: TicketListInput): Promise<ListOutput> => {
	const { sort = "-updatedAt", cursor, limit = 50, ...filter } = input;
	const { field, descending } = parseSort(sort);
	const hash = queryHash(filter, sort);
	const start = cursor === undefined ? sql`true` : afterCursor(field, descending, readCursor(cursor, hash, field));
	const reads = field.reads.map((read, i) => sql`${read} AS ${sql.identifier(`k${i}`)}`);
	const page = sql`page AS (
		SELECT t.id, row_number() OVER (ORDER BY ${orderBy(field, descending)}) AS rn, ${sql.join(reads, sql`, `)}
		FROM tickets t JOIN statuses s ON s.id = t.status_id
		WHERE ${filterWhere(filter)} AND ${start}
		ORDER BY ${orderBy(field, descending)}
		LIMIT ${limit + 1}
	)`;
	const keyColumns = field.reads.map((_, i) => sql`page.${sql.identifier(`k${i}`)}`);
	const found = await rows<SummaryRow & Record<`k${number}`, unknown>>(
		tx,
		summaryStatement(page, sql`, ${sql.join(keyColumns, sql`, `)}`, sql`page.rn`),
	);
	const items = found.slice(0, limit);
	const last = items.at(-1);
	const more = found.length > limit && last !== undefined;
	const nextCursor = more
		? encodeCursor({ v: CURSOR_VERSION, h: hash, k: [...field.reads.map((_, i) => last[`k${i}`]), last.id] })
		: null;
	return { items: items.map(toSummary), nextCursor };
};
