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

// `[` collapses and restores the sidebar.
export const useSidebarHotkey = () => useHotkey("[", toggleSidebarOnce);
