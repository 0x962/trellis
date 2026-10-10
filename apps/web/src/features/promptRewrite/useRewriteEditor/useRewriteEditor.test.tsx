import { afterAll, expect, test } from "bun:test";
import { Editor } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { act } from "react";
import { createRoot } from "test-renderer";
import { registeredRewriteTarget } from "../rewriteTarget";
import { rewriteTestBrowser } from "../testSupport";
import { useRewriteEditor } from "./useRewriteEditor";

const restore = rewriteTestBrowser();
afterAll(restore);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ editor }: { editor: Editor }) {
	useRewriteEditor(editor, "composer");
	return null;
}

test("an editor destroyed before effects does not block its mounted replacement", async () => {
	const discarded = new Editor({ extensions: [StarterKit, Markdown] });
	discarded.destroy();
	expect(() => discarded.view.dom).toThrow("The editor view is not available");
	const root = createRoot();
	await act(async () => root.render(<Probe editor={discarded} />));
	const element = document.createElement("div");
	document.body.append(element);
	const editor = new Editor({
		element,
		extensions: [StarterKit, Markdown],
		content: "Keep all requirements.",
		contentType: "markdown",
	});
	await act(async () => root.render(<Probe editor={editor} />));
	const target = registeredRewriteTarget(editor.view.dom);
	expect(target).toBeDefined();
	editor.commands.selectAll();
	editor.view.focus();
	const selected = target!.capture()!;
	expect(selected.text).toBe("Keep all requirements.");
	await act(async () => root.unmount());
	expect(selected.valid()).toBe(false);
	expect(registeredRewriteTarget(editor.view.dom)).toBeUndefined();
	editor.destroy();
	element.remove();
});
