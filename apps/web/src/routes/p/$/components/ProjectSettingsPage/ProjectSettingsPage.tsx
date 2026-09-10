import type { Project } from "@trellis/api";
import { ProjectSettings } from "../../../../../features/project-settings";
import { Topbar } from "../../../../../features/shell/Topbar";

export type ProjectSettingsPageProps = {
	project: Project;
};

// The screen of `/p/<project path>/settings`: the topbar and the editable
// project settings.
export function ProjectSettingsPage({ project }: ProjectSettingsPageProps) {
	return (
		<>
			<Topbar>
				<h1 className="text-md font-semibold text-fg">{project.path} settings</h1>
			</Topbar>
			<ProjectSettings project={project} />
		</>
	);
}
