import type { IoCtx } from "../../support.ts";
import { launchState } from "../launchState";

export function launchRun(
	ctx: IoCtx,
	runId: string,
	attemptId: string,
	action: (background: IoCtx) => Promise<unknown>,
	sessionId?: string,
) {
	ctx.background(async (background) => {
		const finish = launchState.start(background.home, attemptId);
		try {
			await action(background);
		} finally {
			finish();
			if (sessionId !== undefined) background.emit({ type: "sessions.changed", id: sessionId });
			background.emit({ type: "agent-runs.changed", id: runId });
		}
	});
}
