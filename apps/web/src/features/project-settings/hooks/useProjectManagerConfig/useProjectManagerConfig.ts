import { useMutation } from "@tanstack/react-query";
import {
	DEFAULT_PROJECT_MANAGER_CONFIG,
	type Project,
	type ProjectManagerConfig,
	ProjectManagerConfigSchema,
} from "@trellis/api";
import { toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../lib/appContext";

export type ProjectManagerConfigController = {
	draft: ProjectManagerConfig;
	saved: ProjectManagerConfig;
	commit: (config: ProjectManagerConfig) => void;
	setDraft: (config: ProjectManagerConfig) => void;
	status: {
		role: "alert" | "status";
		message: string;
	};
};

export function useProjectManagerConfig(project: Project): ProjectManagerConfigController {
	const { client, orpc, queryClient } = useApp();
	const saved = project.managerConfig ?? DEFAULT_PROJECT_MANAGER_CONFIG;
	const [draft, setDraft] = useState(saved);
	const parsedDraft = ProjectManagerConfigSchema.safeParse(draft);
	const dirty = !parsedDraft.success || JSON.stringify(parsedDraft.data) !== JSON.stringify(saved);
	const save = useMutation({
		scope: { id: `project-manager-${project.id}` },
		mutationFn: (managerConfig: ProjectManagerConfig) =>
			client.projects.update({ project: project.path, managerConfig }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: orpc.projects.get.key() });
		},
		onError: (error) => toast.error("Could not save the project settings", { description: error.message }),
	});
	const commit = (next: ProjectManagerConfig) => {
		setDraft(next);
		const parsed = ProjectManagerConfigSchema.safeParse(next);
		if (parsed.success) save.mutate(parsed.data);
	};
	return {
		draft,
		saved,
		commit,
		setDraft,
		status: save.isPending
			? { role: "status", message: "Save in progress…" }
			: save.error
				? { role: "alert", message: save.error.message }
				: dirty
					? { role: "status", message: "Unsaved changes" }
					: { role: "status", message: "All changes saved" },
	};
}
