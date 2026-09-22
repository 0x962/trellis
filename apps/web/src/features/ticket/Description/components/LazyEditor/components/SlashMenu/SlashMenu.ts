import { Extension } from "@tiptap/react";
import { Suggestion, type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import { create } from "zustand";
import { type Block, matchingBlocks } from "./blocks";

type MenuState = {
	open: boolean;
	items: readonly Block[];
	highlighted: number;
	// Where the menu sits: under the caret.
	left: number;
	top: number;
	pick: (block: Block) => void;
};

const closed: MenuState = { open: false, items: [], highlighted: 0, left: 0, top: 0, pick: () => {} };

// What the menu shows. The ProseMirror plugin writes it; the React list
// reads it.
export const useSlashMenuStore = create<MenuState>()(() => closed);

const show = (props: SuggestionProps<Block>) => {
	const rect = props.clientRect?.();
	useSlashMenuStore.setState({
		open: true,
		items: props.items,
		highlighted: 0,
		left: rect?.left ?? 0,
		top: rect?.bottom ?? 0,
		pick: (block) => props.command(block),
	});
};

const onKeyDown = ({ event }: SuggestionKeyDownProps) => {
	const state = useSlashMenuStore.getState();
	if (!state.open) return false;
	if (event.key === "ArrowDown") {
		useSlashMenuStore.setState({ highlighted: (state.highlighted + 1) % state.items.length });
		return true;
	}
	if (event.key === "ArrowUp") {
		useSlashMenuStore.setState({ highlighted: (state.highlighted - 1 + state.items.length) % state.items.length });
		return true;
	}
	if (event.key === "Enter") {
		const block = state.items[state.highlighted];
		if (block !== undefined) state.pick(block);
		return true;
	}
	if (event.key === "Escape") {
		useSlashMenuStore.setState(closed);
		return true;
	}
	return false;
};

// `/` opens the block menu at the caret. The typed text after the slash
// filters the blocks; Enter or a click inserts one.
export const SlashMenu = Extension.create({
	name: "slashMenu",
	addProseMirrorPlugins() {
		return [
			Suggestion<Block>({
				editor: this.editor,
				char: "/",
				items: ({ editor, query }) => matchingBlocks(editor, query),
				command: ({ editor, range, props }) => props.run(editor, range),
				render: () => ({
					onStart: show,
					onUpdate: show,
					onKeyDown,
					onExit: () => useSlashMenuStore.setState(closed),
				}),
			}),
		];
	},
});
