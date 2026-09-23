import type { ProjectSummary } from "@trellis/api";
import { formatCount } from "../../../../lib/format";
import { projectRefOfPathname } from "../../../../lib/projectUrl";
import type { ProjectSettingsSectionId } from "../../../project-settings";

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
	// The section of the project settings sheet the row opens, or null when
	// the row opens a page. The Settings row and the Notes row keep the
	// href of their suffix, so a click with a modifier key opens a tab.
	section: ProjectSettingsSectionId | null;
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

// The sidebar rows of one project, split into the rows it always shows and
// the rows the More row holds. `pathname` is the page on screen, and one row
// at most is active. The Settings row and the Notes row open a sheet over
// the page on screen, so neither one is ever the active row.
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
				section: null,
			},
			{
				label: "Sessions",
				suffix: "/sessions",
				active: current && sessions,
				trailing: null,
				activeAgentCount,
				section: null,
			},
		],
		more: [
			{
				label: "Tickets",
				suffix: "",
				active: current && !diffs && !epics && !sessions,
				trailing: null,
				activeAgentCount: 0,
				section: null,
			},
			{
				label: "Diffs",
				suffix: "/diffs",
				active: current && diffs,
				trailing: null,
				activeAgentCount: 0,
				section: null,
			},
			{ label: "Settings", suffix: "/settings", active: false, trailing: null, activeAgentCount: 0, section: "" },
			{ label: "Notes", suffix: "/notes", active: false, trailing: null, activeAgentCount: 0, section: "notes" },
		],
	};
};
