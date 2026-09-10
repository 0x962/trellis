import type { Check, EventPayload, PrState, PullRequest, ReviewState } from "@trellis/api";
import type { FakeServer } from "./index";
import { emitPr } from "./prEvents";
import { foldCi } from "./summaries";

export type PrPatch = {
	checks?: Check[];
	state?: PrState;
	isDraft?: boolean;
	reviewState?: ReviewState;
};

// Writes one stored pull request the way a gh poll would, folds `ciState`
// from the buckets, and emits `pr.updated` to every ticket that holds the
// pull request. The returned payload is the event a client applies.
export const updatePr = (server: FakeServer, id: string, patch: PrPatch): EventPayload<"pr.updated"> => {
	const stored = server.state.prs.get(id)!;
	const patched: PullRequest = { ...stored, ...patch, fetchedAt: new Date().toISOString() };
	const updated: PullRequest = { ...patched, ciState: foldCi([patched]) };
	server.state.prs.set(id, updated);
	return emitPr(server.state, server.bus, "pr.updated", updated);
};
