import type { EditorContent } from "../../../../../protocol";
import { suspendNativeEditor } from "../suspendNativeEditor";

const content: EditorContent = {
	schemaVersion: 1,
	engine: "langflow",
	componentManifestHash: "a".repeat(64),
	graphDocument: { nodes: [{ id: "last-edit" }], edges: [] },
};

beforeEach(() => {
	document.body.innerHTML = '<div id="root"></div>';
});

test("captures the current draft after the native root becomes inert", () => {
	const result = suspendNativeEditor(document, () => {
		expect(document.getElementById("root")!.inert).toBe(true);
		return content;
	});
	expect(result).toEqual({ state: "suspended", content });
});

test("preserves a local dialog draft and an invalid numeric field", () => {
	const capture = jest.fn(() => content);
	const dialog = document.createElement("div");
	dialog.setAttribute("role", "dialog");
	document.body.append(dialog);
	expect(suspendNativeEditor(document, capture)).toEqual({ state: "refused", reason: "open-control" });
	dialog.remove();
	const input = document.createElement("input");
	input.type = "number";
	input.value = "0";
	input.min = "1";
	document.getElementById("root")!.append(input);
	expect(suspendNativeEditor(document, capture)).toEqual({ state: "refused", reason: "invalid-field" });
	expect(capture).not.toHaveBeenCalled();
});
