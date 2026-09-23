import { sql } from "drizzle-orm";
import { launchRun } from "../../agentRuns/launchRun";
import { startNative } from "../../agentRuns/nativeStart.ts";
import type { IoCtx } from "../../support.ts";

// Starts the harness of a session in the background and answers at once. The
// caller marks the session busy with `holdSession` and passes the function
// that marks it free as `release`. The launch runs after the caller answers,
// so the background task calls `release` when the harness confirms or fails.
export function launchSession(
	ctx: IoCtx,
	sessionId: string,
	input: Parameters<typeof startNative>[1],
	release: () => void,
	start = startNative,
	prepare?: () => Promise<unknown>,
) {
	launchRun(
		ctx,
		input.run.id,
		input.attempt.id,
		async (background) => {
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
			} finally {
				release();
			}
		},
		sessionId,
	);
}
