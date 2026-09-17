import type { Project } from "@trellis/api";
import type { ProjectManagerConfigController } from "../hooks/useProjectManagerConfig";
import { ProjectDetailsForm } from "../ProjectDetailsForm";
import { ProjectDirectorySettings } from "../ProjectDirectorySettings";
import { RepoSettings } from "../RepoSettings";
import { SettingsSection } from "../SettingsSection";

export type ProjectGeneralSettingsProps = {
	project: Project;
	manager: ProjectManagerConfigController;
};

export function ProjectGeneralSettings({ project, manager }: ProjectGeneralSettingsProps) {
	return (
		<SettingsSection title="General" hint="Manage the project details, local directory, and connected repositories.">
			<div className="project-settings-groups">
				<ProjectDetailsForm project={project} />
				<ProjectDirectorySettings project={project} manager={manager} />
				<RepoSettings project={project} />
			</div>
		</SettingsSection>
	);
}
