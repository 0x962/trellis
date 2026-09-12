import { expect, test } from "bun:test";
import { createDraftRecovery } from "./draftRecovery";

const storage = () => {
	const values = new Map<string, string>();
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		},
		removeItem: (key: string) => {
			values.delete(key);
		},
	};
};

test("a pending draft survives a new editor and stays separate from another tab", () => {
	const disk = storage();
	const first = createDraftRecovery(disk, "tab-a", "flow");
	const draft = { version: 7, graph: { nodes: [], edges: [] } };
	first.write(draft);
	expect(createDraftRecovery(disk, "tab-a", "flow").read()).toEqual(draft);
	expect(createDraftRecovery(disk, "tab-b", "flow").read()).toBeNull();
});

test("acknowledgment of an older save keeps edits made during the request", () => {
	const recovery = createDraftRecovery(storage(), "tab", "flow");
	const sent = { nodes: [], edges: [] };
	const latest = { nodes: [{ id: "new" }], edges: [] } as never;
	recovery.write({ version: 1, graph: sent });
	recovery.write({ version: 1, graph: latest });
	recovery.acknowledge(sent, 2);
	expect(recovery.read()).toEqual({ version: 2, graph: latest });
	recovery.acknowledge(latest, 3);
	expect(recovery.read()).toBeNull();
});
