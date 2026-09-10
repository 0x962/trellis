import { useHotkey } from "@trellis/ui";
import { uiActions } from "../stores/uiStore";

// The keydown events that already toggled the sidebar. The Sidebar and the
// global HotkeyScope both bind `[`, so one keydown reaches two handlers;
// the set makes the second one a no-op.
const handled = new WeakSet<KeyboardEvent>();

export const toggleSidebarOnce = (event: KeyboardEvent) => {
	if (handled.has(event)) return;
	handled.add(event);
	uiActions.toggleSidebar();
};

// A focused board card moves one column to the left on `[`. A keydown from
// inside the board (`data-board`) belongs to the board, so the sidebar
// ignores it.
const fromBoard = (event: KeyboardEvent) =>
	event.target instanceof Element && event.target.closest("[data-board]") !== null;

// `[` collapses and restores the sidebar, except on a keydown from a board.
export const useSidebarHotkey = () =>
	useHotkey("[", (event) => {
		if (fromBoard(event)) return;
		toggleSidebarOnce(event);
	});
