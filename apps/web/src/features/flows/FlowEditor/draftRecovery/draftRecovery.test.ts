import { expect, test } from "bun:test";
import { createDraftRecovery } from "./draftRecovery";

const storage = () => {
	const values = new Map<string, string>();
	return {
		get length() {
			return values.size;
		},
		key: (index: number) => [...values.keys()][index] ?? null,
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
test("an imported draft can be selected from another tab and stays until save acknowledgement", async () => {
	const { importDrafts, listRecoveryCopies } = await import("../../../../lib/draftTransfer/draftTransfer");
	const disk = storage();
	const draft = { version: 2, graph: { nodes: [], edges: [] } };
	importDrafts(
		{ local: disk, session: storage() },
		JSON.stringify({
			format: "trellis-drafts",
			version: 1,
			exportedAt: new Date().toISOString(),
			entries: [{ area: "local", key: "trellis.flow-draft.old-tab.flow", value: JSON.stringify(draft) }],
		}),
	);
	const recovery = createDraftRecovery(disk, "desktop-tab", "flow");
	expect(recovery.read()).toBeNull();
	expect(recovery.candidates()).toHaveLength(1);
	recovery.select(recovery.candidates()[0]!.id);
	expect(recovery.read()).toEqual(draft);
	expect(listRecoveryCopies(disk)).toHaveLength(1);
	recovery.acknowledge(draft.graph, 3);
	expect(listRecoveryCopies(disk)).toHaveLength(0);
});
test("draft selection preserves the current tab's differing draft", async () => {
	const { preserveDraft, listRecoveryCopies } = await import("../../../../lib/draftTransfer/draftTransfer");
	const disk = storage();
	const recovery = createDraftRecovery(disk, "desktop", "flow");
	recovery.write({ version: 1, graph: { nodes: [], edges: [] } });
	const imported = preserveDraft(disk, {
		area: "local",
		key: "trellis.flow-draft.browser.flow",
		value: JSON.stringify({ version: 2, graph: { nodes: [], edges: [] } }),
	});
	recovery.select(imported.id);
	expect(listRecoveryCopies(disk)).toHaveLength(2);
	expect(recovery.read()?.version).toBe(2);
});
test("acknowledgement of an older graph retains the imported recovery copy", async () => {
	const { preserveDraft, listRecoveryCopies } = await import("../../../../lib/draftTransfer/draftTransfer");
	const disk = storage();
	const recovery = createDraftRecovery(disk, "desktop", "flow");
	const sent = { nodes: [], edges: [] };
	const imported = preserveDraft(disk, {
		area: "local",
		key: "trellis.flow-draft.browser.flow",
		value: JSON.stringify({ version: 2, graph: sent }),
	});
	recovery.select(imported.id);
	recovery.write({ version: 2, graph: { nodes: [{ id: "edit" }], edges: [] } as never });
	recovery.acknowledge(sent, 3);
	expect(listRecoveryCopies(disk)).toHaveLength(1);
	expect(recovery.read()?.version).toBe(3);
});

test("reset to the saved graph drops a canceled submission and retains its recovery copy", async () => {
	const { preserveDraft, listRecoveryCopies } = await import("../../../../lib/draftTransfer/draftTransfer");
	const disk = storage();
	const recovery = createDraftRecovery(disk, "desktop", "flow");
	const imported = preserveDraft(disk, {
		area: "local",
		key: "trellis.flow-draft.browser.flow",
		value: JSON.stringify({ version: 2, graph: { nodes: [{ id: "pending" }], edges: [] } }),
	});
	recovery.select(imported.id);
	recovery.resetToSaved({ nodes: [], edges: [] });
	expect(recovery.read()).toBeNull();
	expect(listRecoveryCopies(disk)).toHaveLength(1);
	recovery.write({ version: 2, graph: { nodes: [], edges: [] } });
	recovery.acknowledge({ nodes: [], edges: [] }, 3);
	expect(listRecoveryCopies(disk)).toHaveLength(1);
});

test("a copy removed in another window reports why it cannot open", async () => {
	const { preserveDraft, acknowledgeCopy } = await import("../../../../lib/draftTransfer/draftTransfer");
	const disk = storage();
	const recovery = createDraftRecovery(disk, "desktop", "flow");
	const copy = preserveDraft(disk, {
		area: "local",
		key: "trellis.flow-draft.browser.flow",
		value: JSON.stringify({ version: 1, graph: { nodes: [], edges: [] } }),
	});
	acknowledgeCopy(disk, copy.id);
	expect(() => recovery.select(copy.id)).toThrow("This recovery copy was removed in another window.");
	expect(recovery.read()).toBeNull();
});
