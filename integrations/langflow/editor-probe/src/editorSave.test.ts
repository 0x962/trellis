import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const patch = await readFile(new URL("../patches/trellis-editor-probe.patch", import.meta.url), "utf8");
const section = patch.split("diff --git a/src/customization/trellis-editor-save.ts ")[1]!.split("diff --git ")[0]!;
const source = section
	.split("\n")
	.filter((line) => line.startsWith("+") && !line.startsWith("+++"))
	.map((line) => line.slice(1))
	.filter((line) => !line.startsWith("import "))
	.join("\n")
	.replaceAll("export ", "");
const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(source);

function fixture(revision = 8, responseFlow = "flow-1") {
	const writes: Array<{
		expectedVersion: number;
		requestId: string;
		graphDocument: unknown;
		componentManifestHash: string;
	}> = [];
	const graph = { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
	const document = () => ({
		flow: { id: responseFlow, name: "Editor fixture", description: "" },
		revision,
		componentManifestHash: "manifest-from-read",
		graphDocument: graph,
	});
	const state = {
		autoSaving: true,
		setAutoSaving(value: boolean) {
			state.autoSaving = value;
		},
		setSaveLoading(_value: boolean) {},
	};
	let fail = false;
	const receipts = new Map<string, ReturnType<typeof document>>();
	const api = {
		get: async () => ({ data: document() }),
		put: async (_path: string, body: (typeof writes)[number]) => {
			writes.push(structuredClone(body));
			if (!receipts.has(body.requestId)) {
				revision++;
				receipts.set(body.requestId, document());
			}
			if (fail) {
				fail = false;
				throw { isAxiosError: true };
			}
			return { data: receipts.get(body.requestId) };
		},
	};
	const editor = new Function(
		"api",
		"useFlowsManagerStore",
		"isAxiosError",
		`${javascript}
return { loadTrellisEditorDocument, saveTrellisEditorDocument, retryTrellisEditorDocument, trellisSaveState };`,
	)(api, { getState: () => state }, (error: { isAxiosError?: boolean }) => error.isAxiosError === true);
	return {
		editor,
		writes,
		graph,
		state,
		loseResponse: () => {
			fail = true;
		},
	};
}

test("a fresh frame saves with the revision and manifest from its read", async () => {
	const { editor, writes, graph } = fixture(8);
	await editor.loadTrellisEditorDocument("flow-1");
	await editor.saveTrellisEditorDocument({ flowId: "flow-1", graphDocument: graph });
	await editor.saveTrellisEditorDocument({ flowId: "flow-1", graphDocument: { ...graph, nodes: [{ id: "new" }] } });
	expect(writes.map((write) => write.expectedVersion)).toEqual([8, 9]);
	expect(writes.every((write) => write.componentManifestHash === "manifest-from-read")).toBe(true);
	expect(writes[0]!.requestId).not.toBe(writes[1]!.requestId);
});

test("an explicit retry retains the intended write after a newer draft", async () => {
	const { editor, writes, graph, state, loseResponse } = fixture(8);
	await editor.loadTrellisEditorDocument("flow-1");
	loseResponse();
	await expect(editor.saveTrellisEditorDocument({ flowId: "flow-1", graphDocument: graph })).rejects.toBeDefined();
	expect(writes).toHaveLength(1);
	expect(state.autoSaving).toBe(false);
	const newer = { ...graph, nodes: [{ id: "newer" }] };
	await expect(editor.saveTrellisEditorDocument({ flowId: "flow-1", graphDocument: newer })).rejects.toThrow(
		"Use Retry save",
	);
	await editor.retryTrellisEditorDocument("flow-1");
	expect(writes[1]).toEqual(writes[0]);
	expect(newer.nodes).toEqual([{ id: "newer" }]);
	await editor.saveTrellisEditorDocument({ flowId: "flow-1", graphDocument: newer });
	expect(writes[2]!.expectedVersion).toBe(9);
	expect(writes[2]!.graphDocument).toEqual(newer);
});

test("the read refuses another flow before it initializes the editor", async () => {
	const { editor, writes } = fixture(8, "another-flow");
	await expect(editor.loadTrellisEditorDocument("flow-1")).rejects.toThrow("another flow");
	expect(writes).toHaveLength(0);
});
