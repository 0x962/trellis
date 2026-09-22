import { describe, expect, test } from "bun:test";
import { getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { editorExtensions } from "./editorExtensions";

// A document with every block the slash menu and the markdown shortcuts make.
const document = `# Plan

Some **bold**, *italic*, ~~struck~~ and \`code\` text with [a link](https://example.com).

## Steps

- one
- two

1. first
2. second

- [ ] open task
- [x] done task

> A quote.

\`\`\`ts
const answer = 42;
\`\`\`

| Name | Owner |
| --- | --- |
| Setup | navid |

![welcome.png](/api/blobs/abc/welcome.png)

---

The end.
`;

const manager = () => new MarkdownManager({ extensions: editorExtensions() });

const nodeTypes = (json: { type?: string; content?: unknown[] }): string[] => [
	json.type!,
	...(json.content ?? []).flatMap((child) => nodeTypes(child as { type?: string; content?: unknown[] })),
];

describe("editorExtensions", () => {
	test("reads every block of a document into its own node", () => {
		const types = new Set(nodeTypes(manager().parse(document)));

		for (const type of [
			"heading",
			"bulletList",
			"orderedList",
			"taskList",
			"taskItem",
			"blockquote",
			"codeBlock",
			"table",
			"tableHeader",
			"tableCell",
			"image",
			"horizontalRule",
		]) {
			expect(types).toContain(type);
		}
	});

	test("writes a document back to markdown that reads to the same nodes", () => {
		const first = manager().parse(document);
		const written = manager().serialize(first);

		expect(manager().parse(written)).toEqual(first);
		expect(written).toContain("```ts\nconst answer = 42;\n```");
		expect(written).toContain("- [x] done task");
		expect(written).toContain("![welcome.png](/api/blobs/abc/welcome.png)");
		expect(written).toMatch(/\| Setup +\| navid +\|/);
	});

	test("holds no underline mark, because GFM has none", () => {
		const marks = Object.keys(getSchema(editorExtensions()).marks);

		expect(marks).toContain("bold");
		expect(marks).not.toContain("underline");
	});
});
