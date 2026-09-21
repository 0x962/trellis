import type { StoredActorKind, TimelineItem, TimelineListOutput } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { Tx } from "../tx.ts";
import { decodeCursor, encodeCursor, InvalidCursorError, isIsoTimestamp, iso, rows } from "./support.ts";

export type TimelineInput = { ticketId: string; before?: string; limit?: number };

export const TIMELINE_PAGE = 100;

type RawItem = {
	id: string;
	ticket_id: string;
	actor_name: string;
	actor_kind: StoredActorKind;
	actor_display_name: string | null;
	created_at: string;
	batch_id: string;
	root_id: string;
	project_id: string;
	action: string;
	field: string | null;
	from_value: string | null;
	to_value: string | null;
	meta: Record<string, unknown>;
};

// Every row sorts by (created_at, id) descending: newest first, then the id.
// The `comment.*` rows record writes to ticket comments, which no client
// reads or writes, so the stream leaves them out.
const stream = (ticketId: string) => sql`
	SELECT a.id, a.ticket_id, a.actor_name, a.actor_kind, r.name AS actor_display_name, a.created_at,
		a.batch_id, a.root_id, a.project_id, a.action, a.field, a.from_value, a.to_value, a.meta
	FROM activity a LEFT JOIN agent_runs r ON a.actor_kind = 'agent' AND r.id = a.actor_name
	WHERE a.ticket_id = ${ticketId}
		AND a.field IS DISTINCT FROM 'position'
		AND a.action NOT LIKE 'comment.%'
		AND (
			a.action <> 'pr.state_changed'
			OR split_part(a.meta->>'from', '/', 1) IS DISTINCT FROM split_part(a.meta->>'to', '/', 1)
		)`;

// The last row of the previous page: its created_at as `iso` writes it, and
// its activity id.
type Cursor = { at: string; id: number };

// A cursor is user input, so every part is checked before it reaches the
// database.
const readCursor = (before: string): Cursor => {
	let decoded: unknown;
	try {
		decoded = decodeCursor(before);
	} catch {
		throw new InvalidCursorError();
	}
	if (decoded === null || typeof decoded !== "object") throw new InvalidCursorError();
	const { at, id } = decoded as { at?: unknown; id?: unknown };
	if (!isIsoTimestamp(at) || typeof id !== "number" || !Number.isSafeInteger(id)) throw new InvalidCursorError();
	return { at, id };
};

const afterCursor = (cursor: Cursor) => sql`(created_at, id) < (${cursor.at}::timestamptz, ${cursor.id}::bigint)`;

const toItem = (row: RawItem): TimelineItem => ({
	kind: "activity",
	id: Number(row.id),
	batchId: row.batch_id,
	rootId: row.root_id,
	projectId: row.project_id,
	ticketId: row.ticket_id,
	actor: {
		name: row.actor_name,
		kind: row.actor_kind,
		...(row.actor_display_name === null ? {} : { displayName: row.actor_display_name }),
	},
	action: row.action,
	field: row.field,
	fromValue: row.from_value,
	toValue: row.to_value,
	meta: row.meta,
	createdAt: row.created_at,
});

// The activity of one ticket, newest first. `before` is the cursor of the
// previous page and names the last row shown.
export const timeline = async (tx: Tx, input: TimelineInput): Promise<TimelineListOutput> => {
	const limit = input.limit ?? TIMELINE_PAGE;
	const start = input.before === undefined ? sql`true` : afterCursor(readCursor(input.before));
	const found = await rows<RawItem>(
		tx,
		sql`SELECT id, ticket_id, actor_name, actor_kind, actor_display_name, ${iso(sql`created_at`)} AS created_at,
			batch_id, root_id, project_id, action, field, from_value, to_value, meta
		FROM (${stream(input.ticketId)}) stream
		WHERE ${start}
		ORDER BY created_at DESC, id DESC
		LIMIT ${limit + 1}`,
	);
	const items = found.slice(0, limit);
	const last = items.at(-1);
	const nextCursor =
		found.length > limit && last !== undefined
			? encodeCursor({ at: last.created_at, id: Number(last.id) } satisfies Cursor)
			: null;
	return { items: items.map(toItem), nextCursor };
};
