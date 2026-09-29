import type { IoCtx } from "../../support.ts";
import { dependencies, type SessionObserverGenerationDeps } from "../sessionObserverGenerationDeps.ts";

export const recoverSessionObserverGeneration = async (
	ctx: IoCtx,
	_input: Record<string, never>,
	deps: SessionObserverGenerationDeps = dependencies,
) => {
	const claims = await deps.recoverClaims(ctx);
	const attempts = await Promise.allSettled(
		claims.flatMap((claim) =>
			claim.observerRunId === null ? [] : [deps.recoverAttempt(ctx, { observerRunId: claim.observerRunId })],
		),
	);
	const failed = attempts.find((attempt) => attempt.status === "rejected");
	if (failed?.status === "rejected") throw failed.reason;
	return { recovered: claims.length };
};
