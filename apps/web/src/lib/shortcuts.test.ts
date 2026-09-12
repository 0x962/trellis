import { describe, expect, test } from "bun:test";
import { paletteItems } from "../features/command/items";
import { formatShortcut, shortcutById, shortcutScopes, shortcuts } from "./shortcuts";

// The keyboard map the README documents, one entry per row, as
// `<keys>@<scope>`. A row that names several surfaces takes the surface that
// owns the key; the other surfaces reach it by delegation.
const planRows = [
	"mod+k@global",
	"/@global",
	"c@global",
	"?@global",
	"g h@global",
	"g a@global",
	"g p@global",
	"g b@global",
	"g t@global",
	"g s@global",
	"[@global",
	"mod+\\@global",
	"escape@global",
	"j@list",
	"k@list",
	"up@list",
	"down@list",
	"enter@list",
	"space@list",
	"o@list",
	"x@list",
	"shift+j@list",
	"shift+k@list",
	"s@list",
	"p@list",
	"shift+p@list",
	"m@list",
	"backspace@list",
	"1-9@list",
	"[@board",
	"]@board",
	"e@ticket",
	"shift+c@ticket",
	"mod+c@ticket",
	"mod+shift+c@ticket",
	"mod+.@ticket",
	"mod+shift+b@ticket",
	"mod+enter@composer",
	"mod+shift+enter@composer",
];

const rowKey = (shortcut: { keys: string; scope: string }) => `${shortcut.keys}@${shortcut.scope}`;

describe("lib/shortcuts", () => {
	// SM-01
	test("the map holds every key of the plan and no other", () => {
		expect(shortcuts.map(rowKey).sort()).toEqual([...planRows].sort());
	});

	// SM-02
	test("no key repeats inside one scope", () => {
		const rows = shortcuts.map(rowKey);
		expect(rows).toHaveLength(new Set(rows).size);
		expect(rows.length).toBeGreaterThan(30);
	});

	// SM-03
	test("every row carries a known scope", () => {
		expect(shortcutScopes).toEqual(["global", "list", "board", "ticket", "composer"]);
		for (const shortcut of shortcuts) {
			expect(shortcutScopes, shortcut.id).toContain(shortcut.scope);
		}
		expect(shortcuts.length).toBeGreaterThan(30);
	});

	// SM-04. `mod` is Command on a Mac and Control everywhere else, so one
	// row serves every platform.
	test("formatShortcut writes the command symbol on a Mac and Ctrl elsewhere", () => {
		expect(formatShortcut("mod+k", "mac")).toEqual(["⌘", "K"]);
		expect(formatShortcut("mod+k", "other")).toEqual(["Ctrl", "K"]);
		expect(formatShortcut("g h", "mac")).toEqual(["g", "h"]);
	});

	// SM-05. A palette item prints the key of its map row, so an item can
	// never invent a key of its own.
	test("every palette item shortcut resolves to a map row", () => {
		expect(paletteItems.length).toBeGreaterThan(20);
		for (const item of paletteItems) {
			if (item.shortcutId === undefined) continue;
			expect(shortcutById(item.shortcutId), item.id).toBeDefined();
		}
		expect(paletteItems.some((item) => item.shortcutId !== undefined)).toBe(true);
	});
});
