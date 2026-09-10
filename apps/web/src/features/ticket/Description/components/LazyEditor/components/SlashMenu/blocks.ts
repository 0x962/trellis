import type { Editor, Range } from "@tiptap/react";

export type Block = {
	id: string;
	label: string;
	run: (editor: Editor, range: Range) => void;
};

const chain = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range);

// The blocks the slash menu inserts, in menu order.
export const blocks: readonly Block[] = [
	{ id: "h1", label: "Heading 1", run: (editor, range) => chain(editor, range).setNode("heading", { level: 1 }).run() },
	{ id: "h2", label: "Heading 2", run: (editor, range) => chain(editor, range).setNode("heading", { level: 2 }).run() },
	{ id: "h3", label: "Heading 3", run: (editor, range) => chain(editor, range).setNode("heading", { level: 3 }).run() },
	{ id: "bullets", label: "Bullet list", run: (editor, range) => chain(editor, range).toggleBulletList().run() },
	{ id: "numbers", label: "Numbered list", run: (editor, range) => chain(editor, range).toggleOrderedList().run() },
	{ id: "tasks", label: "Checklist", run: (editor, range) => chain(editor, range).toggleTaskList().run() },
	{ id: "code", label: "Code block", run: (editor, range) => chain(editor, range).setCodeBlock().run() },
	{ id: "quote", label: "Quote", run: (editor, range) => chain(editor, range).setBlockquote().run() },
	{ id: "rule", label: "Divider", run: (editor, range) => chain(editor, range).setHorizontalRule().run() },
];
