import type { ProjectSummary, Ticket } from "@trellis/api";
import type { ReactNode } from "react";
import { currentPlatform, formatShortcut, shortcutById } from "../../lib/shortcuts";
import type { ActionContext } from "./actions";
import type { PaletteItemDef } from "./items";

// The shape the palette draws. A section builder returns these rows, and
// the panel turns each one into a Command row.

export type PaletteRow = {
	// The value of the option. An item row carries its item id and a ticket
	// row carries its identifier, so a test and a person read the same name.
	value: string;
	label: string;
	// Draws the label in mono, for a row whose label is a ticket title.
	labelMono?: boolean;
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
	run: () => void;
};

export type PaletteGroup = {
	id: string;
	heading: ReactNode;
	rows: PaletteRow[];
};

// The list a submenu shows and the tickets its pick writes to.
export type Submenu =
	| { kind: "status"; tickets: string[]; project: string }
	| { kind: "priority"; tickets: string[] }
	| { kind: "project"; tickets: string[] }
	| { kind: "parent"; ticket: string; project: string }
	| { kind: "sort" }
	| { kind: "group" }
	| { kind: "goto" };

export type RowDeps = {
	action: ActionContext;
	// The ticket in context, once tickets.get answers.
	ticket: Ticket | undefined;
	// The identifier of the ticket in context.
	identifier: string | null;
	selection: string[];
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
