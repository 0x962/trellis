import { expect, test } from "bun:test";
import { getSchema } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import { promptDocument, promptExtensions } from "./promptDocument";

const schema = getSchema(promptExtensions(["session.request", "ticket.title"]));

test("the editor preserves source text, whitespace, markup, and variable syntax", () => {
	for (const text of [
		"",
		"\n",
		"  # Title\n\t{{session.request}}\n\n<script>text</script>  \n",
		"𝒜\r\n{{ticket.title}}",
	]) {
		const doc = schema.nodeFromJSON(promptDocument(text));
		doc.check();
		expect(doc.textContent).toBe(text);
	}
});

test("editing in the middle of a variable leaves all other source bytes intact", () => {
	const text = "First\n{{ticket.title}}\nLast  \n";
	const state = EditorState.create({ schema, doc: schema.nodeFromJSON(promptDocument(text)) });
	const start = text.indexOf("ticket.title") + 1;
	const next = state.apply(state.tr.insertText("session.request", start, start + "ticket.title".length));
	expect(next.doc.textContent).toBe("First\n{{session.request}}\nLast  \n");
});
