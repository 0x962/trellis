import { isDeepStrictEqual } from "node:util";
import type { ServiceCtx } from "../../../context";
import {
	commitProjection,
	lockExecution,
	readProjection,
	readProjectionFacts,
} from "../../../db/queries/langflowExecution";
import type { Tx } from "../../../db/tx";
import { publicStop } from "../publicDetails";

export async function saveStopState(ctx: ServiceCtx, tx: Tx, input: { executionId: string }) {
	const execution = await lockExecution(tx, input);
	const stored = (await readProjection(tx, input))!;
	const facts = await readProjectionFacts(tx, input);
	const current = stored.view;
	const next = {
		...current,
		...(execution.cancelIntent ? { status: "canceled" as const, detail: "canceled" as const } : {}),
		stopObligations: facts.stops.map(publicStop),
		deadlines: facts.deadlines.map(({ deadlineId, groupOccurrenceKey, launchedAt, deadlineAt }) => ({
			deadlineId,
			groupOccurrenceKey,
			launchedAt,
			deadlineAt,
		})),
	};
	if (isDeepStrictEqual(current, next)) return current;
	const view = { ...next, revision: current.revision + 1, updatedAt: ctx.now.toISOString() };
	await commitProjection(tx, { ...input, expectedRevision: current.revision, view, event: null, sourceBytes: null });
	ctx.emit({ type: "flows.changed", id: view.flowId });
	return view;
}
