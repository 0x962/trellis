import type { Project } from "@trellis/api";
import { ProjectDetailsForm } from "../ProjectDetailsForm";
import { RepoSettings } from "../RepoSettings";
import { StatusSettings } from "../StatusSettings";
import { SubprojectSettings } from "../SubprojectSettings";

export type ProjectSettingsProps = {
	project: Project;
};

export function ProjectSettings({ project }: ProjectSettingsProps) {
	return (
		<div className="min-h-0 flex-1 overflow-y-auto px-5 md:px-8">
			<div className="flex max-w-5xl flex-col">
				<ProjectDetailsForm project={project} />
				<RepoSettings project={project} />
				<StatusSettings project={project} />
				<SubprojectSettings project={project} />
			</div>
		</div>
	);
}
