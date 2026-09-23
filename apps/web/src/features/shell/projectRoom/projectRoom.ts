import type { ProjectSummary } from "@trellis/api";
import type { ProjectColor } from "@trellis/ui";
import { projectRefOfPathname } from "../../../lib/projectUrl";

// A page of a project takes the color of that project: the ground of the
// pane mixes a share of it in. `project-room.css` writes the share.

// The color of the room of a path. A path that names no project, and a
// project that holds no color, leave the pane on its plain ground.
//
// `projectRefOfPathname` holds the one rule that reads the project out of a
// path. A `/t/...` path carries a ticket and no project, so the caller passes
// `ticketProjectKey`, which it reads from that ticket.
export const roomColorOfPath = (
	pathname: string,
	projects: readonly ProjectSummary[],
	ticketProjectKey: string | null,
): ProjectColor | null => {
	const ref = pathname.startsWith("/t/") ? ticketProjectKey : projectRefOfPathname(pathname);
	if (ref === null) return null;
	return (
		projects.find((project) => project.key.toLowerCase() === ref.toLowerCase() || project.slug === ref.toLowerCase())
			?.color ?? null
	);
};
