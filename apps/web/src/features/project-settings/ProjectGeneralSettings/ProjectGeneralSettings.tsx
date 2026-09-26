import { useNavigate } from "@tanstack/react-router";
import type { Project } from "@trellis/api";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { ProjectDetailsForm } from "../ProjectDetailsForm";
import { ProjectDirectorySettings } from "../ProjectDirectorySettings";
import { RepoSettings } from "../RepoSettings";
import { SettingsSaveStatus } from "../SettingsSaveStatus";
import { SettingsSection } from "../SettingsSection";
import { useSettingsSave } from "../useSettingsSave";

export type ProjectGeneralSettingsProps = { project: Project };
export type GeneralValues = Pick<Project, "name" | "key" | "description" | "color" | "directory"> & {
	repos: { owner: string; repo: string }[];
};

export function ProjectGeneralSettings({ project }: ProjectGeneralSettingsProps) {
	const { client, orpc, queryClient } = useApp();
	const navigate = useNavigate();
	const [repoDraft, setRepoDraft] = useState(false);
	const [repoError, setRepoError] = useState<string | null>(null);
	const [folderError, setFolderError] = useState<string | null>(null);
	const form = useSettingsSave<GeneralValues>({
		initialValue: {
			name: project.name,
			key: project.key,
			description: project.description,
			color: project.color,
			directory: project.directory,
			repos: project.repos.map(({ owner, repo }) => ({ owner, repo })),
		},
		save: async (patch) => {
			if (patch.repos !== undefined) {
				await client.projects.setRepos({ project: project.id, repos: patch.repos });
			} else {
				const stored = await client.projects.update({ project: project.id, ...patch });
				if (patch.key !== undefined && stored.key !== project.key) {
					await navigate({ to: "/p/$", params: { _splat: `${stored.key}/settings` }, replace: true });
				}
			}
			await queryClient.invalidateQueries({ queryKey: orpc.projects.key() });
		},
	});
	const disabled = project.archivedAt !== null;
	const invalidDirectory = form.value.directory !== "" && !form.value.directory.startsWith("/");
	const directoryError = invalidDirectory ? "Use an absolute directory path." : null;
	const saveField = (key: keyof GeneralValues) => {
		if (disabled || (key === "key" && project.ticketCounter > 0)) return;
		if (key === "directory" && invalidDirectory) return;
		if (key === "name") form.setField("name", form.value.name.trim());
		if (key === "key") form.setField("key", form.value.key.trim().toUpperCase());
		void form.saveField(key);
	};
	return (
		<SettingsSection title="General">
			<form
				aria-label="General settings"
				className="project-settings-fields"
				onSubmit={(event) => {
					event.preventDefault();
					(event.target as HTMLFormElement).querySelector<HTMLElement>(":focus")?.blur();
				}}
			>
				<ProjectDetailsForm
					project={project}
					value={form.value}
					onChange={form.setField}
					onBlur={saveField}
					disabled={disabled}
				/>
				<ProjectDirectorySettings
					value={form.value.directory}
					error={directoryError}
					disabled={disabled}
					onChange={(value) => {
						setFolderError(null);
						form.setField("directory", value);
					}}
					onBlur={() => saveField("directory")}
					onError={setFolderError}
				/>
				<RepoSettings
					repos={form.value.repos}
					onBlur={() => saveField("repos")}
					disabled={disabled}
					onDraftChange={setRepoDraft}
					onError={setRepoError}
					onChange={(repos) => {
						form.setField("repos", repos);
						void form.saveField("repos");
					}}
				/>
				<SettingsSaveStatus
					status={{
						...form.status,
						dirty: form.status.dirty || repoDraft,
						error: directoryError ?? repoError ?? folderError ?? form.status.error,
					}}
				/>
			</form>
		</SettingsSection>
	);
}
