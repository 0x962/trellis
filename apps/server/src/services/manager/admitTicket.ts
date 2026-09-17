import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail, invalidInput } from "../../errors.ts";

export const assertStatusRoom = async (
	ctx: ServiceCtx,
	tx: Tx,
	statusId: string,
	projectId: string,
	ticketId?: string,
) => {
	requireActor(ctx);
	const [status] = await rows<{ wipLimit: number | null; category: string; agentConfig: unknown }>(
		tx,
		sql`SELECT wip_limit AS "wipLimit", category, agent_config AS "agentConfig" FROM statuses WHERE id=${statusId}`,
	);
	if (status!.category === "started" && !status!.agentConfig)
		throw invalidInput("status", "Select a worker persona in the column settings before you use In Progress.");
	if (status!.wipLimit === null) return;
	const [count] = await rows<{ count: number }>(
		tx,
		sql`SELECT count(*)::int AS count FROM tickets WHERE status_id=${statusId} AND ${ticketId ? sql`id <> ${ticketId}` : sql`true`}`,
	);
	if (count!.count >= status!.wipLimit)
		throw fail("STATUS_FULL", { statusId, limit: status!.wipLimit, count: count!.count });
};
