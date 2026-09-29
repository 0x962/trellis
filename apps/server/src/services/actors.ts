import type { Actor, ActorRef, DefaultActor } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../context.ts";
import { actorDisplayName } from "../db/queries/actorDisplayName.ts";
import { iso, rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { resolveActorId } from "./actorIdentity/index.ts";
import * as settings from "./settings/index.ts";

export const upsert = async (ctx: ServiceCtx, tx: Tx, actor: ActorRef) => {
	await resolveActorId(ctx, tx, actor);
};

type ActorRow = {
	display_name: string | null;
	name: string;
	kind: Actor["kind"];
	first_seen_at: string;
	last_seen_at: string;
};

export const list = async (_ctx: ServiceCtx, tx: Tx): Promise<Actor[]> => {
	const found = await rows<ActorRow>(
		tx,
		sql`SELECT a.name, a.kind, ${actorDisplayName(sql`a.name`, sql`a.kind`)} AS display_name, ${iso(sql`first_seen_at`)} AS first_seen_at, ${iso(sql`last_seen_at`)} AS last_seen_at
			FROM actors a ORDER BY last_seen_at DESC, name, kind`,
	);
	return found.map((row) => ({
		name: row.name,
		...(row.display_name === null ? {} : { displayName: row.display_name }),
		kind: row.kind,
		firstSeenAt: row.first_seen_at,
		lastSeenAt: row.last_seen_at,
	}));
};

// The identity the web app starts with. The name comes from the settings;
// the kind is always human, because the header takes no system actor.
// `stored` is true only when the settings table holds the name.
const defaultActor = async (ctx: ServiceCtx, tx: Tx): Promise<DefaultActor> => {
	return { ...(await settings.defaultActorName(ctx, tx)), kind: "human" };
};

export { defaultActor as default };
