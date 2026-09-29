import type { ActorRef } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../context.ts";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { findActorId } from "../findActorId/index.ts";

const FLUSH_MS = 30_000;

const cacheKey = (actor: ActorRef) => `${actor.kind}:${actor.name}`;

const refreshExistingActor = async (ctx: ServiceCtx, tx: Tx, actor: ActorRef, id: string) => {
	const key = cacheKey(actor);
	const last = ctx.actorCache.get(key);
	if (last !== undefined && ctx.now.getTime() - last < FLUSH_MS) return id;
	await tx.execute(sql`UPDATE actors SET last_seen_at=${ctx.now} WHERE id=${id}`);
	ctx.actorCache.set(key, ctx.now.getTime());
	return id;
};

export const resolveActorId = async (ctx: ServiceCtx, tx: Tx, actor: ActorRef): Promise<string> => {
	const found = await findActorId(ctx, tx, actor);
	if (found !== null) return refreshExistingActor(ctx, tx, actor, found);
	const inserted = await rows<{ id: string }>(
		tx,
		sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at)
			VALUES (${actor.name}, ${actor.kind}, ${ctx.now}, ${ctx.now})
			ON CONFLICT DO NOTHING
			RETURNING id`,
	);
	if (inserted[0] !== undefined) return inserted[0].id;
	return refreshExistingActor(ctx, tx, actor, (await findActorId(ctx, tx, actor))!);
};
