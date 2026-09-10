import type { Actor, ActorRef, DefaultActor } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../context.ts";
import { iso, rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import * as settings from "./settings.ts";

// The actor row is rewritten at most once per this window. Between two
// writes `last_seen_at` lags by at most this long.
const FLUSH_MS = 30_000;

const cacheKey = (actor: ActorRef) => `${actor.kind}:${actor.name}`;

// Writes the actor row (insert, or a `last_seen_at` refresh) and remembers
// the instant in `ctx.actorCache`. A call inside the flush window runs no
// statement. A transaction that rolls back after the first insert of an
// actor leaves the cache entry in place. The next mutation of that actor
// inside the window then fails on the actor foreign key.
export const upsert = async (ctx: ServiceCtx, tx: Tx, actor: ActorRef) => {
	const key = cacheKey(actor);
	const last = ctx.actorCache.get(key);
	if (last !== undefined && ctx.now.getTime() - last < FLUSH_MS) return;
	await tx.execute(
		sql`INSERT INTO actors (name, kind, first_seen_at, last_seen_at) VALUES (${actor.name}, ${actor.kind}, ${ctx.now}, ${ctx.now})
			ON CONFLICT (name, kind) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at`,
	);
	ctx.actorCache.set(key, ctx.now.getTime());
};

type ActorRow = { name: string; kind: Actor["kind"]; first_seen_at: string; last_seen_at: string };

export const list = async (_ctx: ServiceCtx, tx: Tx): Promise<Actor[]> => {
	const found = await rows<ActorRow>(
		tx,
		sql`SELECT name, kind, ${iso(sql`first_seen_at`)} AS first_seen_at, ${iso(sql`last_seen_at`)} AS last_seen_at
			FROM actors ORDER BY last_seen_at DESC, name, kind`,
	);
	return found.map((row) => ({
		name: row.name,
		kind: row.kind,
		firstSeenAt: row.first_seen_at,
		lastSeenAt: row.last_seen_at,
	}));
};

// The identity the web app starts with. The name comes from the settings;
// the kind is always human, because the header takes no system actor.
// `stored` is true only when the settings table holds the name.
const defaultActor = async (ctx: ServiceCtx, tx: Tx): Promise<DefaultActor> => {
	const current = await settings.get(ctx, tx);
	const found = await rows<{ key: string }>(tx, sql`SELECT key FROM settings WHERE key = 'defaultActorName'`);
	return { name: current.defaultActorName, kind: "human", stored: found.length > 0 };
};

export { defaultActor as default };
