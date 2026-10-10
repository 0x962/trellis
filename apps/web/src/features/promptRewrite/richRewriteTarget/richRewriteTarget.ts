import type { Editor, JSONContent } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { TextSelection } from "@tiptap/pm/state";
import { registerRewriteTarget } from "../rewriteTarget";

export function registerRichRewriteTarget(editor: Editor, format: "markdown" | "plain") {
	let mounted = true;
	let revision = 0;
	const update = ({ transaction }: { transaction: { docChanged: boolean } }) => {
		if (transaction.docChanged) revision += 1;
	};
	editor.on("transaction", update);
	const element = editor.view.dom;
	const remove = registerRewriteTarget(element, {
		selectAll: () => editor.isEditable && editor.commands.selectAll(),
		capture: () => {
			const { doc, selection } = editor.state;
			const capturedRevision = revision;
			if (!editor.isEditable || selection.empty || selection.from > 1 || selection.to < doc.content.size - 1)
				return null;
			const text = format === "markdown" ? editor.getMarkdown() : doc.textContent;
			if (!text.trim()) return null;
			const current = () => mounted && !editor.isDestroyed && element.isConnected && editor.isEditable;
			return {
				element,
				text,
				valid: () =>
					current() &&
					revision === capturedRevision &&
					editor.state.doc === doc &&
					editor.isFocused &&
					editor.state.selection.eq(selection),
				insertKey: () => {
					if (current() && editor.state.doc === doc) {
						const transaction = editor.state.tr.insertText("l", selection.from, selection.to);
						const end = transaction.mapping.map(selection.to, -1);
						transaction.setSelection(TextSelection.near(transaction.doc.resolve(end), -1));
						editor.view.dispatch(transaction);
					}
				},
				replace: (value: string) => {
					editor.view.dispatch(closeHistory(editor.state.tr));
					if (format === "markdown") editor.commands.setContent(value, { contentType: "markdown" });
					else {
						const content: JSONContent = {
							type: "doc",
							content: [{ type: "prompt", content: [{ type: "text", text: value }] }],
						};
						editor.commands.setContent(content);
					}
					const result = editor.state.doc;
					const resultRevision = revision;
					editor.view.dispatch(closeHistory(editor.state.tr));
					return () => {
						if (!current() || revision !== resultRevision || editor.state.doc !== result) return false;
						return editor.commands.undo();
					};
				},
			};
		},
	});
	return () => {
		mounted = false;
		editor.off("transaction", update);
		remove();
	};
}
