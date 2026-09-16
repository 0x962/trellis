import type { CommentNotification, StoredActorKind, TimelineItem, TimelineListOutput } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { Tx } from "../tx.ts";
import { commentNotifications } from "./commentNotifications.ts";
import { decodeCursor, encodeCursor, InvalidCursorError, isIsoTimestamp, iso, rows } from "./support.ts";

export type TimelineInput = { ticketId: string; before?: string; limit?: number };

export const TIMELINE_PAGE = 100;

type RawItem = {
	kind: "comment" | "activity";
	kind_rank: number;
	sort_key: string;
	id: string;
	ticket_id: string;
	body: string | null;
	notifications: CommentNotification[];
	parent_id: string | null;
	resolved_at: string | null;
	actor_name: string;
	actor_kind: StoredActorKind;
	actor_display_name: string | null;
	created_at: string;
	updated_at: string | null;
	batch_id: string | null;
	root_id: string | null;
	project_id: string | null;
	action: string | null;
	field: string | null;
	from_value: string | null;
	to_value: string | null;
	meta: Record<string, unknown> | null;
};

// Every row sorts by (created_at, kind_rank, sort_key) descending: newest
// first, a comment before an activity row of the same instant, then the id.
// The activity id is zero-padded so its text order equals its number order.
const stream = (ticketId: string) => sql`
	SELECT 'comment' AS kind, 1 AS kind_rank, c.id AS sort_key, c.id, c.ticket_id, c.body, c.parent_id, c.resolved_at,
		c.actor_name, c.actor_kind, r.persona_name AS actor_display_name, c.created_at, c.updated_at,
		NULL AS batch_id, NULL AS root_id, NULL AS project_id, NULL AS action, NULL AS field,
		NULL AS from_value, NULL AS to_value, NULL::jsonb AS meta
	FROM comments c LEFT JOIN agent_runs r ON c.actor_kind = 'agent' AND r.id = c.actor_name
	WHERE c.ticket_id = ${ticketId}
	UNION ALL
	SELECT 'activity', 0, lpad(a.id::text, 19, '0'), a.id::text, a.ticket_id, NULL, NULL, NULL,
		a.actor_name, a.actor_kind, r.persona_name, a.created_at, NULL,
		a.batch_id, a.root_id, a.project_id, a.action, a.field, a.from_value, a.to_value, a.meta
	FROM activity a LEFT JOIN agent_runs r ON a.actor_kind = 'agent' AND r.id = a.actor_name
	WHERE a.ticket_id = ${ticketId}`;

// The last row of the previous page: its created_at as `iso` writes it, its
// kind_rank (0 activity, 1 comment), and its sort_key.
type Cursor = { at: string; kind: number; key: string };

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
	const { at, kind, key } = decoded as { at?: unknown; kind?: unknown; key?: unknown };
	if (!isIsoTimestamp(at) || (kind !== 0 && kind !== 1) || typeof key !== "string") throw new InvalidCursorError();
	return { at, kind, key };
};

const afterCursor = (cursor: Cursor) =>
	sql`(created_at, kind_rank, sort_key) < (${cursor.at}::timestamptz, ${cursor.kind}::int, ${cursor.key})`;

const toItem = (row: RawItem): TimelineItem => {
	const actor = {
		name: row.actor_name,
		kind: row.actor_kind,
		...(row.actor_display_name === null ? {} : { displayName: row.actor_display_name }),
	};
	if (row.kind === "comment") {
		return {
			kind: "comment",
			id: row.id,
			ticketId: row.ticket_id,
			body: row.body as string,
			...(row.notifications.length === 0 ? {} : { notifications: row.notifications }),
			parentId: row.parent_id,
			resolvedAt: row.resolved_at,
			actor,
			createdAt: row.created_at,
			updatedAt: row.updated_at as string,
		};
	}
	return {
		kind: "activity",
		id: Number(row.id),
		batchId: row.batch_id as string,
		rootId: row.root_id as string,
		projectId: row.project_id as string,
		ticketId: row.ticket_id,
		actor,
		action: row.action as string,
		field: row.field,
		fromValue: row.from_value,
		toValue: row.to_value,
		meta: row.meta as Record<string, unknown>,
		createdAt: row.created_at,
	};
};

// The comments and activity of one ticket as one stream, newest first.
// `before` is the cursor of the previous page and names the last row shown.
export const timeline = async (tx: Tx, input: TimelineInput): Promise<TimelineListOutput> => {
	const limit = input.limit ?? TIMELINE_PAGE;
	const start = input.before === undefined ? sql`true` : afterCursor(readCursor(input.before));
	const found = await rows<RawItem>(
		tx,
		sql`SELECT kind, kind_rank, sort_key, id, ticket_id, body, CASE WHEN kind = 'comment' THEN ${commentNotifications(sql`stream.id`)} ELSE '[]'::jsonb END AS notifications, parent_id, ${iso(sql`resolved_at`)} AS resolved_at, actor_name, actor_kind, actor_display_name,
			${iso(sql`created_at`)} AS created_at, ${iso(sql`updated_at`)} AS updated_at,
			batch_id, root_id, project_id, action, field, from_value, to_value, meta
		FROM (${stream(input.ticketId)}) stream
		WHERE ${start}
		ORDER BY created_at DESC, kind_rank DESC, sort_key DESC
		LIMIT ${limit + 1}`,
	);
	const items = found.slice(0, limit);
	const last = items.at(-1);
	const nextCursor =
		found.length > limit && last !== undefined
			? encodeCursor({ at: last.created_at, kind: last.kind_rank, key: last.sort_key } satisfies Cursor)
			: null;
	return { items: items.map(toItem), nextCursor };
};
