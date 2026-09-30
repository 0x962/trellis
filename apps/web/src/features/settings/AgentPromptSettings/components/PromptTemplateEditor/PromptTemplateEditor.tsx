import { EditorContent, useEditor } from "@tiptap/react";
import { type AriaAttributes, type Ref, useEffect, useImperativeHandle } from "react";
import { promptDocument, promptExtensions } from "./promptDocument";

export type PromptTemplateEditorHandle = { insertVariable: (name: string) => void };

type Props = AriaAttributes & {
	ref?: Ref<PromptTemplateEditorHandle>;
	id?: string;
	value: string;
	variables: string[];
	onChange: (value: string) => void;
	disabled?: boolean;
};

export function PromptTemplateEditor({ ref, id, value, variables, onChange, disabled = false, ...aria }: Props) {
	const editor = useEditor({
		extensions: promptExtensions(variables),
		content: promptDocument(value),
		editable: !disabled,
		immediatelyRender: false,
		onUpdate: ({ editor: instance }) => onChange(instance.state.doc.textContent),
		editorProps: {
			attributes: {
				class: "prompt-template-input",
				role: "textbox",
				"aria-multiline": "true",
				"aria-disabled": String(disabled),
				...(id ? { id } : {}),
				...Object.fromEntries(
					Object.entries(aria)
						.filter(([, entry]) => entry !== undefined)
						.map(([key, entry]) => [key, String(entry)]),
				),
				spellcheck: "false",
			},
			handlePaste: (view, event) => {
				const text = event.clipboardData!.getData("text/plain");
				view.dispatch(view.state.tr.insertText(text));
				return true;
			},
		},
	});
	useEffect(() => {
		if (editor && editor.state.doc.textContent !== value)
			editor.commands.setContent(promptDocument(value), { emitUpdate: false });
	}, [editor, value]);
	useEffect(() => {
		editor?.setEditable(!disabled, false);
	}, [editor, disabled]);
	useImperativeHandle(
		ref,
		() => ({
			insertVariable: (name) =>
				editor
					?.chain()
					.focus()
					.insertContent({ type: "text", text: `{{${name}}}` })
					.run(),
		}),
		[editor],
	);
	return <EditorContent editor={editor} className="prompt-template-editor" />;
}
