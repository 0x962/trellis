import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ListDash } from "./utils/listDash";

export type DescriptionEditorProps = {
	// The markdown the editor starts with.
	markdown: string;
	autofocus?: boolean;
	onChange: (markdown: string) => void;
};

// Markdown enters and leaves the editor without a separate document format.
export function DescriptionEditor({ markdown, onChange, autofocus = true }: DescriptionEditorProps) {
	const editor = useEditor({
		extensions: [StarterKit, Markdown, ListDash],
		content: markdown,
		contentType: "markdown",
		autofocus: autofocus ? "end" : false,
		onUpdate: ({ editor: instance }) => onChange(instance.getMarkdown()),
		editorProps: {
			attributes: {
				class: "markdown min-h-20 outline-none",
				"aria-label": "Description",
				role: "textbox",
				"aria-multiline": "true",
			},
		},
	});
	return <EditorContent editor={editor} />;
}
