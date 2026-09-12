import type { DraftGraph } from "../flowDraft";

type Draft = { version: number; graph: DraftGraph };
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

// Each tab keeps its own draft so two editors cannot overwrite each other's unsaved work.
export const createDraftRecovery = (storage: DraftStorage, tab: string, flow: string) => {
	const key = `trellis.flow-draft.${tab}.${flow}`;
	const read = (): Draft | null => {
		const value = storage.getItem(key);
		return value === null ? null : JSON.parse(value);
	};
	const write = (draft: Draft) => storage.setItem(key, JSON.stringify(draft));
	const clear = () => storage.removeItem(key);
	const acknowledge = (graph: DraftGraph, version: number) => {
		const draft = read();
		if (draft === null) return;
		if (JSON.stringify(draft.graph) === JSON.stringify(graph)) clear();
		else write({ ...draft, version });
	};
	return { read, write, clear, acknowledge };
};
