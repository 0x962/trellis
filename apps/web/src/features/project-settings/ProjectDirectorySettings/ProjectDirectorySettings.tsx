import { FolderOpen } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import type { Project } from "@trellis/api";
import { IconButton, Input, Tooltip, toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";

export type ProjectDirectorySettingsProps = { project: Project };

export function ProjectDirectorySettings({ project }: ProjectDirectorySettingsProps) {
	const { client, orpc, queryClient } = useApp();
	const [directory, setDirectory] = useState(project.directory);
	const save = useMutation({
		mutationFn: (value: string) => client.projects.update({ project: project.key, directory: value }),
		onSuccess: async () => queryClient.invalidateQueries({ queryKey: orpc.projects.get.key() }),
		onError: (error) => toast.error("Could not save the project directory", { description: error.message }),
	});
	const folder = useMutation({
		mutationFn: () => {
			const desktop = (window as Window & { trellisDesktop?: { chooseDirectory: () => Promise<string | null> } })
				.trellisDesktop;
			return desktop ? desktop.chooseDirectory() : client.system.chooseDirectory();
		},
		onSuccess: (directory) => {
			if (directory !== null) {
				setDirectory(directory);
				save.mutate(directory);
			}
		},
		onError: (error) => toast.error("Could not open the folder selector", { description: error.message }),
	});
	const invalidDirectory = directory !== "" && !directory.startsWith("/");
	const dirty = directory !== project.directory;
	const status = save.isPending
		? { role: "status" as const, message: "Save in progress…" }
		: save.error
			? { role: "alert" as const, message: save.error.message }
			: dirty
				? { role: "status" as const, message: "Unsaved changes" }
				: { role: "status" as const, message: "All changes saved" };
	return (
		<section className="project-settings-group">
			<div className="flex flex-col gap-1">
				<h3 className="project-settings-group-title">Project directory</h3>
				<p className="text-sm leading-relaxed text-fg-muted">
					Choose the local repository that agents use for this project.
				</p>
			</div>
			<div className="project-directory-field">
				<div className="project-directory-row">
					<Input
						label="Local path"
						placeholder="Choose a local repository"
						value={directory}
						onChange={(event) => setDirectory(event.target.value)}
						onBlur={() => {
							if (!invalidDirectory && directory !== project.directory) {
								save.mutate(directory);
							}
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
				<p role={status.role} className="min-h-5 text-sm text-fg-muted">
					{status.message}
				</p>
			</div>
		</section>
	);
}
