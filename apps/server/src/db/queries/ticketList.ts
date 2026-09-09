import { createHash } from "node:crypto";
import type { ListOutput, Sort } from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import type { Tx } from "../tx.ts";
import { categoryRank, decodeCursor, encodeCursor, iso, priorityRank, rows } from "./support.ts";
import { filterKey, filterWhere, type TicketFilter } from "./ticketFilters.ts";
import { type SummaryRow, summaryStatement, toSummary } from "./ticketSummary.ts";

export type TicketListInput = TicketFilter & {
	sort?: Sort;
	cursor?: string;
	limit?: number;
};

// A cursor that belongs to another filter, another sort, another cursor
// version, or no query at all.
export class InvalidCursorError extends Error {
	constructor() {
		super("The cursor does not belong to this query.");
		this.name = "InvalidCursorError";
	}
}

// One sort field: the expressions the rows order by, how each one reads
// back into a cursor, and the Postgres type a cursor value casts to.
type SortField = { exprs: SQL[]; reads: SQL[]; casts: string[] };

const fields: Record<string, SortField> = {
	updatedAt: { exprs: [sql`t.updated_at`], reads: [iso(sql`t.updated_at`)], casts: ["timestamptz"] },
	createdAt: { exprs: [sql`t.created_at`], reads: [iso(sql`t.created_at`)], casts: ["timestamptz"] },
	priority: { exprs: [priorityRank(sql`t.priority`)], reads: [priorityRank(sql`t.priority`)], casts: ["int"] },
	number: { exprs: [sql`t.number`], reads: [sql`t.number`], casts: ["int"] },
	status: {
		exprs: [categoryRank(sql`s.category`), sql`s.position`],
		reads: [categoryRank(sql`s.category`), sql`s.position`],
		casts: ["int", "int"],
	},
	position: { exprs: [sql`t.position`], reads: [sql`t.position`], casts: ["double precision"] },
};

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
// the sort values plus the id of the last row of the page.
const readCursor = (cursor: string, hash: string, keyLength: number): unknown[] => {
	let decoded: unknown;
	try {
		decoded = decodeCursor(cursor);
	} catch {
		throw new InvalidCursorError();
	}
	const value = decoded as { v?: unknown; h?: unknown; k?: unknown };
	if (value.v !== CURSOR_VERSION || value.h !== hash) throw new InvalidCursorError();
	if (!Array.isArray(value.k) || value.k.length !== keyLength) throw new InvalidCursorError();
	return value.k;
};

// Rows after the cursor position: a later sort value, or the same sort
// value and a smaller id, because every sort breaks ties by id descending.
const afterCursor = (field: SortField, descending: boolean, key: unknown[]) => {
	const values = field.exprs.map((_, i) => sql`${key[i]}::${sql.raw(field.casts[i] as string)}`);
	const tuple = (parts: SQL[]) => sql`(${sql.join(parts, sql`, `)})`;
	const op = descending ? sql`<` : sql`>`;
	const id = key[field.exprs.length] as string;
	return sql`(${tuple(field.exprs)} ${op} ${tuple(values)} OR (${tuple(field.exprs)} = ${tuple(values)} AND t.id < ${id}))`;
};

const orderBy = (field: SortField, descending: boolean) => {
	const direction = descending ? sql`DESC` : sql`ASC`;
	const keys = field.exprs.map((expr) => sql`${expr} ${direction}`);
	return sql.join([...keys, sql`t.id DESC`], sql`, `);
};

// The page of summaries for the flat filter grammar. `limit` is 1 to 200.
// The rows never carry the description or the search column.
export const ticketList = async (tx: Tx, input: TicketListInput): Promise<ListOutput> => {
	const { sort = "-updatedAt", cursor, limit = 50, ...filter } = input;
	const { field, descending } = parseSort(sort);
	const hash = queryHash(filter, sort);
	const keyLength = field.exprs.length + 1;
	const start = cursor === undefined ? sql`true` : afterCursor(field, descending, readCursor(cursor, hash, keyLength));
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
