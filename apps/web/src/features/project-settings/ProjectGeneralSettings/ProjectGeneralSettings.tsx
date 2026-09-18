import type { Project } from "@trellis/api";
import { ProjectDetailsForm } from "../ProjectDetailsForm";
import { ProjectDirectorySettings } from "../ProjectDirectorySettings";
import { RepoSettings } from "../RepoSettings";
import { SettingsSection } from "../SettingsSection";

export type ProjectGeneralSettingsProps = { project: Project };

export function ProjectGeneralSettings({ project }: ProjectGeneralSettingsProps) {
	return (
		<SettingsSection title="General" hint="Manage the project details, local directory, and connected repositories.">
			<div className="project-settings-groups">
				<ProjectDetailsForm project={project} />
				<ProjectDirectorySettings project={project} />
				<RepoSettings project={project} />
			</div>
		</SettingsSection>
	);
}
