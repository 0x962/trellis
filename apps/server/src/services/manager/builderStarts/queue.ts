import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../../context.ts";
import type { Tx } from "../../../db/tx.ts";
import { projectLaunchConfig } from "../../projectLaunchConfig/projectLaunchConfig.ts";

export async function queueBuilderStart(
	ctx: ServiceCtx,
	tx: Tx,
	input: { ticketId: string; projectId: string; category: string },
) {
	await tx.execute(
		sql`UPDATE builder_start_requests SET state='canceled' WHERE ticket_id=${input.ticketId} AND state='pending'`,
	);
	if (input.category !== "started") return;
	const config = await projectLaunchConfig(tx, { projectId: input.projectId });
	if (!config.builder?.personaId) return;
	await tx.execute(
		sql`INSERT INTO builder_start_requests (id,ticket_id,created_at) VALUES (${ulid()},${input.ticketId},${ctx.now})`,
	);
}
