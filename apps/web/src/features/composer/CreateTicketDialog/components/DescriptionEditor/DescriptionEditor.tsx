import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ListDash } from "./utils/listDash";

export type DescriptionEditorProps = {
	// The markdown the editor starts with.
	markdown: string;
	onChange: (markdown: string) => void;
};

// The Tiptap editor over the description, markdown in and markdown out.
// It takes focus on mount, because the read-only view hands over to it.
export function DescriptionEditor({ markdown, onChange }: DescriptionEditorProps) {
	const editor = useEditor({
		extensions: [StarterKit, Markdown, ListDash],
		content: markdown,
		contentType: "markdown",
		autofocus: "end",
		onUpdate: ({ editor: instance }) => onChange(instance.getMarkdown()),
		editorProps: { attributes: { class: "markdown min-h-20 outline-none", "aria-label": "Description" } },
	});
	return <EditorContent editor={editor} />;
}
