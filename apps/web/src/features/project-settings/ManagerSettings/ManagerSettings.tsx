import { useMutation } from "@tanstack/react-query";
import {
	DEFAULT_PROJECT_MANAGER_CONFIG,
	type Project,
	type ProjectManagerConfig,
	ProjectManagerConfigSchema,
} from "@trellis/api";
import { toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { GeneralSettings } from "./components/GeneralSettings";
import { HarnessSettings } from "./components/HarnessSettings";

export function ManagerSettings({ project, section }: { project: Project; section: string }) {
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
		onError: (error) => toast.error("Could not save the copilot settings", { description: error.message }),
	});
	const commit = (next: ProjectManagerConfig) => {
		setDraft(next);
		const parsed = ProjectManagerConfigSchema.safeParse(next);
		if (parsed.success) save.mutate(parsed.data);
	};
	const readOnly = project.archivedAt !== null;

	return (
		<>
			<div hidden={section !== "manager"} className="project-settings-page">
				<GeneralSettings
					hasParent={project.parentId !== null}
					readOnly={readOnly}
					draft={draft}
					saved={saved}
					commit={commit}
					setDraft={setDraft}
				/>
			</div>
			<div hidden={section !== "harness"} className="project-settings-page">
				<HarnessSettings readOnly={readOnly} draft={draft} saved={saved} commit={commit} setDraft={setDraft} />
			</div>
			{(section === "manager" || section === "harness") && (
				<p role={save.error ? "alert" : "status"} className="manager-save-status">
					{save.isPending
						? "Save in progress…"
						: save.error
							? save.error.message
							: dirty
								? "Unsaved changes"
								: "All changes saved"}
				</p>
			)}
		</>
	);
}
