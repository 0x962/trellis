import { sql } from "drizzle-orm";
import { getAccount } from "../../harnessAccounts/queries.ts";
import type { IoCtx } from "../../support.ts";
import { startNative } from "../nativeStart.ts";
import { getRun } from "../queries.ts";
import { prepareResume } from "../resume.ts";

export async function prepareSwitchAccount(
	ctx: IoCtx,
	input: { id: string; accountId: string; expectedTerminalId: string; requestId: string; confirmInterrupt: boolean },
	start: typeof startNative = startNative,
) {
	const account = await ctx.newTx((tx) => getAccount(tx, { id: input.accountId }));
	const result = await prepareResume(ctx, input, start, true);
	if (!("launchedAt" in result) || !result.launchedAt) return result;
	await ctx.newTx(async (tx) => {
		const run = await getRun(tx, result.id);
		if (run.accountId !== account.id || run.error || run.terminalId === input.expectedTerminalId) return;
		await tx.execute(sql`UPDATE agent_start_requests
			SET target = target || ${JSON.stringify({ switchedTo: account.name })}::jsonb
			WHERE run_id=${run.id} AND request_id=${input.requestId}
			AND actor_kind=${ctx.actor.kind} AND actor_name=${ctx.actor.name}`);
	});
	ctx.emit({ type: "agent-runs.changed", id: result.id });
	return result;
}
