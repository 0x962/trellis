import { sql } from "drizzle-orm";
import { launchRun } from "../../agentRuns/launchRun";
import { startNative } from "../../agentRuns/nativeStart.ts";
import type { IoCtx } from "../../support.ts";
import { sessionOperation } from "../operation.ts";

export function launchSession(
	ctx: IoCtx,
	sessionId: string,
	input: Parameters<typeof startNative>[1],
	start = startNative,
	prepare?: () => Promise<unknown>,
) {
	launchRun(
		ctx,
		input.run.id,
		input.attempt.id,
		async (background) => {
			await sessionOperation(background.home, input.run.id, async () => {
				let prepared = false;
				try {
					await prepare?.();
					prepared = true;
					await start(background, input);
				} catch (error) {
					if (!prepared)
						await background.newTx((tx) =>
							tx.execute(sql`UPDATE agent_runs SET terminal_id=NULL,closed_at=${background.now()},error=${error instanceof Error ? error.message : String(error)},updated_at=${background.now()}
							WHERE id=${input.run.id} AND terminal_id=${input.attempt.id} AND closed_at IS NULL`),
						);
					throw error;
				}
			});
		},
		sessionId,
	);
}
