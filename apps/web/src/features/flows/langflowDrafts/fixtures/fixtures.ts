import { type FlowDocumentSaveV1Input, type FlowDocumentV1, pendingDocumentV1Example } from "@trellis/api";
import type { DraftStore } from "../../../../lib/draftTransfer/types";
import type { DraftContent, DraftRecord } from "../draftRecord";

export const content = (text: string): DraftContent => ({
	schemaVersion: 1,
	engine: "langflow",
	graphDocument: { text },
	componentManifestHash: "c".repeat(64),
});
export const draft = (): DraftRecord => ({
	version: 1,
	identity: { host: "host-a/data-a", actor: "human:one", flow: pendingDocumentV1Example.flow.id, tab: "tab-a" },
	baseVersion: 2,
	updatedAt: "2026-09-29T17:00:00Z",
	contentJson: JSON.stringify(content("edit")),
	savedContentJson: JSON.stringify(content("saved")),
	legacyBytes: null,
	submission: null,
	blocked: null,
});
export const receipt = (request: FlowDocumentSaveV1Input): FlowDocumentV1 => ({
	...pendingDocumentV1Example,
	graphDocument: JSON.parse(JSON.stringify(request.graphDocument)),
	flow: { ...pendingDocumentV1Example.flow, version: request.expectedVersion + 1 },
	revision: request.expectedVersion + 1,
	publication: { state: "pending", revision: request.expectedVersion + 1 },
});
export function memoryStore() {
	const values = new Map<string, string>();
	let failWrites = false;
	const storage: DraftStore = {
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => {
			if (failWrites) throw new Error("Storage quota exceeded.");
			values.set(key, value);
		},
		removeItem: (key) => values.delete(key),
		key: (index) => [...values.keys()][index] ?? null,
		get length() {
			return values.size;
		},
	};
	return {
		storage,
		values,
		fail: (value: boolean) => {
			failWrites = value;
		},
	};
}
