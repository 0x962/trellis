import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { Editor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { type ClipboardEvent, useEffect } from "react";
import { SlashMenu, SlashMenuList } from "../SlashMenu";

export const descriptionPlaceholder = "Describe the work. Agents read this verbatim.";

export type EditorHandle = {
	setContent: (markdown: string) => void;
	focus: () => void;
};

export type EditorViewProps = {
	markdown: string;
	// Changes when another ticket opens. The editor takes that ticket's text.
	contentKey: string;
	onChange: (markdown: string) => void;
	onBlur: () => void;
	onReady: (handle: EditorHandle) => void;
	onAttachFiles: (files: File[]) => void;
};

let shared: Editor | null = null;

// One Tiptap instance serves every ticket. A second open sets its content;
// it never builds a second editor. The chunk registry destroys it when the
// last description leaves the screen.
const getEditor = () => {
	if (shared === null) {
		shared = new Editor({
			extensions: [
				StarterKit.configure({ link: { openOnClick: false } }),
				TaskList,
				TaskItem.configure({ nested: true }),
				Markdown,
				Placeholder.configure({ placeholder: descriptionPlaceholder }),
				SlashMenu,
			],
			contentType: "markdown",
			content: "",
			editorProps: {
				attributes: {
					role: "textbox",
					"aria-label": "Description",
					"aria-multiline": "true",
					class: "markdown editor min-h-24 outline-none",
				},
			},
		});
	}
	return shared;
};

// The editors alive now: one after the first open, else none.
export const instances = () => (shared === null ? 0 : 1);

export const destroyEditor = () => {
	shared?.destroy();
	shared = null;
};

const handleOf = (editor: Editor): EditorHandle => ({
	setContent: (markdown) => editor.commands.setContent(markdown, { contentType: "markdown", emitUpdate: false }),
	focus: () => editor.commands.focus("end"),
});

// The shared editor mounted on one description. It takes the ticket's
// markdown, focuses, and reports every change as markdown.
export function EditorView({ markdown, contentKey, onChange, onBlur, onReady, onAttachFiles }: EditorViewProps) {
	const editor = getEditor();
	const onPasteCapture = (event: ClipboardEvent<HTMLDivElement>) => {
		const files = [...event.clipboardData.files];
		if (files.length === 0) return;
		event.preventDefault();
		event.stopPropagation();
		onAttachFiles(files);
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: the content loads once per ticket
	useEffect(() => {
		const handle = handleOf(editor);
		handle.setContent(markdown);
		handle.focus();
		onReady(handle);
	}, [contentKey, editor]);

	useEffect(() => {
		const update = () => onChange(editor.getMarkdown());
		editor.on("update", update);
		editor.on("blur", onBlur);
		return () => {
			editor.off("update", update);
			editor.off("blur", onBlur);
		};
	}, [editor, onChange, onBlur]);

	return (
		<div className="relative" onPasteCapture={onPasteCapture}>
			<EditorContent editor={editor} />
			<SlashMenuList />
		</div>
	);
}
