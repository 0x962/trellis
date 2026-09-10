import { ORPCError } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import type { AgentProjectSettings, AgentSettings, RunnerReason } from "@trellis/api";
import { toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";

// The row a project reads before it has one: the manager off and the
// contract defaults.
export const defaultProjectSettings = (projectId: string): AgentProjectSettings => ({
	projectId,
	enabled: false,
	supersetProjectId: null,
	baseBranch: "main",
	maxConcurrent: 3,
	removeWorkspaceOnDone: true,
});

// What the server answers when the runner cannot serve a project the save
// turns on. `detail` names the fix.
export type SettingsRefusal = { projectId: string; reason: RunnerReason; detail: string };

const refusalOf = (error: unknown): SettingsRefusal | null =>
	error instanceof ORPCError && error.code === "AGENT_SETTINGS_UNUSABLE" ? (error.data as SettingsRefusal) : null;

// `agents.setSettings` replaces the whole record, so each save sends the
// cached record with one change on top. The cache takes the change at once,
// the response replaces it, and a refused save reads the stored record again.
// A save the runner refuses comes back as `refusal`, which names the project
// it refuses and the fix; the next save clears it.
export const useAgentSettings = () => {
	const { client, orpc, queryClient } = useApp();
	const key = orpc.agents.settings.queryKey({});
	const saved = useQuery(orpc.agents.settings.queryOptions({})).data;
	const [refusal, setRefusal] = useState<SettingsRefusal | null>(null);

	const save = async (change: (current: AgentSettings) => AgentSettings): Promise<void> => {
		const next = change(queryClient.getQueryData<AgentSettings>(key)!);
		queryClient.setQueryData(key, next);
		setRefusal(null);
		try {
			queryClient.setQueryData(key, await client.agents.setSettings(next));
			toast.success("Agent settings saved");
		} catch (error) {
			await queryClient.invalidateQueries({ queryKey: key });
			const refused = refusalOf(error);
			setRefusal(refused);
			toast.error("Couldn't save the agent settings", {
				description: refused === null ? (error as Error).message : refused.detail,
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

	return { saved, save, saveProject, projectOf, refusal };
};
