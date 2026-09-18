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
	results: "Tickets",
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

export const paletteItems: readonly PaletteItemDef[] = [
	{ id: "ticket.status", label: "Change status", section: "ticket", shortcutId: "listStatus", submenu: true },
	{ id: "ticket.priority", label: "Set priority", section: "ticket", shortcutId: "listPriority", submenu: true },
	{ id: "ticket.project", label: "Move to project", section: "ticket", shortcutId: "listProject", submenu: true },
	{ id: "ticket.parent", label: "Set parent", section: "ticket", shortcutId: "listParent", submenu: true },
	{ id: "ticket.subTicket", label: "New sub-ticket", section: "ticket" },
	{ id: "ticket.copyId", label: "Copy ID", section: "ticket", shortcutId: "ticketCopyId" },
	{ id: "ticket.copyBranch", label: "Copy branch name", section: "ticket", shortcutId: "ticketCopyBranch" },
	{ id: "ticket.copyBrief", label: "Copy agent brief", section: "ticket", shortcutId: "ticketCopyBrief" },
	{ id: "ticket.copyLink", label: "Copy link", section: "ticket", shortcutId: "ticketCopyLink" },
	{ id: "ticket.open", label: "Open ticket", section: "ticket", shortcutId: "listOpen" },
	{ id: "ticket.delete", label: "Delete", section: "ticket", shortcutId: "listDelete" },
	{ id: "selection.status", label: "Change status", section: "selection", submenu: true },
	{ id: "selection.priority", label: "Set priority", section: "selection", submenu: true },
	{ id: "selection.project", label: "Move to project", section: "selection", submenu: true },
	{ id: "selection.delete", label: "Delete", section: "selection" },
	{ id: "create.ticket", label: "New ticket", section: "create", shortcutId: "create" },
	{ id: "create.project", label: "New project", section: "create" },
	{ id: "create.subProject", label: "New sub-project", section: "create" },
	{ id: "goto.needsYou", label: "Needs you", section: "goto", shortcutId: "gotoNeedsYou" },
	{ id: "goto.board", label: "Board", section: "goto", shortcutId: "gotoBoard" },
	{ id: "goto.table", label: "Table", section: "goto", shortcutId: "gotoTable" },
	{ id: "goto.diffs", label: "Diffs", section: "goto" },
	{ id: "goto.usage", label: "Usage", section: "goto" },
	{ id: "goto.settings", label: "Settings", section: "goto" },
	{ id: "goto.project", label: "Go to project…", section: "goto", shortcutId: "gotoProject", submenu: true },
	{ id: "view.filter", label: "Filter by", section: "view", shortcutId: "gotoFilters" },
	{ id: "view.sort", label: "Sort by", section: "view", submenu: true },
	{ id: "view.group", label: "Group by", section: "view", submenu: true },
	{ id: "view.density", label: "Toggle density", section: "view" },
	{ id: "view.theme", label: "Toggle theme", section: "view", shortcutId: "toggleTheme" },
	{ id: "view.sidebar", label: "Toggle sidebar", section: "view", shortcutId: "toggleSidebar" },
];

export const itemsOfSection = (section: PaletteSection): PaletteItemDef[] =>
	paletteItems.filter((item) => item.section === section);
