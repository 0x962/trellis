import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import type { IoCtx } from "../support.ts";
import { dispatchBuilderHeartbeats } from "./builderHeartbeat/index.ts";
import { dispatchBuilderRecovery } from "./builderHeartbeat/recovery.ts";
import { dispatchBuilderStarts } from "./builderStarts/dispatch.ts";

type Work = (ctx: IoCtx, sessions: RuntimeProcessStatus[]) => Promise<unknown>;
type Dependencies = { starts: Work; heartbeats: Work; recovery: Work };
const defaults: Dependencies = {
	starts: (ctx, sessions) => dispatchBuilderStarts(ctx, undefined, sessions),
	heartbeats: dispatchBuilderHeartbeats,
	recovery: dispatchBuilderRecovery,
};

export async function manage(ctx: IoCtx, input: { sessions: RuntimeProcessStatus[] }, deps: Dependencies = defaults) {
	const results = await Promise.allSettled([
		deps.starts(ctx, input.sessions),
		deps.heartbeats(ctx, input.sessions),
		deps.recovery(ctx, input.sessions),
	]);
	const errors = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
	if (errors.length > 0)
		throw new AggregateError(
			errors,
			errors.map((error) => (error instanceof Error ? error.message : String(error))).join("\n"),
		);
}
