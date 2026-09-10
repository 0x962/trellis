import { type Inbox, InboxGetInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../context.ts";
import { inbox } from "../db/queries/inbox.ts";
import { subtreeIds } from "../db/queries/subtree.ts";
import { rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { resolveProject } from "./refs.ts";

// The stalled threshold before anyone changes it in settings.
export const DEFAULT_STALLED_HOURS = 24;

// The `stalledHours` setting: how long a started ticket may sit untouched
// before the inbox lists it. The settings table holds one row per key, and
// a key nobody has set has no row.
const stalledHours = async (tx: Tx) => {
	const found = await rows<{ value: number }>(tx, sql`SELECT value FROM settings WHERE key = 'stalledHours'`);
	return found.length === 0 ? DEFAULT_STALLED_HOURS : (found[0] as { value: number }).value;
};

// Local midnight: the "done by agents today" section counts from the start
// of the server's day.
const todayStart = (now: Date) => {
	const start = new Date(now);
	start.setHours(0, 0, 0, 0);
	return start;
};

// The home screen sections, each capped at 100 items with the whole total.
// A project ref narrows every section to that project's subtree.
export const get = async (ctx: ServiceCtx, tx: Tx, rawInput: unknown): Promise<Inbox> => {
	const input = InboxGetInputSchema.parse(rawInput);
	const now = new Date();
	const projectIds =
		input.project === undefined ? undefined : await subtreeIds(tx, (await resolveProject(ctx, tx, input.project)).id);
	const hours = await stalledHours(tx);
	return inbox(tx, {
		projectIds,
		stalledBefore: new Date(now.getTime() - hours * 3_600_000),
		todayStart: todayStart(now),
	});
};
