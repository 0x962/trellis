import {
	ArrowsDownUp,
	ChartLine,
	FolderOpen,
	FolderPlus,
	Funnel,
	Gear,
	GitPullRequest,
	Moon,
	Plus,
	Rows,
	SidebarSimple,
	SquaresFour,
	Table,
	Tray,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { projectHref } from "../../../../lib/projectUrl";
import { toggleTheme } from "../../../../lib/theme";
import { uiActions, useUiStore } from "../../../../stores/uiStore";
import { composerActions } from "../../../composer";
import { itemsOfSection } from "../../items";
import { capsOf, type PaletteRow, type RowDeps } from "../../rows";
import { projectRows } from "../projectRows";
import { routeDefaults } from "../routeDefaults";

// The Create, Go to, and View sections. Every row here moves the app or
// the interface; none of them writes a ticket.

const icons: Record<string, ReactNode> = {
	"create.ticket": <Plus />,
	"create.project": <FolderPlus />,
	"goto.needsYou": <Tray />,
	"goto.board": <SquaresFour />,
	"goto.table": <Table />,
	"goto.diffs": <GitPullRequest />,
	"goto.usage": <ChartLine />,
	"goto.settings": <Gear />,
	"goto.project": <FolderOpen />,
	"view.filter": <Funnel />,
	"view.sort": <ArrowsDownUp />,
	"view.group": <Rows />,
	"view.density": <Rows />,
	"view.theme": <Moon />,
	"view.sidebar": <SidebarSimple />,
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

export const createRows = (deps: RowDeps): PaletteRow[] => {
	const defaults = routeDefaults(deps.pathname, deps.search);
	const runs: Record<string, () => void> = {
		"create.ticket": run(deps, () => composerActions.open(defaults)),
		"create.project": run(deps, () => deps.action.navigate("/setup?step=project")),
	};
	return rowsOf("create", runs);
};

// The fixed destinations, one row that opens the project list, and the
// board, the table, and the diffs of the project the route names. Off a
// project route there is no view to switch.
export const gotoRows = (deps: RowDeps): PaletteRow[] => {
	const runs: Record<string, () => void> = {
		"goto.needsYou": run(deps, () => deps.action.navigate("/needs-you")),
		"goto.usage": run(deps, () => deps.action.navigate("/usage")),
		"goto.settings": run(deps, () => deps.action.navigate("/settings")),
		"goto.project": () => deps.openSubmenu({ kind: "goto" }),
	};
	const project = deps.routeProject;
	if (project !== null) {
		runs["goto.board"] = run(deps, () => deps.action.navigate(projectHref(project, "board")));
		runs["goto.table"] = run(deps, () => deps.action.navigate(projectHref(project, "table")));
		runs["goto.diffs"] = run(deps, () => deps.action.navigate(projectHref(project, "diffs")));
	}
	return rowsOf("goto", runs);
};

// Every project, as rows that open the project's table.
export const gotoProjectRows = (deps: RowDeps): PaletteRow[] =>
	projectRows(
		deps.projects,
		(project) => `goto.project.${project.id}`,
		(project) => run(deps, () => deps.action.navigate(projectHref(project.key, "table"))),
	);

export const viewRows = (deps: RowDeps): PaletteRow[] => {
	const runs: Record<string, () => void> = {
		"view.filter": run(deps, () =>
			document.querySelector<HTMLElement>("[data-filter-bar] [data-filter-button]")?.focus(),
		),
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
