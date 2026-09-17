import type { Project } from "@trellis/api";
import { ProjectSettings } from "../../../../../features/project-settings";
import { PageTitle } from "../../../../../features/shell/PageTitle";
import { ProjectBreadcrumb } from "../../../../../features/shell/ProjectBreadcrumb";
import { Topbar } from "../../../../../features/shell/Topbar";
import { ArchivedBanner } from "../ArchivedBanner";

export type ProjectSettingsPageProps = {
	project: Project;
};

// The screen of `/p/<project path>/settings`: the topbar and the editable
// project settings. The title names the project by its names, root first.
export function ProjectSettingsPage({ project }: ProjectSettingsPageProps) {
	return (
		<>
			<Topbar>
				<PageTitle parent={<ProjectBreadcrumb project={project} />} title="Settings" />
			</Topbar>
			<div className="page-card flex flex-1 flex-col overflow-hidden">
				{project.archivedAt !== null && <ArchivedBanner project={project} />}
				<ProjectSettings project={project} />
			</div>
		</>
	);
}
