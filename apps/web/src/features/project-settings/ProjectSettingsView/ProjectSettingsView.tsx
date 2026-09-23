import { useSuspenseQuery } from "@tanstack/react-query";
import { useApp } from "../../../lib/appContext";
import { ArchivedBanner } from "../../project-actions";
import { PageTitle } from "../../shell/PageTitle";
import { ProjectBreadcrumb } from "../../shell/ProjectBreadcrumb";
import { Topbar } from "../../shell/Topbar";
import { ProjectSettings } from "../ProjectSettings";
import type { ProjectSettingsSectionId } from "../projectSettingsUrl";

export type ProjectSettingsViewProps = {
	// The API ref of the project, `TRL`.
	project: string;
	section: ProjectSettingsSectionId;
	onSectionChange: (section: ProjectSettingsSectionId) => void;
};

// The settings of one project, with the bar that names the project.
// `ProjectSettingsSheet` draws this view in a sheet over the page a person
// is on, and `Topbar` puts the title into the header of that sheet.
//
// No loader runs for a page in a sheet, so this query suspends inside the
// sheet on the first open.
export function ProjectSettingsView({ project, section, onSectionChange }: ProjectSettingsViewProps) {
	const { orpc } = useApp();
	const loaded = useSuspenseQuery(orpc.projects.get.queryOptions({ input: { project } })).data;
	return (
		<>
			<Topbar>
				<PageTitle parent={<ProjectBreadcrumb project={loaded} />} title="Settings" />
			</Topbar>
			<div className="page-card flex flex-1 flex-col overflow-hidden">
				{loaded.archivedAt !== null && <ArchivedBanner project={loaded} />}
				<ProjectSettings project={loaded} section={section} onSectionChange={onSectionChange} />
			</div>
		</>
	);
}
