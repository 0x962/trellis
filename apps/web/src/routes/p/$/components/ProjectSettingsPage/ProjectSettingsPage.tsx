import type { Project } from "@trellis/api";
import { ProjectSettings, type ProjectSettingsSectionId } from "../../../../../features/project-settings";
import { PageTitle } from "../../../../../features/shell/PageTitle";
import { ProjectBreadcrumb } from "../../../../../features/shell/ProjectBreadcrumb";
import { Topbar } from "../../../../../features/shell/Topbar";
import { ArchivedBanner } from "../ArchivedBanner";

export type ProjectSettingsPageProps = {
	project: Project;
	section?: ProjectSettingsSectionId;
};

// ProjectSettingsPage uses section for direct routes that have no settings hash, such as /p/<project path>/notes.
export function ProjectSettingsPage({ project, section }: ProjectSettingsPageProps) {
	return (
		<>
			<Topbar>
				<PageTitle parent={<ProjectBreadcrumb project={project} />} title="Settings" />
			</Topbar>
			<div className="page-card flex flex-1 flex-col overflow-hidden">
				{project.archivedAt !== null && <ArchivedBanner project={project} />}
				<ProjectSettings project={project} section={section} />
			</div>
		</>
	);
}
