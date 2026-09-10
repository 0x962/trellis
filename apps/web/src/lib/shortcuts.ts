// The one shortcut map. The hotkey registrations, the palette items, and
// the help sheet read their keys from here, so a key exists in one place.

// `global` fires wherever the app is. Every other scope belongs to the
// focused surface: the list, the board, the peek, the ticket page, or the
// composer.
export type ShortcutScope = "global" | "list" | "board" | "peek" | "ticket" | "composer";

export const shortcutScopes: readonly ShortcutScope[] = ["global", "list", "board", "peek", "ticket", "composer"];

export type Shortcut = {
	// The name a palette item and a hotkey registration point at.
	id: string;
	// The keys in press order, lower case: "mod+k", "g h", "shift+p", "1-9".
	// `mod` is Command on a Mac and Control elsewhere.
	keys: string;
	scope: ShortcutScope;
	// The line the help sheet prints.
	label: string;
};

// The rows keep their scope order, because the help sheet groups them in
// the order it reads them.
export const shortcuts: readonly Shortcut[] = [
	{ id: "palette", keys: "mod+k", scope: "global", label: "Open the command palette" },
	{ id: "search", keys: "/", scope: "global", label: "Search tickets" },
	{ id: "create", keys: "c", scope: "global", label: "New ticket" },
	{ id: "help", keys: "?", scope: "global", label: "Show the keyboard shortcuts" },
	{ id: "gotoNeedsYou", keys: "g h", scope: "global", label: "Go to Needs you" },
	{ id: "gotoAll", keys: "g a", scope: "global", label: "Go to All tickets" },
	{ id: "gotoProject", keys: "g p", scope: "global", label: "Go to a project" },
	{ id: "gotoBoard", keys: "g b", scope: "global", label: "Switch to the board" },
	{ id: "gotoTable", keys: "g t", scope: "global", label: "Switch to the table" },
	{ id: "gotoFilters", keys: "g s", scope: "global", label: "Focus the filter bar" },
	{ id: "toggleSidebar", keys: "[", scope: "global", label: "Collapse or open the sidebar" },
	{ id: "toggleTheme", keys: "mod+\\", scope: "global", label: "Switch between dark and light" },
	{ id: "escape", keys: "escape", scope: "global", label: "Close the popover, then the peek, then the selection" },
	{ id: "listDown", keys: "j", scope: "list", label: "Move to the next row" },
	{ id: "listUp", keys: "k", scope: "list", label: "Move to the row above" },
	{ id: "listArrowUp", keys: "up", scope: "list", label: "Move to the row above" },
	{ id: "listArrowDown", keys: "down", scope: "list", label: "Move to the next row" },
	{ id: "listPeek", keys: "enter", scope: "list", label: "Open the peek" },
	{ id: "listPeekSpace", keys: "space", scope: "list", label: "Open the peek" },
	{ id: "listOpen", keys: "o", scope: "list", label: "Open the full page" },
	{ id: "listSelect", keys: "x", scope: "list", label: "Select or clear the row" },
	{ id: "listExtendDown", keys: "shift+j", scope: "list", label: "Extend the selection down" },
	{ id: "listExtendUp", keys: "shift+k", scope: "list", label: "Extend the selection up" },
	{ id: "listStatus", keys: "s", scope: "list", label: "Change the status" },
	{ id: "listPriority", keys: "p", scope: "list", label: "Set the priority" },
	{ id: "listParent", keys: "shift+p", scope: "list", label: "Set the parent" },
	{ id: "listProject", keys: "m", scope: "list", label: "Move to a project" },
	{ id: "listDelete", keys: "backspace", scope: "list", label: "Delete the ticket" },
	{ id: "listGroups", keys: "1-9", scope: "list", label: "Collapse or open the nth group" },
	{ id: "boardPrevious", keys: "[", scope: "board", label: "Move the card to the column on the left" },
	{ id: "boardNext", keys: "]", scope: "board", label: "Move the card to the column on the right" },
	{ id: "ticketApprove", keys: "a", scope: "ticket", label: "Approve the ticket" },
	{ id: "ticketSendBack", keys: "r", scope: "ticket", label: "Send the ticket back" },
	{ id: "ticketEdit", keys: "e", scope: "ticket", label: "Edit the description" },
	{ id: "ticketComment", keys: "shift+c", scope: "ticket", label: "Focus the comment box" },
	{ id: "ticketCopyId", keys: "mod+c", scope: "ticket", label: "Copy the identifier" },
	{ id: "ticketCopyBranch", keys: "mod+shift+c", scope: "ticket", label: "Copy the branch name" },
	{ id: "ticketCopyLink", keys: "mod+.", scope: "ticket", label: "Copy the link" },
	{ id: "ticketStartAgent", keys: "mod+shift+a", scope: "ticket", label: "Start with an agent" },
	{ id: "ticketCopyBrief", keys: "mod+shift+b", scope: "ticket", label: "Copy the agent brief" },
	{ id: "composerSubmit", keys: "mod+enter", scope: "composer", label: "Submit the form" },
	{ id: "composerSubmitAgain", keys: "mod+shift+enter", scope: "composer", label: "Create and start another" },
];

export const shortcutById = (id: string): Shortcut | undefined => shortcuts.find((shortcut) => shortcut.id === id);

export type Platform = "mac" | "other";

// The platform this page runs on. A Mac prints the command symbol.
export const currentPlatform = (): Platform =>
	/mac|iphone|ipad/i.test(navigator.platform) || /macintosh/i.test(navigator.userAgent) ? "mac" : "other";

const macCaps: Record<string, string> = {
	mod: "⌘",
	shift: "⇧",
	alt: "⌥",
	enter: "↵",
	backspace: "⌫",
	escape: "esc",
	up: "↑",
	down: "↓",
	space: "space",
};

const otherCaps: Record<string, string> = {
	...macCaps,
	mod: "Ctrl",
	shift: "Shift",
	alt: "Alt",
	enter: "Enter",
	backspace: "Backspace",
	escape: "Esc",
	space: "Space",
};

// The key caps of one shortcut, in press order: `["⌘", "K"]`, `["g", "h"]`.
// A key held with a modifier prints upper case, because a cap next to ⌘
// reads as a cap.
export const formatShortcut = (keys: string, platform: Platform): string[] => {
	const caps = platform === "mac" ? macCaps : otherCaps;
	const printed: string[] = [];
	for (const chord of keys.split(" ")) {
		const parts = chord.split("+");
		const key = parts[parts.length - 1]!;
		const modifiers = parts.slice(0, -1);
		for (const modifier of modifiers) printed.push(caps[modifier]!);
		printed.push(caps[key] ?? (modifiers.length === 0 ? key : key.toUpperCase()));
	}
	return printed;
};
