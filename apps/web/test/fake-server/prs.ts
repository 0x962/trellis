import type { Check, EventPayload, PrState, ReviewState } from "@trellis/api";
import type { FakeServer } from "./index";

export type PrPatch = {
	checks?: Check[];
	state?: PrState;
	isDraft?: boolean;
	reviewState?: ReviewState;
};

// Writes one stored pull request the way a gh poll would, folds `ciState`
// from the buckets, and emits `pr.updated` to every ticket that holds the
// pull request. The returned payload is the event a client applies.
export const updatePr = (_server: FakeServer, _id: string, _patch: PrPatch): EventPayload<"pr.updated"> => {
	throw new Error("The fake server does not update a pull request yet.");
};
