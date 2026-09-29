import type { IoCtx } from "../../support.ts";
import { dependencies, type SessionObserverGenerationDeps } from "../sessionObserverGenerationDeps.ts";
import { dispatchCandidate } from "./components/dispatchCandidate";

type SessionObserverGenerationInput = { runId?: string; force?: boolean };

export const prepareSessionObserverGenerations = async (
	ctx: IoCtx,
	input: SessionObserverGenerationInput,
	deps: SessionObserverGenerationDeps = dependencies,
) => {
	const candidates = (await deps.candidates(ctx)).filter(
		(candidate) => input.runId === undefined || candidate.runId === input.runId,
	);
	const results = await Promise.all(
		candidates.map((candidate) => dispatchCandidate(ctx, deps, candidate, input.force ?? false)),
	);
	return {
		checked: candidates.length,
		saved: results.filter((result) => result === "saved").length,
		failed: results.filter((result) => result === "failed").length,
	};
};
