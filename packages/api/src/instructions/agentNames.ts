// A manager serves one project. A builder and a reviewer serve one ticket.
export type AgentName = { role: "manager"; project: string } | { role: "builder" | "reviewer"; ticket: string };

// The name of the agent's tab in Superset: "CDE manager", "CDE-42", or
// "CDE-42 review".
export const agentTitle = (name: AgentName): string => {
	if (name.role === "manager") return `${name.project} manager`;
	return name.role === "builder" ? name.ticket : `${name.ticket} review`;
};

// The actor name of every trellis command the agent runs: "manager-cde",
// "builder-cde-42", or "reviewer-cde-42". The activity of a ticket then
// shows which agent made each change.
export const agentActorName = (name: AgentName): string =>
	`${name.role}-${(name.role === "manager" ? name.project : name.ticket).toLowerCase()}`;

// The `x-trellis-actor` value: "agent:builder-cde-42".
export const agentActor = (name: AgentName): string => `agent:${agentActorName(name)}`;

// The Superset workspace of a project's manager: "CDE · manager".
export const managerWorkspaceName = (project: string): string => `${project} · manager`;

// A project path as one lowercase word: "CDE.web" gives "cde-web".
const pathWord = (project: string) => project.toLowerCase().replaceAll(".", "-");

// Superset lowercases tags and groups the workspaces of one tag in one
// sidebar folder, so each trellis project gets one folder.
export const projectTag = (project: string): string => `trellis-${pathWord(project)}`;

// `superset ws create` answers alreadyExists for a branch that a workspace
// already holds. The manager has a branch of its own, so a second start
// finds the first workspace.
export const managerBranch = (project: string): string => `trellis-${pathWord(project)}-manager`;

const BRANCH_SLUG_MAX = 40;

// The auto-link scan finds the lowercase identifier in the branch name, so
// the builder's PR attaches to its ticket.
export const builderBranch = (ticket: string, title: string): string => {
	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+/, "")
		.slice(0, BRANCH_SLUG_MAX)
		.replace(/-+$/, "");
	return slug === "" ? ticket.toLowerCase() : `${ticket.toLowerCase()}-${slug}`;
};
