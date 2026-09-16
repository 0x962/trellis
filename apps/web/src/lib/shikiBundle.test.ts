import { expect, test } from "bun:test";
import { createHighlighter } from "./shikiBundle";

test("the plain text highlighter applies line and container transforms", async () => {
	const highlighter = await createHighlighter({ langs: [], themes: [] });
	const root = highlighter.codeToHast("one\ntwo", {
		transformers: [
			{
				line(node, line) {
					node.properties.line = line;
				},
				pre(node) {
					node.properties.ready = true;
				},
			},
		],
	});
	const pre = root.children[0]!;
	const code = pre.children[0]!;
	expect(pre.properties.ready).toBe(true);
	if (!("children" in code)) throw new Error("The highlighter did not create a code element.");
	expect(code.children.map((line) => ("properties" in line ? line.properties.line : undefined))).toEqual([1, 2]);
});

test("the plain text highlighter preserves diff span decorations", async () => {
	const highlighter = await createHighlighter({ langs: [], themes: [] });
	const root = highlighter.codeToHast("one two", {
		decorations: [
			{
				start: { line: 0, character: 4 },
				end: { line: 0, character: 7 },
				properties: { "data-diff-span": "" },
			},
		],
	});
	const code = root.children[0]!.children[0]!;
	if (!("children" in code)) throw new Error("The highlighter did not create a code element.");
	const line = code.children[0]!;
	if (!("children" in line)) throw new Error("The highlighter did not create a line element.");
	expect(line.children).toEqual([
		{ type: "text", value: "one " },
		{
			type: "element",
			tagName: "span",
			properties: { "data-diff-span": "" },
			children: [{ type: "text", value: "two" }],
		},
	]);
});
