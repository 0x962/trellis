import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";
import { useRewriteEditor } from "../../features/promptRewrite/useRewriteEditor";
import { ListDash } from "./utils/listDash";

export type MarkdownEditorProps = {
	// The markdown the editor starts with.
	markdown: string;
	autofocus?: boolean;
	label?: string;
	disabled?: boolean;
	onChange: (markdown: string) => void;
};

// Markdown enters and leaves the editor without a separate document format.
export function MarkdownEditor({
	markdown,
	onChange,
	autofocus = true,
	label = "Description",
	disabled = false,
}: MarkdownEditorProps) {
	const editor = useEditor({
		extensions: [StarterKit, Markdown, ListDash],
		content: markdown,
		contentType: "markdown",
		editable: !disabled,
		autofocus: autofocus ? "end" : false,
		onUpdate: ({ editor: instance }) => onChange(instance.getMarkdown()),
		editorProps: {
			attributes: {
				class: "markdown min-h-20 outline-none",
				"aria-label": label,
				role: "textbox",
				"aria-multiline": "true",
			},
		},
	});
	useRewriteEditor(editor, "markdown");
	useEffect(() => {
		editor?.setEditable(!disabled, false);
	}, [editor, disabled]);
	return <EditorContent editor={editor} />;
}
