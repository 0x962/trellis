import {
	type Activity,
	AgentInboxInputSchema,
	type AgentInboxOutput,
	type Comment,
	type StoredActorKind,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import { roleActorName } from "../agents/names.ts";
import type { ServiceCtx } from "../context.ts";
import { iso, rows, textArray } from "../db/queries/support.ts";
import { ticketSummaries } from "../db/queries/ticketSummaries.ts";
import type { Tx } from "../db/tx.ts";
import { pathOf, resolveProject } from "./refs.ts";

// The manager's inbox: the activity of the project's subtree after the
// stored cursor, oldest first, without the rows the manager wrote itself.
// The read and the cursor move share one transaction, so a wake message
// that arrives twice returns the changes once.

type RawActivity = {
	id: number;
	batch_id: string;
	root_id: string;
	project_id: string;
	ticket_id: string | null;
	actor_name: string;
	actor_kind: StoredActorKind;
	action: string;
	field: string | null;
	from_value: string | null;
	to_value: string | null;
	meta: Record<string, unknown>;
	created_at: string;
};

type RawComment = {
	id: string;
	ticket_id: string;
	body: string;
	actor_name: string;
	actor_kind: StoredActorKind;
	created_at: string;
	updated_at: string;
};

const activityColumns = sql`a.id, a.batch_id, a.root_id, a.project_id, a.ticket_id, a.actor_name, a.actor_kind,
	a.action, a.field, a.from_value, a.to_value, a.meta, ${iso(sql`a.created_at`)} AS created_at`;

const toActivity = (row: RawActivity): Activity => ({
	id: row.id,
	batchId: row.batch_id,
	rootId: row.root_id,
	projectId: row.project_id,
	ticketId: row.ticket_id,
	actor: { name: row.actor_name, kind: row.actor_kind },
	action: row.action,
	field: row.field,
	fromValue: row.from_value,
	toValue: row.to_value,
	meta: row.meta,
	createdAt: row.created_at,
});

const toComment = (row: RawComment): Comment => ({
	id: row.id,
	ticketId: row.ticket_id,
	body: row.body,
	actor: { name: row.actor_name, kind: row.actor_kind },
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

// A comment row of the activity names its comment in `meta.commentId`. A
// comment deleted since then has no row, so it drops out.
const commentsOf = async (tx: Tx, events: Activity[]) => {
	const ids = events.flatMap((event) =>
		event.action.startsWith("comment.") && typeof event.meta.commentId === "string" ? [event.meta.commentId] : [],
	);
	if (ids.length === 0) return [];
	const found = await rows<RawComment>(
		tx,
		sql`SELECT c.id, c.ticket_id, c.body, c.actor_name, c.actor_kind,
				${iso(sql`c.created_at`)} AS created_at, ${iso(sql`c.updated_at`)} AS updated_at
			FROM comments c WHERE c.id = ANY(${textArray([...new Set(ids)])}) ORDER BY c.created_at, c.id`,
	);
	return found.map(toComment);
};

// With more rows than `limit`, the cursor stops at the last row returned.
// Without, it moves past every row of the scope, the manager's own rows
// included, so those rows never come back.
export const inbox = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<AgentInboxOutput> => {
	const input = AgentInboxInputSchema.parse(rawInput);
	const project = await resolveProject(ctx, tx, input.project);
	const scope = textArray(ctx.cache.resolveSubtree(project.id));
	const manager = roleActorName({ role: "manager", project: pathOf(ctx.cache, project.id) });
	const [stored] = await rows<{ activity_id: number }>(
		tx,
		sql`SELECT activity_id FROM agent_cursors WHERE project_id = ${project.id}`,
	);
	const after = stored === undefined ? 0 : stored.activity_id;
	const found = await rows<RawActivity>(
		tx,
		sql`SELECT ${activityColumns} FROM activity a
			WHERE a.project_id = ANY(${scope}) AND a.id > ${after}
				AND NOT (a.actor_kind = 'agent' AND a.actor_name = ${manager})
			ORDER BY a.id LIMIT ${input.limit + 1}`,
	);
	const events = found.slice(0, input.limit).map(toActivity);
	const more = found.length > input.limit;
	const [last] = await rows<{ id: number }>(
		tx,
		sql`SELECT coalesce(max(id), ${after}::bigint) AS id FROM activity WHERE project_id = ANY(${scope}) AND id > ${after}`,
	);
	const cursor = more ? events.at(-1)!.id : last!.id;
	await tx.execute(
		sql`INSERT INTO agent_cursors (project_id, activity_id, updated_at) VALUES (${project.id}, ${cursor}, ${ctx.now})
			ON CONFLICT (project_id) DO UPDATE SET activity_id = EXCLUDED.activity_id, updated_at = EXCLUDED.updated_at`,
	);
	const ticketIds = [...new Set(events.flatMap((event) => (event.ticketId === null ? [] : [event.ticketId])))];
	return {
		events,
		tickets: await ticketSummaries(tx, ticketIds),
		comments: await commentsOf(tx, events),
		cursor,
		more,
	};
};
