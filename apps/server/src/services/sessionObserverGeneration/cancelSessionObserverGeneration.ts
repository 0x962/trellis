import type { ServiceCtx } from "../../context.ts";

const activeGenerations = new Map<string, AbortController>();

export const beginSessionObserverGeneration = (runId: string) => {
	const controller = new AbortController();
	activeGenerations.set(runId, controller);
	return controller;
};

export const endSessionObserverGeneration = (runId: string, controller: AbortController) => {
	if (activeGenerations.get(runId) === controller) activeGenerations.delete(runId);
};

export const cancelSessionObserverGeneration = (_ctx: ServiceCtx, runId: string) => {
	activeGenerations.get(runId)?.abort();
};
