import { Link } from "@tanstack/react-router";
import type { Project } from "@trellis/api";
import { ProjectSettings } from "../../../../../features/project-settings";
import { PageTitle } from "../../../../../features/shell/PageTitle";
import { Topbar } from "../../../../../features/shell/Topbar";
import { projectSlashPath } from "../../../../../lib/projectPath";
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
				<PageTitle
					parent={
						<Link to="/p/$" params={{ _splat: projectSlashPath(project.path) }} search={{}}>
							{project.name}
						</Link>
					}
					title="Settings"
				/>
			</Topbar>
			{project.archivedAt !== null && <ArchivedBanner project={project} />}
			<ProjectSettings project={project} />
		</>
	);
}
