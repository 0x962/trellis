import { Extension } from "@tiptap/react";

// The characters that start a bullet in markdown.
const markers = new Set(["-", "*", "+"]);

// Inside a list item, "- " at the start of the text is a bullet marker, and
// the item is a bullet already. Without this rule the dash stays as text,
// and the saved markdown reads "- - two". Space after a lone marker at the
// start of a list item deletes the marker and types no space.
export const ListDash = Extension.create({
	name: "listDash",
	addKeyboardShortcuts() {
		return {
			Space: ({ editor }) => {
				const { $from, empty } = editor.state.selection;
				if (!empty || $from.depth < 2) return false;
				const inItem = $from.node(-1).type.name === "listItem";
				const text = $from.parent.textContent;
				if (!inItem || $from.parentOffset !== 1 || !markers.has(text)) return false;
				editor.view.dispatch(editor.state.tr.delete($from.start(), $from.pos));
				return true;
			},
		};
	},
});
