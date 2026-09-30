import { Extension, type JSONContent, Node } from "@tiptap/core";
import { UndoRedo } from "@tiptap/extensions";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { promptVariables } from "@trellis/api";

const Document = Node.create({ name: "doc", topNode: true, content: "prompt" });
const Text = Node.create({ name: "text", group: "inline" });
const Prompt = Node.create({
	name: "prompt",
	content: "text*",
	marks: "",
	code: true,
	whitespace: "pre",
	parseHTML: () => [{ tag: "pre", preserveWhitespace: "full" }],
	renderHTML: () => ["pre", ["code", 0]],
	addKeyboardShortcuts() {
		const newline = () =>
			this.editor.commands.command(({ tr, dispatch }) => {
				if (dispatch) tr.insertText("\n");
				return true;
			});
		return { Enter: newline, "Shift-Enter": newline };
	},
});

export const promptDocument = (text: string): JSONContent => ({
	type: "doc",
	content: [{ type: "prompt", content: text.length ? [{ type: "text", text }] : [] }],
});

export const promptExtensions = (variables: readonly string[]) => [
	Document,
	Text,
	Prompt,
	UndoRedo,
	Extension.create({
		name: "promptVariables",
		addProseMirrorPlugins: () => [
			new Plugin({
				props: {
					decorations: ({ doc }) =>
						DecorationSet.create(
							doc,
							promptVariables(doc.textContent).map(({ name, from, to }) =>
								Decoration.inline(from + 1, to + 1, {
									class: variables.includes(name) ? "prompt-variable" : "prompt-variable-invalid",
									title: variables.includes(name) ? name : `Unknown variable: ${name}`,
								}),
							),
						),
				},
			}),
		],
	}),
];
