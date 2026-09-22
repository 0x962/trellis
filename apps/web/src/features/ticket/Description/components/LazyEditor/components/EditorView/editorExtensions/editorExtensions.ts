import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { FileHandler } from "@tiptap/extension-file-handler";
import { Image } from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder, Selection } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import type { Extensions } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { createLowlight } from "lowlight";
import { editorHost } from "../../../editorHost";
import { SlashMenu } from "../../SlashMenu";

// The languages a code block colors. Each grammar also registers its short
// names, so a fence of `ts`, `sh`, `html` or `yml` colors too. A fence in any
// other language stays plain text.
const lowlight = createLowlight({
	bash,
	css,
	diff,
	go,
	javascript,
	json,
	markdown,
	python,
	rust,
	sql,
	typescript,
	xml,
	yaml,
});

// The document of every editor is GitHub-flavored markdown, because agents
// read it as text and `ReadOnlyMarkdown` draws it with marked. So each
// extension here reads and writes plain GFM. StarterKit leaves out
// underline, because GFM has no underline and the markdown extension writes
// it as `++text++`.
export const editorExtensions = (): Extensions => [
	StarterKit.configure({
		codeBlock: false,
		underline: false,
		link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
		dropcursor: { color: "var(--accent)", width: 2 },
	}),
	TaskList,
	// The node view of a task item draws its `li` without the data-type
	// attribute that its HTML output carries. `.markdown` in app.css lays a
	// task item out by that attribute.
	TaskItem.configure({ nested: true, HTMLAttributes: { "data-type": "taskItem" } }),
	TableKit.configure({ table: { resizable: false } }),
	Image,
	CodeBlockLowlight.configure({ lowlight }),
	Markdown,
	// Keeps the selected text marked while focus sits in the link field of
	// the format menu.
	Selection,
	Placeholder.configure({
		placeholder: ({ editor, node }) => {
			if (node.type.name === "heading") return `Heading ${node.attrs.level}`;
			if (editor.isEmpty) return editorHost.get().placeholder;
			return "Press / for blocks";
		},
	}),
	FileHandler.configure({
		consumePasteEvent: true,
		onPaste: (_editor, files) => editorHost.get().attachFiles(files),
		onDrop: (editor, files, position) => {
			editor.commands.setTextSelection(position);
			editorHost.get().attachFiles(files);
		},
	}),
	SlashMenu,
];
