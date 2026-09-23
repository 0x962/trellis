import type { ProjectSummary } from "@trellis/api";
import type { ProjectColor } from "@trellis/ui";

// A page of a project stands in the room of that project: the ground of the
// pane takes 8 percent of the color of the project. These functions say which
// project a path belongs to, and which color that page ground takes.

// The ticket ref of a `/t/...` path, such as `TRL-386`. Another path has none.
export const ticketRefOfPath = (pathname: string): string | null => {
	if (!pathname.startsWith("/t/")) return null;
	const [identifier] = pathname.slice("/t/".length).split("/");
	return identifier === undefined || identifier === "" ? null : identifier;
};

// The project of a path, or `null` when the path names none.
//
// A `/p/...` path starts with the key or the slug of the project, and the
// segments after it name a view, such as `settings` or `epics/<slug>`.
//
// A `/t/...` path carries the ticket identifier, and `ticketProject` is the
// key of the project of that ticket, which the caller reads from the ticket.
export const projectOfPath = (
	pathname: string,
	projects: readonly ProjectSummary[],
	ticketProject: string | null,
): ProjectSummary | null => {
	const byRef = (ref: string) =>
		projects.find((project) => project.key.toLowerCase() === ref.toLowerCase() || project.slug === ref.toLowerCase()) ??
		null;
	if (pathname.startsWith("/t/")) return ticketProject === null ? null : byRef(ticketProject);
	if (!pathname.startsWith("/p/")) return null;
	const [first] = pathname.slice("/p/".length).split("/").filter(Boolean);
	return first === undefined ? null : byRef(first);
};

// The color of the room of a path. A path that names no project, and a
// project that holds no color, leave the pane on its plain ground.
export const roomColorOf = (
	pathname: string,
	projects: readonly ProjectSummary[],
	ticketProject: string | null,
): ProjectColor | null => projectOfPath(pathname, projects, ticketProject)?.color ?? null;
