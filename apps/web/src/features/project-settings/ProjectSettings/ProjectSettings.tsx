import type { Project } from "@trellis/api";
import { ProjectDetailsForm } from "../ProjectDetailsForm";
import { ProjectLifecycle } from "../ProjectLifecycle";
import { RepoSettings } from "../RepoSettings";
import { StatusSettings } from "../StatusSettings";
import { SubprojectSettings } from "../SubprojectSettings";

export type ProjectSettingsProps = {
	project: Project;
};

// The server refuses every write to an archived project except unarchive.
// A disabled fieldset disables every control inside it, so only the archive
// and delete section stays usable.
export function ProjectSettings({ project }: ProjectSettingsProps) {
	return (
		<div className="min-h-0 flex-1 overflow-y-auto px-5 md:px-8">
			<div className="flex max-w-5xl flex-col">
				<fieldset disabled={project.archivedAt !== null} className="contents">
					<ProjectDetailsForm project={project} />
					<RepoSettings project={project} />
					<StatusSettings project={project} />
					<SubprojectSettings project={project} />
				</fieldset>
				<ProjectLifecycle project={project} />
			</div>
		</div>
	);
}
