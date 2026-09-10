// The palette items the sections draw. A project row, a pull request row,
// and a search result are built from data; every other item is here.

// The sections in the order the palette draws them.
export type PaletteSection = "ticket" | "selection" | "create" | "goto" | "view" | "results";

export const paletteSections: readonly PaletteSection[] = ["ticket", "selection", "create", "goto", "view", "results"];

export const sectionHeadings: Record<PaletteSection, string> = {
	ticket: "This ticket",
	selection: "Selection",
	create: "Create",
	goto: "Go to",
	view: "View",
	results: "Search results",
};

export type PaletteItemDef = {
	id: string;
	label: string;
	section: PaletteSection;
	// The row of the shortcut map the item prints on its right.
	shortcutId?: string;
	// The item opens a list of values instead of running at once.
	submenu?: boolean;
};

export const paletteItems: readonly PaletteItemDef[] = [];
