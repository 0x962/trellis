import { acknowledgeCopy, listRecoveryCopies, preserveDraft } from "../../../../lib/draftTransfer/draftTransfer";
import type { DraftStore } from "../../../../lib/draftTransfer/types";
import type { DraftGraph } from "../flowDraft";

type Draft = { version: number; graph: DraftGraph };
type DraftStorage = DraftStore;

// Each tab keeps its own draft so two editors cannot overwrite each other's unsaved work.
export const createDraftRecovery = (storage: DraftStorage, tab: string, flow: string) => {
	const key = `trellis.flow-draft.${tab}.${flow}`;
	const selectionKey = `trellis.flow-import-selection.${tab}.${flow}`;
	const candidates = () =>
		listRecoveryCopies(storage).filter(
			(copy) =>
				copy.entry.area === "local" &&
				copy.entry.key.startsWith("trellis.flow-draft.") &&
				copy.entry.key.endsWith(`.${flow}`),
		);
	const read = (): Draft | null => {
		const value = storage.getItem(key);
		return value === null ? null : JSON.parse(value);
	};
	const write = (draft: Draft) => storage.setItem(key, JSON.stringify(draft));
	const clear = () => {
		storage.removeItem(key);
		storage.removeItem(selectionKey);
	};
	const discard = () => {
		const selected = storage.getItem(selectionKey);
		if (selected !== null) acknowledgeCopy(storage, selected);
		clear();
	};
	const select = (id: string) => {
		const copy = candidates().find((copy) => copy.id === id);
		if (!copy) throw new Error("This recovery copy was removed in another window.");
		const current = storage.getItem(key);
		if (current !== null && current !== copy.entry.value)
			preserveDraft(storage, { area: "local", key, value: current });
		storage.setItem(key, copy.entry.value);
		storage.setItem(selectionKey, id);
		return read()!;
	};
	const acknowledge = (graph: DraftGraph, version: number) => {
		const draft = read();
		if (draft === null) return;
		if (JSON.stringify(draft.graph) === JSON.stringify(graph)) discard();
		else write({ ...draft, version });
	};
	const resetToSaved = (graph: DraftGraph) => {
		if (JSON.stringify(read()?.graph) === JSON.stringify(graph)) discard();
		else clear();
	};
	return { read, write, clear, discard, acknowledge, resetToSaved, candidates, select };
};
