import { FolderOpen } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import type { Project } from "@trellis/api";
import { IconButton, Input, Tooltip, toast } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import type { ProjectManagerConfigController } from "../hooks/useProjectManagerConfig";

export type ProjectDirectorySettingsProps = {
	project: Project;
	manager: ProjectManagerConfigController;
};

export function ProjectDirectorySettings({ project, manager }: ProjectDirectorySettingsProps) {
	const { client } = useApp();
	const folder = useMutation({
		mutationFn: () => {
			const desktop = (window as Window & { trellisDesktop?: { chooseDirectory: () => Promise<string | null> } })
				.trellisDesktop;
			return desktop ? desktop.chooseDirectory() : client.system.chooseDirectory();
		},
		onSuccess: (directory) => {
			if (directory !== null) manager.commit({ ...manager.draft, directory });
		},
		onError: (error) => toast.error("Could not open the folder selector", { description: error.message }),
	});
	const invalidDirectory = manager.draft.directory !== "" && !manager.draft.directory.startsWith("/");
	return (
		<section className="project-settings-group">
			<div className="flex flex-col gap-1">
				<h3 className="project-settings-group-title">Project directory</h3>
				<p className="text-sm leading-relaxed text-fg-muted">
					{project.parentId !== null
						? "Leave this empty to use the nearest parent project directory."
						: "Choose the local repository that agents use for this project."}
				</p>
			</div>
			<div className="manager-settings-field">
				<div className="manager-directory-row">
					<Input
						label="Local path"
						placeholder="Choose a local repository"
						value={manager.draft.directory}
						onChange={(event) => manager.setDraft({ ...manager.draft, directory: event.target.value })}
						onBlur={() => {
							if (manager.draft.directory !== manager.saved.directory) manager.commit(manager.draft);
						}}
						invalid={invalidDirectory}
					/>
					<Tooltip content="Choose a directory on this machine">
						<IconButton
							label="Choose project directory"
							icon={<FolderOpen />}
							disabled={folder.isPending}
							onClick={() => folder.mutate()}
						/>
					</Tooltip>
				</div>
				{invalidDirectory && (
					<p role="alert" className="text-sm text-danger">
						Use an absolute directory path.
					</p>
				)}
				<p role={manager.status.role} className="min-h-5 text-sm text-fg-muted">
					{manager.status.message}
				</p>
			</div>
		</section>
	);
}
