// The names one agent carries. A manager serves one project, named by its
// path ("CDE", "CDE.web"). A builder and a reviewer serve one ticket, named
// by its identifier ("CDE-42").
export type RoleName = { role: "manager"; project: string } | { role: "builder" | "reviewer"; ticket: string };

// The actor name of every trellis command the agent runs: "manager-cde",
// "builder-cde-42", or "reviewer-cde-42". The dispatcher tells the manager's
// own changes from everyone else's by this name.
export const roleActorName = (name: RoleName) =>
	`${name.role}-${(name.role === "manager" ? name.project : name.ticket).toLowerCase()}`;

// The `x-trellis-actor` value, such as "agent:builder-cde-42".
export const roleActor = (name: RoleName) => `agent:${roleActorName(name)}`;

// The tab name in Superset. Claude Code sets the terminal title from its
// `--name`, so the tab shows "CDE manager", "CDE-42", or "CDE-42 review".
export const roleTitle = (name: RoleName) => {
	if (name.role === "manager") return `${name.project} manager`;
	return name.role === "builder" ? name.ticket : `${name.ticket} review`;
};

export const managerTitle = (project: string) => roleTitle({ role: "manager", project });

export const reviewerTitle = (ticket: string) => roleTitle({ role: "reviewer", ticket });

export const managerWorkspaceName = (project: string) => `${project} · manager`;

// A project path as one lowercase word: "CDE.web" gives "cde-web".
const pathWord = (project: string) => project.toLowerCase().replaceAll(".", "-");

// Superset lowercases tags and groups the workspaces of one tag in one
// sidebar folder, so each trellis project gets one folder.
export const projectTag = (project: string) => `trellis-${pathWord(project)}`;

// `superset ws create` answers alreadyExists for a branch a workspace already
// holds. The manager has a branch of its own, so a second start finds the
// first workspace.
export const managerBranch = (project: string) => `trellis-${pathWord(project)}-manager`;

const BRANCH_SLUG_MAX = 40;

// The auto-link scan finds the lowercase identifier in the branch name, so
// the builder's PR attaches to its ticket.
export const builderBranch = (ticket: string, title: string) => {
	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+/, "")
		.slice(0, BRANCH_SLUG_MAX)
		.replace(/-+$/, "");
	return slug === "" ? ticket.toLowerCase() : `${ticket.toLowerCase()}-${slug}`;
};
