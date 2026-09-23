import { useSuspenseQuery } from "@tanstack/react-query";
import { lazy } from "react";
import { useApp } from "../../../../../lib/appContext";
import {
	type ProjectSettingsTarget,
	pageSheetActions,
	type SheetParent,
	sheetParent,
	usePageSheetStore,
} from "../../../../../stores/pageSheetStore";
import { ArchivedBanner } from "../../../../project-actions";
import type { ProjectSettingsSectionId } from "../../../../project-settings";
import { PageSheet } from "../../../PageSheet";
import { PageTitle } from "../../../PageTitle";
import { ProjectBreadcrumb } from "../../../ProjectBreadcrumb";
import { Topbar } from "../../../Topbar";
import { useShown } from "../../useShown";

// The settings of a project hold the label, status, and template editors.
// Every page mounts this sheet, so they load in their own chunk and a person
// who never opens the settings never pays for them.
const ProjectSettings = lazy(async () => ({
	default: (await import("../../../../project-settings")).ProjectSettings,
}));

export type ProjectSettingsSheetProps = {
	// The sheet this copy of the project settings stands inside.
	// `sheetParent` answers which copy renders, and the others render nothing.
	at: SheetParent;
};

// The settings of one project in a `PageSheet` over the page a person is on.
// Closing the sheet leaves them on that page.
//
// The store holds one project and one section, and the sheet stack draws
// this component in four places. Only the copy that `sheetParent` names
// renders, so two sheets never answer the same Escape.
export function ProjectSettingsSheet({ at }: ProjectSettingsSheetProps) {
	const parent = usePageSheetStore(sheetParent);
	const target = usePageSheetStore((state) => state.projectSettings);
	const shown = useShown(target);
	if (parent !== at) return null;
	return (
		<PageSheet open={target !== null} onClose={pageSheetActions.closeProjectSettings} title="Project settings">
			{shown !== null && <ProjectSettingsContent target={shown} />}
		</PageSheet>
	);
}

// The project of the sheet, by its ref. No loader runs for a page in a
// sheet, so this query suspends inside the sheet on the first open.
function ProjectSettingsContent({ target }: { target: ProjectSettingsTarget }) {
	const { orpc } = useApp();
	const project = useSuspenseQuery(orpc.projects.get.queryOptions({ input: { project: target.project } })).data;
	const openSection = (section: ProjectSettingsSectionId) =>
		pageSheetActions.openProjectSettings({ project: target.project, section });
	return (
		<>
			<Topbar>
				<PageTitle parent={<ProjectBreadcrumb project={project} />} title="Settings" />
			</Topbar>
			<div className="page-card flex flex-1 flex-col overflow-hidden">
				{project.archivedAt !== null && <ArchivedBanner project={project} />}
				<ProjectSettings project={project} section={target.section} onSectionChange={openSection} />
			</div>
		</>
	);
}
