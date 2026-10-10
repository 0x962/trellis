import { afterAll, afterEach, expect, test } from "bun:test";
import { Editor } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { registeredRewriteTarget } from "../rewriteTarget";
import { rewriteTestBrowser } from "../testSupport";
import { registerRichRewriteTarget } from "./richRewriteTarget";

const restore = rewriteTestBrowser();
afterAll(restore);
const cleanups: Array<() => void> = [];
afterEach(() => {
	for (const dispose of cleanups.splice(0)) dispose();
	document.body.replaceChildren();
});

function fixture() {
	const host = document.createElement("div");
	document.body.append(host);
	const editor = new Editor({
		element: host,
		extensions: [StarterKit, Markdown],
		content: "Keep **7 days**.\n\nDo not delete files.",
		contentType: "markdown",
	});
	const remove = registerRichRewriteTarget(editor, "markdown");
	cleanups.push(remove, () => editor.destroy());
	editor.commands.selectAll();
	editor.view.focus();
	return { editor, remove, capture: () => registeredRewriteTarget(editor.view.dom)!.capture() };
}

test("a rewrite is one undo step with the original formatting", () => {
	const h = fixture();
	const original = h.editor.getJSON();
	const selection = h.capture()!;
	expect(selection.text).toContain("**7 days**");
	selection.replace("Retain files for 7 days.\n\nDo not delete files.");
	expect(h.editor.getText()).toContain("Retain files");
	expect(h.editor.commands.undo()).toBe(true);
	expect(h.editor.getJSON()).toEqual(original);
});

test("document switches invalidate a captured request even when both texts match", () => {
	const h = fixture();
	const selection = h.capture()!;
	h.remove();
	cleanups.push(registerRichRewriteTarget(h.editor, "markdown"));
	expect(selection.valid()).toBe(false);
});

test("edit then undo still invalidates the pending request", () => {
	const h = fixture();
	const selection = h.capture()!;
	h.editor.commands.insertContent("Changed");
	h.editor.commands.undo();
	expect(selection.valid()).toBe(false);
});

test("partial selections and read-only editors do not rewrite", () => {
	const h = fixture();
	h.editor.commands.setTextSelection({ from: 1, to: 4 });
	expect(h.capture()).toBeNull();
	h.editor.commands.selectAll();
	h.editor.setEditable(false);
	expect(h.capture()).toBeNull();
});

test("toast Undo cannot discard a later edit", () => {
	const h = fixture();
	const undo = h.capture()!.replace("Rewritten content.")!;
	h.editor.commands.insertContent("A later requirement.");
	expect(undo()).toBe(false);
	expect(h.editor.getText()).toContain("A later requirement.");
});

test("a pending l leaves the caret after the letter for the next normal key", () => {
	const h = fixture();
	h.capture()!.insertKey();
	expect(h.editor.state.selection.empty).toBe(true);
	h.editor.view.dispatch(h.editor.state.tr.insertText("x"));
	expect(h.editor.getText()).toBe("lx");
});
