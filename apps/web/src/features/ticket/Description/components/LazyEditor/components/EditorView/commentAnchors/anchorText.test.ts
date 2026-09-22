import { expect, test } from "bun:test";
import { getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { editorExtensions } from "../editorExtensions";
import { anchorOf, docText, findAnchor } from "./anchorText";

const extensions = editorExtensions();
const schema = getSchema(extensions);
const manager = new MarkdownManager({ extensions });
const docOf = (markdown: string) => schema.nodeFromJSON(manager.parse(markdown));

// The document range of the `nth` place that holds `text`.
const rangeOf = (markdown: string, text: string, nth = 0) => {
	const index = docText(docOf(markdown))
		.text.split(text)
		.slice(0, nth + 1)
		.join(text).length;
	const { positions } = docText(docOf(markdown));
	return { from: positions[index]!, to: positions[index + text.length - 1]! + 1 };
};

test("reads the text of a document with one newline between blocks", () => {
	const doc = docOf("# Plan\n\nThe **first** line.\n\n- one\n- two\n");
	const { text, positions } = docText(doc);
	expect(text).toBe("Plan\nThe first line.\none\ntwo");
	expect(positions).toHaveLength(text.length);
	expect(doc.textBetween(positions[5]!, positions[7]! + 1)).toBe("The");
});

test("anchors part of a line with the text around it, and finds it again", () => {
	const markdown = "The first line.\n\nThe second line holds a claim.\n";
	const text = docText(docOf(markdown));
	const range = rangeOf(markdown, "second line");
	const anchor = anchorOf(text, range);
	expect(anchor).toEqual({ quote: "second line", prefix: "The first line.\nThe ", suffix: " holds a claim." });
	expect(findAnchor(text, anchor!, false)).toEqual(range);
});

test("drops the block edges from a selection over several blocks", () => {
	const markdown = "One.\n\nTwo.\n\nThree.\n";
	const { text, positions } = docText(docOf(markdown));
	const anchor = anchorOf({ text, positions }, { from: positions[0]!, to: positions[text.indexOf("Three")]! });
	expect(anchor).toMatchObject({ quote: "One.\nTwo.", prefix: "", suffix: "\nThree." });
	expect(anchorOf({ text, positions }, { from: positions[4]!, to: positions[5]! })).toBeNull();
});

test("finds the quote after text moves, and picks the place whose context still matches", () => {
	const anchor = anchorOf(
		docText(docOf("Pick a plan.\n\nThe plan is late.\n")),
		rangeOf("Pick a plan.\n\nThe plan is late.\n", "plan", 1),
	);
	const moved = "A new first block.\n\nPick a plan.\n\nThe plan is late.\n";
	expect(findAnchor(docText(docOf(moved)), anchor!, false)).toEqual(rangeOf(moved, "plan", 1));
	expect(findAnchor(docText(docOf("Pick a plan.\n\nThe plan was late.\n")), anchor!, false)).toEqual(
		rangeOf("Pick a plan.\n\nThe plan was late.\n", "plan", 1),
	);
});

test("finds no place for a changed quote, and an exact search needs the whole context", () => {
	const markdown = "The second line holds a claim.\n";
	const anchor = anchorOf(docText(docOf(markdown)), rangeOf(markdown, "second line"))!;
	expect(findAnchor(docText(docOf("The 2nd line holds a claim.\n")), anchor, false)).toBeNull();
	expect(findAnchor(docText(docOf("The second line holds no claim.\n")), anchor, true)).toBeNull();
	expect(findAnchor(docText(docOf(markdown)), anchor, true)).toEqual(rangeOf(markdown, "second line"));
});
