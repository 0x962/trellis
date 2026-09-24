import type { AgentRunPinInput, AgentRunPinOutput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { requireActor, type ServiceCtx } from "../../context.ts";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { runArchivedAt } from "../sessions/archived.ts";
import { getRun } from "./queries.ts";

export const setPinned = async (ctx: ServiceCtx, tx: Tx, input: AgentRunPinInput): Promise<AgentRunPinOutput> => {
	requireActor(ctx);
	const run = await getRun(tx, input.id);
	if (run.kind === "flow") throw invalidInput("id", "A flow run cannot be pinned.");
	if (input.pinned && (await runArchivedAt(tx, run.id)) !== null)
		throw invalidInput("id", "Unarchive the session before you pin it.");
	const [saved] = await rows<AgentRunPinOutput>(
		tx,
		sql`UPDATE agent_runs
			SET pinned_at = ${input.pinned ? sql`COALESCE(pinned_at, ${ctx.now})` : sql`NULL`}, updated_at = ${ctx.now}
			WHERE id = ${run.id}
			RETURNING id, ${iso(sql`pinned_at`)} AS "pinnedAt"`,
	);
	ctx.emit({ type: "agent-runs.changed", id: saved!.id });
	return saved!;
};
