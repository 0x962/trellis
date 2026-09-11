import { useQuery } from "@tanstack/react-query";
import type { AgentProjectSettings, AgentSettings } from "@trellis/api";
import { toast } from "@trellis/ui";
import { useApp } from "../../../../../lib/appContext";

// The row a project reads before it has one: the manager off and the
// contract defaults. A row without a base branch starts each agent from the
// default branch of the project's Superset checkout.
export const defaultProjectSettings = (projectId: string): AgentProjectSettings => ({
	projectId,
	enabled: false,
	supersetProjectId: null,
	supersetHostId: null,
	baseBranch: null,
	maxConcurrent: 3,
	removeWorkspaceOnDone: true,
});

// `agents.setSettings` replaces the whole record, so each save sends the
// cached record with one change on top. The cache takes the change at once,
// the response replaces it, and a refused save reads the stored record again.
export const useAgentSettings = () => {
	const { client, orpc, queryClient } = useApp();
	const key = orpc.agents.settings.queryKey({});
	const saved = useQuery(orpc.agents.settings.queryOptions({})).data;

	const save = async (change: (current: AgentSettings) => AgentSettings): Promise<void> => {
		const next = change(queryClient.getQueryData<AgentSettings>(key)!);
		queryClient.setQueryData(key, next);
		try {
			queryClient.setQueryData(key, await client.agents.setSettings(next));
			toast.success("Agent settings saved");
		} catch (error) {
			await queryClient.invalidateQueries({ queryKey: key });
			toast.error("Couldn't save the agent settings", {
				description: (error as Error).message,
				action: { label: "Retry", onClick: () => void save(change) },
			});
		}
	};

	// A project with no row gets one with the defaults and `patch` on top.
	const saveProject = (projectId: string, patch: Partial<AgentProjectSettings>) =>
		save((current) => {
			const row = current.projects.find((project) => project.projectId === projectId);
			const others = current.projects.filter((project) => project.projectId !== projectId);
			return { ...current, projects: [...others, { ...(row ?? defaultProjectSettings(projectId)), ...patch }] };
		});

	const projectOf = (projectId: string) =>
		saved?.projects.find((project) => project.projectId === projectId) ?? defaultProjectSettings(projectId);

	return { saved, save, saveProject, projectOf };
};
