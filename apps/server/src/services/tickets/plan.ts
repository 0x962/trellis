import type { ServiceCtx } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";
import { type LabelDeltaInput, type LabelPlan, planLabelDeltas } from "./labels.ts";

// The labels one write names, read from the database once for each root
// instead of once for each ticket. A label belongs to one root, so the
// tickets of one root share one answer. A batch of 200 tickets of the root
// TRL reads each label ref one time.

export type ChangePlanner = {
	labels: (rootId: string) => Promise<LabelPlan>;
};

// Runs `read` the first time a root arrives and answers from the map after
// that. The map holds the promise, so two tickets of one root never start
// two reads of the same row.
const perRoot = <T>(read: (rootId: string) => Promise<T>) => {
	const known = new Map<string, Promise<T>>();
	return (rootId: string) => {
		const answered = known.get(rootId);
		if (answered !== undefined) return answered;
		const pending = read(rootId);
		known.set(rootId, pending);
		return pending;
	};
};

export const changePlanner = (ctx: ServiceCtx, tx: Tx, input: LabelDeltaInput): ChangePlanner => ({
	labels: perRoot((rootId) => planLabelDeltas(ctx, tx, rootId, input)),
});
