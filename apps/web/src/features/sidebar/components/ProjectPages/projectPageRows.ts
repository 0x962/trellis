import type { ProjectSummary } from "@trellis/api";
import { formatCount } from "../../../../lib/format";
import { projectRefOfPathname } from "../../../../lib/projectUrl";

export type ProjectPageRow = {
	label: string;
	// The end of the project URL that the row opens. The Tickets row owns the
	// bare project URL, so its suffix is the empty string.
	suffix: string;
	// True when the page on screen is this page of this project.
	active: boolean;
	// The text at the right edge of the row, or null when the row prints
	// none.
	trailing: string | null;
	// How many active agents this row stands for. Only the Sessions row holds a
	// count; every other row holds 0.
	activeAgentCount: number;
};

export type ProjectPageRows = {
	// The rows that stand under the project row, in order.
	top: ProjectPageRow[];
	// The rows that the More row holds, in order.
	more: ProjectPageRow[];
};

// How many active agents the shut More row stands for. The More row shows one
// dot for the rows it hides, so a person sees a working agent without opening
// it. No row under More carries a count today, so this adds up to zero.
export const hiddenAgentCount = (more: ProjectPageRow[]) =>
	more.reduce((total, row) => total + row.activeAgentCount, 0);

// True while the More row of this project shows the pages it holds. A person
// opens More for one page, and `projectMorePath` of the UI store holds that
// page by project id. This answers false on every other page, which draws the
// first frame of a navigation with More shut. The sidebar empties the record
// at that same navigation, so a return to the page of the press finds no
// entry and draws More shut as well.
export const moreIsOpen = (projectMorePath: Record<string, string>, projectId: string, pathname: string) =>
	projectMorePath[projectId] === pathname;

// The sidebar rows of one project, split into the rows it always shows and
// the rows the More row holds. `pathname` is the page on screen, and one row
// at most is active.
export const projectPageRows = (
	project: ProjectSummary,
	pathname: string,
	activeAgentCount: number,
): ProjectPageRows => {
	const current = projectRefOfPathname(pathname) === project.key;
	const diffs = pathname.endsWith("/diffs");
	// The epics list and the page of one epic, `/epics/<slug>`.
	const epics = pathname.endsWith("/epics") || pathname.includes("/epics/");
	const sessions = pathname.startsWith("/sessions/project/");
	return {
		top: [
			{
				label: "Epics",
				suffix: "/epics",
				active: current && epics,
				// The count of open epics of this project alone.
				trailing: project.openEpicCount > 0 ? formatCount(project.openEpicCount) : null,
				activeAgentCount: 0,
			},
			{
				label: "Sessions",
				suffix: "/sessions",
				active: current && sessions,
				trailing: null,
				activeAgentCount,
			},
		],
		more: [
			{
				label: "Tickets",
				suffix: "",
				active: current && !diffs && !epics && !sessions,
				trailing: null,
				activeAgentCount: 0,
			},
			{
				label: "Diffs",
				suffix: "/diffs",
				active: current && diffs,
				trailing: null,
				activeAgentCount: 0,
			},
		],
	};
};
