import type { Status, StatusCategory } from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../../context.ts";
import { ticketGet } from "../../db/queries/ticketGet.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";
import type { TicketRow } from "../refs.ts";

// The domain rules a ticket write checks before it touches a row.

export const assertAgentMayDelete = (ctx: ServiceCtx, force: boolean | undefined) => {
	if (requireActor(ctx).kind === "agent" && force !== true) throw fail("AGENT_CANNOT_DELETE");
};

// `expectedVersion` makes a write conditional. A mismatch carries the row
// as it stands, so the client can show what changed and retry.
export const assertVersion = async (tx: Tx, row: TicketRow, expectedVersion: number | undefined) => {
	if (expectedVersion === undefined || expectedVersion === row.version) return;
	throw fail("VERSION_CONFLICT", { current: await ticketGet(tx, row.id) });
};

// The SET clauses of a status change. `started_at` is set once, on the
// first move out of the todo category. `completed_at` is set on entering
// done or canceled and cleared on leaving them.
export const stampColumns = (category: StatusCategory, now: Date) => {
	const started = category === "todo" ? sql`started_at` : sql`coalesce(started_at, ${now})`;
	const completed = category === "done" || category === "canceled" ? sql`coalesce(completed_at, ${now})` : sql`NULL`;
	return sql`started_at = ${started}, completed_at = ${completed}`;
};

// The status a ticket takes in another status set: the status of the same
// name and category, else the lowest-position status of the same category,
// else the set's default. `target` is in position order.
export const remapStatus = (target: Status[], current: Status): Status => {
	const byName = target.find((status) => status.name === current.name && status.category === current.category);
	if (byName !== undefined) return byName;
	const byCategory = target.find((status) => status.category === current.category);
	if (byCategory !== undefined) return byCategory;
	return target.find((status) => status.isDefault) as Status;
};

export const outsideRoot = (row: TicketRow, rootId: string) => row.rootId !== rootId;
