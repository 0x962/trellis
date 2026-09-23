import type { ProjectSummary } from "@trellis/api";
import type { ProjectColor } from "@trellis/ui";

// A page of a project stands in the room of that project: the ground of the
// pane takes 8 percent of the color of the project. These functions say which
// project a path belongs to, and which color that page ground takes.

// The ticket identifier of a `/t/...` path, such as `TRL-386`. Another path
// has none.
export const ticketOfPath = (pathname: string): string | null => {
	if (!pathname.startsWith("/t/")) return null;
	const [identifier] = pathname.slice("/t/".length).split("/");
	return identifier === undefined || identifier === "" ? null : identifier;
};

// The project of a path, or `null` when the path names none.
//
// A `/p/...` path keeps slashes where the project ref keeps dots, and it can
// end in a view segment such as `settings` or `epics/<slug>`. The longest
// prefix of the segments that names a project in the list is the project of
// the page, so a view segment needs no list of its own here.
//
// A `/t/...` path carries the ticket identifier, and `ticketProject` is the
// project ref of that ticket, which the caller reads from the ticket.
export const projectOfPath = (
	pathname: string,
	projects: readonly ProjectSummary[],
	ticketProject: string | null,
): ProjectSummary | null => {
	const byRef = (ref: string) => projects.find((project) => project.path.toLowerCase() === ref.toLowerCase()) ?? null;
	if (pathname.startsWith("/t/")) return ticketProject === null ? null : byRef(ticketProject);
	if (!pathname.startsWith("/p/")) return null;
	const segments = pathname.slice("/p/".length).split("/").filter(Boolean);
	let found: ProjectSummary | null = null;
	for (let length = 1; length <= segments.length; length += 1) {
		const project = byRef(segments.slice(0, length).join("."));
		if (project !== null) found = project;
	}
	return found;
};

// The color of the room of a path. A path that names no project, and a
// project that holds no color, leave the pane on its plain ground.
export const roomColorOf = (
	pathname: string,
	projects: readonly ProjectSummary[],
	ticketProject: string | null,
): ProjectColor | null => projectOfPath(pathname, projects, ticketProject)?.color ?? null;
