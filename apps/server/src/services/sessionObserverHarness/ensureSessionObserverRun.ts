import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { HarnessSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import { getRun } from "../agentRuns/queries.ts";
import { selectAccount } from "../harnessAccounts/selectAccount.ts";
import type { IoCtx } from "../support.ts";
import { ObserverHarnessError, SESSION_OBSERVER_MODEL } from "./types.ts";

export async function ensureSessionObserverRun(
	ctx: IoCtx,
	input: { observerId: string; sourceRunId: string; modelId: string; accountId?: string },
): Promise<{ observerRunId: string }> {
	if (input.modelId !== SESSION_OBSERVER_MODEL)
		throw new ObserverHarnessError("OBSERVER_MODEL_UNAVAILABLE", "Select Claude Sonnet 5.5 for the observer.");
	const harness = HarnessSchema.parse({ preset: "claude", model: input.modelId, effort: "medium" });
	return ctx.newTx(async (tx) => {
		const [observer] = await rows(
			tx,
			sql`SELECT observer_id FROM session_observers
			WHERE observer_id=${input.observerId} AND run_id=${input.sourceRunId} AND enabled FOR UPDATE`,
		);
		if (!observer || input.observerId === input.sourceRunId)
			throw new ObserverHarnessError("OBSERVER_DISABLED", "The observer is no longer attached to this session.");
		const [existing] = await rows<{ id: string }>(tx, sql`SELECT id FROM agent_runs WHERE id=${input.observerId}`);
		if (existing) return { observerRunId: existing.id };
		const source = await getRun(tx, input.sourceRunId);
		const directory = join(ctx.home, "observers", input.observerId);
		const selected = await selectAccount(tx, {
			accountId: input.accountId,
			config: { directory, harness, accountId: null },
			useDefault: true,
		}).catch(() => {
			throw new ObserverHarnessError(
				"OBSERVER_ACCOUNT_UNAVAILABLE",
				"Select an active Claude account for the observer.",
			);
		});
		if (selected.config.harness.preset !== "claude")
			throw new ObserverHarnessError(
				"OBSERVER_ACCOUNT_UNAVAILABLE",
				"Select an active Claude account for the observer.",
			);
		await tx.execute(sql`INSERT INTO agent_runs
			(id,name,account_id,runtime,harness,kind,instruction,project_id,project_key,
			ticket_id,ticket_identifier,workspace_id,session_id,created_at,updated_at)
			VALUES (${input.observerId},'Session observer',${selected.accountId},'native',
			${JSON.stringify(harness)}::jsonb,'session','',${source.projectId},${source.projectKey},
			NULL,NULL,${directory},${randomUUID()},${ctx.now()},${ctx.now()})`);
		return { observerRunId: input.observerId };
	});
}
