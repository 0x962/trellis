import type { ActorRef } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { Ctx } from "../context.ts";
import type { Tx } from "../db/tx.ts";

export type ActivityInput = {
	rootId: string;
	projectId: string;
	ticketId: string | null;
	action: string;
	field?: string | null;
	fromValue?: string | null;
	toValue?: string | null;
	meta?: Record<string, unknown>;
};

// One mutation writes under one batch. `id` is the batch id every activity
// row and every event of the mutation carries. `now` is the one instant
// every row of the mutation is stamped with.
export type Batch = {
	id: string;
	now: Date;
	actor: ActorRef;
	record: (row: ActivityInput) => Promise<void>;
};

// Opens the batch of one mutation. The actor row is written first, because
// every activity row points at it through a foreign key. `ctx.session` goes
// into `meta.session` of every row, so a row leads back to the agent session.
export const beginBatch = async (ctx: Ctx, tx: Tx): Promise<Batch> => {
	const now = new Date();
	const { actor } = ctx;
	await tx.execute(
		sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
			VALUES (${actor.name}, ${actor.kind}, ${now}, ${now})
			ON CONFLICT (name, kind) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at`,
	);
	const id = ulid();
	const record = async (row: ActivityInput) => {
		const meta = ctx.session === null ? (row.meta ?? {}) : { ...(row.meta ?? {}), session: ctx.session };
		await tx.execute(
			sql`INSERT INTO activity (batch_id, root_id, project_id, ticket_id, actor_name, actor_kind, action, field,
				from_value, to_value, meta, created_at)
			VALUES (${id}, ${row.rootId}, ${row.projectId}, ${row.ticketId}, ${actor.name}, ${actor.kind}, ${row.action},
				${row.field ?? null}, ${row.fromValue ?? null}, ${row.toValue ?? null}, ${JSON.stringify(meta)}::jsonb, ${now})`,
		);
	};
	return { id, now, actor, record };
};
