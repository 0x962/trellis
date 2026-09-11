import { get, put } from "./api";

// The agent settings hold the global switch, the runner, and one row per
// project. The agent-runs rewrite took `trellis agents on` and `trellis
// agents off` out of the CLI, so a spec turns the agents on over the same
// settings route the settings page writes: read the document, change one
// switch, and write every other field back unchanged.

type ProjectRow = {
	projectId: string;
	enabled: boolean;
	supersetProjectId: string | null;
	supersetHostId: string | null;
	baseBranch: string | null;
	maxConcurrent: number;
	removeWorkspaceOnDone: boolean;
};

type Settings = { runner: string; enabled: boolean; projects: ProjectRow[] };

// A project without a settings row gets the contract defaults.
const defaultRow = (projectId: string): ProjectRow => ({
	projectId,
	enabled: false,
	supersetProjectId: null,
	supersetHostId: null,
	baseBranch: null,
	maxConcurrent: 3,
	removeWorkspaceOnDone: true,
});

const settings = () => get<Settings>("/agents/settings");

// The global switch. Off: no manager wakes and no builder starts.
export const setAgents = async (enabled: boolean) => {
	const saved = await settings();
	return put<Settings>("/agents/settings", { ...saved, enabled });
};

// One project's Manager switch, by project key or path.
export const setProjectAgents = async (project: string, enabled: boolean) => {
	const { id } = await get<{ id: string }>(`/projects/${project}`);
	const saved = await settings();
	const rows = saved.projects.some((row) => row.projectId === id)
		? saved.projects
		: [...saved.projects, defaultRow(id)];
	const projects = rows.map((row) => (row.projectId === id ? { ...row, enabled } : row));
	return put<Settings>("/agents/settings", { ...saved, projects });
};
