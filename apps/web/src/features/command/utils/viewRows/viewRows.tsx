import {
	ArrowUpDown,
	CornerDownRight,
	Filter,
	Folder,
	FolderPlus,
	Inbox,
	LayoutGrid,
	List,
	Moon,
	PanelLeft,
	Plus,
	Rows3,
	Settings,
	Table,
} from "lucide-react";
import type { ReactNode } from "react";
import { projectHref } from "../../../../lib/projectPath";
import { toggleTheme } from "../../../../lib/theme";
import { uiActions, useUiStore } from "../../../../stores/uiStore";
import { composerActions } from "../../../composer";
import { itemsOfSection } from "../../items";
import { capsOf, type PaletteRow, type RowDeps } from "../../rows";
import { routeDefaults } from "../routeDefaults";

// The Create, Go to, and View sections. Every row here moves the app or
// the interface; none of them writes a ticket.

const icons: Record<string, ReactNode> = {
	"create.ticket": <Plus />,
	"create.subTicket": <CornerDownRight />,
	"create.project": <FolderPlus />,
	"create.subProject": <FolderPlus />,
	"goto.needsYou": <Inbox />,
	"goto.all": <List />,
	"goto.board": <LayoutGrid />,
	"goto.table": <Table />,
	"goto.settings": <Settings />,
	"view.filter": <Filter />,
	"view.sort": <ArrowUpDown />,
	"view.group": <Rows3 />,
	"view.density": <Rows3 />,
	"view.theme": <Moon />,
	"view.sidebar": <PanelLeft />,
};

const run = (deps: RowDeps, action: () => void) => () => {
	deps.close();
	action();
};

const rowsOf = (section: "create" | "goto" | "view", runs: Record<string, () => void>): PaletteRow[] =>
	itemsOfSection(section)
		.filter((item) => runs[item.id] !== undefined)
		.map((item) => ({
			value: item.id,
			label: item.label,
			keys: capsOf(item),
			icon: icons[item.id],
			run: runs[item.id]!,
		}));

// The project form of the first run is the one place a project is made,
// and a project's own settings page holds its sub-projects. New
// sub-ticket needs a ticket in context; New sub-project needs a project
// route.
export const createRows = (deps: RowDeps): PaletteRow[] => {
	const defaults = routeDefaults(deps.pathname, deps.search);
	const runs: Record<string, () => void> = {
		"create.ticket": run(deps, () => composerActions.open(defaults)),
		"create.project": run(deps, () => deps.action.navigate("/setup?step=project")),
	};
	if (deps.identifier !== null) {
		runs["create.subTicket"] = run(deps, () =>
			composerActions.open({ ...defaults, parent: deps.identifier ?? undefined }),
		);
	}
	if (deps.routeProject !== null) {
		const project = deps.routeProject;
		runs["create.subProject"] = run(deps, () => deps.action.navigate(projectHref(project, "settings")));
	}
	return rowsOf("create", runs);
};

// The board and the table of the project the route names. Off a project
// route there is no view to switch.
export const gotoRows = (deps: RowDeps): PaletteRow[] => {
	const runs: Record<string, () => void> = {
		"goto.needsYou": run(deps, () => deps.action.navigate("/needs-you")),
		"goto.all": run(deps, () => deps.action.navigate("/all")),
		"goto.settings": run(deps, () => deps.action.navigate("/settings")),
	};
	const project = deps.routeProject;
	if (project !== null) {
		runs["goto.board"] = run(deps, () => deps.action.navigate(projectHref(project, "board")));
		runs["goto.table"] = run(deps, () => deps.action.navigate(projectHref(project, "table")));
	}
	const rows = rowsOf("goto", runs);
	const projects = deps.projects.map((row) => ({
		value: `goto.project.${row.id}`,
		label: row.path,
		sub: row.name,
		icon: <Folder />,
		keywords: [row.name, row.key],
		run: run(deps, () => deps.action.navigate(projectHref(row.path, "table"))),
	}));
	// The destinations first, then every project, then the two views of the
	// project the route names.
	const views = rows.filter((row) => row.value === "goto.board" || row.value === "goto.table");
	const places = rows.filter((row) => !views.includes(row));
	return [...places, ...projects, ...views];
};

export const viewRows = (deps: RowDeps): PaletteRow[] => {
	const runs: Record<string, () => void> = {
		"view.filter": run(deps, () => document.querySelector<HTMLElement>("[data-filter-bar]")?.focus()),
		"view.sort": () => deps.openSubmenu({ kind: "sort" }),
		"view.group": () => deps.openSubmenu({ kind: "group" }),
		"view.density": run(deps, () =>
			uiActions.setDensity(useUiStore.getState().density === "compact" ? "comfortable" : "compact"),
		),
		"view.theme": run(deps, toggleTheme),
		"view.sidebar": run(deps, uiActions.toggleSidebar),
	};
	return rowsOf("view", runs);
};
