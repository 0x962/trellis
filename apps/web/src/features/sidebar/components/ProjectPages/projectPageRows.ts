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

// The sidebar rows of one project, split into the rows it always shows and
// the rows the More row holds. `pathname` is the page on screen, and one row
// at most is active.
export const projectPageRows = (
	project: ProjectSummary,
	pathname: string,
	activeAgentCount: number,
): ProjectPageRows => {
	const current = projectRefOfPathname(pathname) === project.key;
	// The settings page and its /notes section end the project URL too. The
	// project's row menu (ProjectRowActions) opens both, and neither has a
	// row here, so both turn the Tickets row off.
	const settings = pathname.endsWith("/settings") || pathname.endsWith("/notes");
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
			{ label: "Diffs", suffix: "/diffs", active: current && diffs, trailing: null, activeAgentCount: 0 },
		],
		more: [
			{
				label: "Tickets",
				suffix: "",
				active: current && !settings && !diffs && !epics && !sessions,
				trailing: null,
				activeAgentCount: 0,
			},
			{ label: "Sessions", suffix: "/sessions", active: current && sessions, trailing: null, activeAgentCount },
		],
	};
};
