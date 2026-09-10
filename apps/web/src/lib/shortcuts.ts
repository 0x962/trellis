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

export const shortcuts: readonly Shortcut[] = [];

export const shortcutById = (id: string): Shortcut | undefined => shortcuts.find((shortcut) => shortcut.id === id);

export type Platform = "mac" | "other";

// The platform this page runs on. A Mac prints the command symbol.
export const currentPlatform = (): Platform => "other";

// The key caps of one shortcut, in press order: `["⌘", "K"]`, `["g", "h"]`.
export const formatShortcut = (_keys: string, _platform: Platform): string[] => [];
