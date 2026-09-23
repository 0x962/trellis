import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { requireActor, type ServiceCtx } from "../context.ts";
import { rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { upsert } from "./actors.ts";

// One changed field. `meta` is merged into the row's meta after the session.
export type Change = {
	field: string | null;
	from: string | null;
	to: string | null;
	meta?: Record<string, unknown>;
};

// `batchId` groups the rows of one mutation; a caller that writes several
// tickets in one mutation passes the same id to every call.
export type RecordInput = {
	projectId: string;
	ticketId: string | null;
	action: string;
	changes: Change[];
	batchId?: string;
};

// A burst of description edits by one actor inside this window stays one row.
const DESCRIPTION_WINDOW_MS = 5 * 60_000;

// The one path onto the activity table: one row per change under one batch
// id, stamped with the actor and the instant of the context. A description
// row keeps no text, only `meta.deltaChars`. Returns the ids of the rows
// written, in order. The actor row is upserted first, so the actor foreign
// key holds for an actor the database has never seen.
export const record = async (ctx: ServiceCtx, tx: Tx, input: RecordInput) => {
	const actor = requireActor(ctx);
	await upsert(ctx, tx, actor);
	const batchId = input.batchId ?? ulid();
	const ids: number[] = [];
	for (const change of input.changes) {
		if (change.field === "description" && (await recentDescriptionRow(ctx, tx, input.ticketId))) continue;
		const isDescription = change.field === "description";
		const meta = {
			...(ctx.session === null ? {} : { session: ctx.session }),
			...(isDescription ? { deltaChars: (change.to ?? "").length - (change.from ?? "").length } : {}),
			...change.meta,
		};
		const inserted = await rows<{ id: number }>(
			tx,
			sql`INSERT INTO activity (batch_id, project_id, ticket_id, actor_name, actor_kind, action, field, from_value, to_value, meta, created_at)
				VALUES (${batchId}, ${input.projectId}, ${input.ticketId}, ${actor.name}, ${actor.kind}, ${input.action},
					${change.field}, ${isDescription ? null : change.from}, ${isDescription ? null : change.to},
					${JSON.stringify(meta)}::jsonb, ${ctx.now})
				RETURNING id`,
		);
		ids.push(inserted[0]!.id);
	}
	return ids;
};

const recentDescriptionRow = async (ctx: ServiceCtx, tx: Tx, ticketId: string | null) => {
	const actor = ctx.actor as { name: string; kind: string };
	const since = new Date(ctx.now.getTime() - DESCRIPTION_WINDOW_MS);
	const found = await rows<{ id: number }>(
		tx,
		sql`SELECT id FROM activity
			WHERE ticket_id = ${ticketId} AND field = 'description'
				AND actor_name = ${actor.name} AND actor_kind = ${actor.kind}
				AND created_at > ${since}
			LIMIT 1`,
	);
	return found.length > 0;
};
