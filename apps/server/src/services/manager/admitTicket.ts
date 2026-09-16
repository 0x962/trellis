import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail, invalidInput } from "../../errors.ts";
import { projectLaunchConfig } from "../projectLaunchConfig/projectLaunchConfig.ts";

// The in-progress gate: an agent move into a status at its WIP limit fails.
// A person owns the limit and moves past it; the board shows the excess.
export const assertStatusRoom = async (
	ctx: ServiceCtx,
	tx: Tx,
	statusId: string,
	projectId: string,
	ticketId?: string,
) => {
	const actor = requireActor(ctx);
	const [status] = await rows<{ wipLimit: number | null; category: string }>(
		tx,
		sql`SELECT wip_limit AS "wipLimit", category FROM statuses WHERE id=${statusId}`,
	);
	if (status!.category === "started") {
		const config = await projectLaunchConfig(tx, { projectId });
		if (!config.builder?.personaId)
			throw invalidInput("status", "Set a default builder in project settings before you use In Progress.");
	}
	if (actor.kind !== "agent" || status!.wipLimit === null) return;
	const [count] = await rows<{ count: number }>(
		tx,
		sql`SELECT count(*)::int AS count FROM tickets WHERE status_id=${statusId} AND ${ticketId ? sql`id <> ${ticketId}` : sql`true`}`,
	);
	if (count!.count >= status!.wipLimit)
		throw fail("STATUS_FULL", { statusId, limit: status!.wipLimit, count: count!.count });
};
