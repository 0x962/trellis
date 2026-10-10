import type { EpicWhiteboard, EpicWhiteboardSnapshot } from "@trellis/api";
import { type WhiteboardSaveState, whiteboardSaveQueue } from "./whiteboardSaveQueue";

type Draft = {
	snapshot: EpicWhiteboardSnapshot | null;
	state: WhiteboardSaveState;
	change: (snapshot: EpicWhiteboardSnapshot) => void;
	discard: () => void;
	subscribe: (listener: (state: WhiteboardSaveState) => void) => () => void;
};

const drafts = new WeakMap<object, Map<string, Draft>>();

export function whiteboardDraft(
	scope: object,
	id: string,
	initial: EpicWhiteboard,
	save: (snapshot: EpicWhiteboardSnapshot, expectedRevision: number) => Promise<{ revision: number }>,
	setUnloadBlocked: (blocked: boolean) => void = () => {},
): Draft {
	let documents = drafts.get(scope);
	if (!documents) {
		documents = new Map();
		drafts.set(scope, documents);
	}
	const existing = documents.get(id);
	if (existing) return existing;
	const registry = documents;
	const listeners = new Set<(state: WhiteboardSaveState) => void>();
	const queue = whiteboardSaveQueue({
		revision: initial.revision,
		save,
		onState: (state) => {
			setUnloadBlocked(state.status === "saving" || state.status === "error");
			const changed = state.status !== draft.state.status || state.error !== draft.state.error;
			draft.state = state;
			if (changed) for (const listener of listeners) listener(state);
			if (state.status === "saved" && listeners.size === 0) registry.delete(id);
		},
	});
	const draft: Draft = {
		snapshot: initial.snapshot,
		state: { status: "idle" },
		change: (snapshot) => {
			draft.snapshot = snapshot;
			queue.change(snapshot);
		},
		discard: () => {
			setUnloadBlocked(false);
			registry.delete(id);
		},
		subscribe: (listener) => {
			registry.set(id, draft);
			listeners.add(listener);
			listener(draft.state);
			return () => {
				listeners.delete(listener);
				void queue.flush();
				if (listeners.size === 0 && (draft.state.status === "idle" || draft.state.status === "saved"))
					registry.delete(id);
			};
		},
	};
	registry.set(id, draft);
	return draft;
}
