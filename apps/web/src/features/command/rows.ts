import type { ProjectSummary, Ticket, TicketSummary } from "@trellis/api";
import type { ReactNode } from "react";
import { currentPlatform, formatShortcut, shortcutById } from "../../lib/shortcuts";
import type { BulkWrite } from "../table/hooks/useBulkWrite";
import type { ActionContext } from "./actions";
import type { SelectionOwner } from "./commandStore";
import type { PaletteItemDef } from "./items";

// The shape the palette draws. A section builder returns these rows, and
// the panel turns each one into a Command row.

export type PaletteRow = {
	// The value of the option. An item row carries its item id and a ticket
	// row carries its identifier, so a test and a person read the same name.
	value: string;
	label: string;
	// Muted text after the label: the current status, a project path.
	sub?: string;
	mono?: boolean;
	// Faint mono text before the label, such as a ticket ID.
	prefix?: string;
	// A node before the label in place of the icon, such as a key badge.
	leading?: ReactNode;
	keys?: string[];
	icon?: ReactNode;
	keywords?: string[];
	// The state of a value the row belongs to: true when every ticket the
	// submenu writes to holds it, "mixed" when some do and some do not.
	checked?: boolean | "mixed";
	run: () => void;
};

export type PaletteGroup = {
	id: string;
	heading: ReactNode;
	rows: PaletteRow[];
};

// The list a submenu shows and the tickets its pick writes to. `tickets`
// holds one identifier when the This ticket section opened the submenu, and
// every selected identifier when the Selection section opened it. The rows
// behind those identifiers are `RowDeps.selection`.
//
// The Selection section sets `bulk`. A pick then writes through
// `RowDeps.bulk`, which patches the rows in the cache, asks before a large
// write, and reports what it changed. A selection of one row sets `bulk` as
// well, so one rule covers every selection size.
export type Submenu =
	| { kind: "status"; tickets: string[]; project: string; bulk?: true }
	| { kind: "priority"; tickets: string[]; bulk?: true }
	| { kind: "project"; tickets: string[]; bulk?: true }
	| { kind: "parent"; tickets: string[]; project: string; bulk?: true }
	| { kind: "epic"; tickets: string[]; project: string; bulk?: true }
	// `epic` is the ref of the epic every ticket of the submenu belongs to.
	// The submenu lists the milestones of that epic.
	| { kind: "milestone"; tickets: string[]; epic: string; bulk: true }
	// `checked` names the labels that every ticket of the submenu holds, and
	// `mixed` names the labels that some hold and some do not. A pick on a
	// checked label removes it everywhere. A pick on any other label, mixed
	// or not, adds it everywhere.
	| { kind: "labels"; tickets: string[]; project: string; checked: string[]; mixed: string[]; bulk?: true }
	| { kind: "sort" }
	| { kind: "group" }
	| { kind: "goto" };

export type RowDeps = {
	action: ActionContext;
	// The ticket in context, once tickets.get answers.
	ticket: Ticket | undefined;
	// The identifier of the ticket in context.
	identifier: string | null;
	// The selected rows of the table or the board, in display order.
	selection: readonly TicketSummary[];
	// The one path every Selection section write takes.
	bulk: BulkWrite;
	// The surface that owns the selection, or null while none is on screen.
	selectionOwner: SelectionOwner | null;
	projects: ProjectSummary[];
	pathname: string;
	search: Record<string, unknown>;
	// The project ref of the route, or null.
	routeProject: string | null;
	openSubmenu: (submenu: Submenu) => void;
	close: () => void;
};

// The key caps an item prints, or nothing when the map gives it no key.
export const capsOf = (item: PaletteItemDef): string[] | undefined => {
	if (item.shortcutId === undefined) return undefined;
	return formatShortcut(shortcutById(item.shortcutId)!.keys, currentPlatform());
};

export const priorityLabels = {
	urgent: "Urgent",
	high: "High",
	medium: "Medium",
	low: "Low",
	none: "None",
} as const;

// The project a status list comes from: the ticket's project, then the
// route's, then the first project. A status is named by its slug, and the
// projects of one root share their slugs.
export const statusProject = (deps: RowDeps): string =>
	deps.ticket?.project.path ?? deps.routeProject ?? deps.projects[0]?.path ?? "";
