import type { Editor, Range } from "@tiptap/react";
import { editorHost } from "../../editorHost";

export type Block = {
	id: string;
	label: string;
	// The markdown that makes the same block as you type, shown beside the label.
	hint: string;
	run: (editor: Editor, range: Range) => void;
	// A block with this check shows only where it can run, such as a table
	// row inside a table.
	available?: (editor: Editor) => boolean;
};

const chain = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range);

const inTable = (editor: Editor) => editor.isActive("table");

// The blocks the slash menu inserts, in menu order.
export const blocks: readonly Block[] = [
	{ id: "text", label: "Text", hint: "", run: (editor, range) => chain(editor, range).setParagraph().run() },
	{
		id: "h1",
		label: "Heading 1",
		hint: "#",
		run: (editor, range) => chain(editor, range).setNode("heading", { level: 1 }).run(),
	},
	{
		id: "h2",
		label: "Heading 2",
		hint: "##",
		run: (editor, range) => chain(editor, range).setNode("heading", { level: 2 }).run(),
	},
	{
		id: "h3",
		label: "Heading 3",
		hint: "###",
		run: (editor, range) => chain(editor, range).setNode("heading", { level: 3 }).run(),
	},
	{
		id: "bullets",
		label: "Bullet list",
		hint: "-",
		run: (editor, range) => chain(editor, range).toggleBulletList().run(),
	},
	{
		id: "numbers",
		label: "Numbered list",
		hint: "1.",
		run: (editor, range) => chain(editor, range).toggleOrderedList().run(),
	},
	{ id: "tasks", label: "Checklist", hint: "[ ]", run: (editor, range) => chain(editor, range).toggleTaskList().run() },
	{ id: "quote", label: "Quote", hint: ">", run: (editor, range) => chain(editor, range).setBlockquote().run() },
	{ id: "code", label: "Code block", hint: "```", run: (editor, range) => chain(editor, range).setCodeBlock().run() },
	{
		id: "table",
		label: "Table",
		hint: "",
		run: (editor, range) => chain(editor, range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
		available: (editor) => !inTable(editor),
	},
	{
		id: "image",
		label: "Image",
		hint: "",
		run: (editor, range) => {
			chain(editor, range).run();
			editorHost.get().pickFiles();
		},
	},
	{ id: "rule", label: "Divider", hint: "---", run: (editor, range) => chain(editor, range).setHorizontalRule().run() },
	{
		id: "row-below",
		label: "Row below",
		hint: "",
		run: (editor, range) => chain(editor, range).addRowAfter().run(),
		available: inTable,
	},
	{
		id: "column-right",
		label: "Column right",
		hint: "",
		run: (editor, range) => chain(editor, range).addColumnAfter().run(),
		available: inTable,
	},
	{
		id: "delete-row",
		label: "Delete row",
		hint: "",
		run: (editor, range) => chain(editor, range).deleteRow().run(),
		available: inTable,
	},
	{
		id: "delete-column",
		label: "Delete column",
		hint: "",
		run: (editor, range) => chain(editor, range).deleteColumn().run(),
		available: inTable,
	},
	{
		id: "delete-table",
		label: "Delete table",
		hint: "",
		run: (editor, range) => chain(editor, range).deleteTable().run(),
		available: inTable,
	},
];

// The blocks whose label holds `query` and that can run at the caret.
export const matchingBlocks = (editor: Editor, query: string): Block[] =>
	blocks.filter(
		(block) =>
			block.label.toLowerCase().includes(query.toLowerCase()) &&
			(block.available === undefined || block.available(editor)),
	);
