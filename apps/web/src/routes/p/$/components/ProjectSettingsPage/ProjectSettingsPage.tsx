import type { Project } from "@trellis/api";
import { ProjectSettings } from "../../../../../features/project-settings";
import { Topbar } from "../../../../../features/shell/Topbar";
import { ArchivedBanner } from "../ArchivedBanner";

export type ProjectSettingsPageProps = {
	project: Project;
};

// The screen of `/p/<project path>/settings`: the topbar and the editable
// project settings. The title names the project by its names, root first.
export function ProjectSettingsPage({ project }: ProjectSettingsPageProps) {
	// Each crumb keys on its project id, so two projects with one name stay two crumbs.
	const crumbs = [
		...project.ancestors.map((ancestor) => ({ id: ancestor.id, name: ancestor.name })),
		{ id: project.id, name: project.name },
		{ id: "settings", name: "Settings" },
	];
	return (
		<>
			<Topbar>
				<h1 className="flex min-w-0 items-center gap-1.5 text-lg font-semibold text-fg">
					{crumbs.map(({ id, name }, index) => (
						<span key={id} className="flex min-w-0 items-center gap-1.5">
							{index > 0 && (
								<span aria-hidden="true" className="font-normal text-fg-faint">
									›
								</span>
							)}
							<span className="sr-only">{index > 0 ? " › " : ""}</span>
							<span className="truncate">{name}</span>
						</span>
					))}
				</h1>
			</Topbar>
			{project.archivedAt !== null && <ArchivedBanner project={project} />}
			<ProjectSettings project={project} />
		</>
	);
}
