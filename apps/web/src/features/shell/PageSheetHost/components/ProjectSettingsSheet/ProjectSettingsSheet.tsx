import { lazy } from "react";
import {
	pageSheetActions,
	type SheetParent,
	sheetParent,
	usePageSheetStore,
} from "../../../../../stores/pageSheetStore";
import { PageSheet } from "../../../PageSheet";
import { useShown } from "../../useShown";

// The settings of a project hold the label, status, and template editors.
// Every page mounts this sheet, so those editors load in their own chunk.
const ProjectSettingsView = lazy(async () => ({
	default: (await import("../../../../project-settings")).ProjectSettingsView,
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
	const subject = usePageSheetStore((state) => state.projectSettings);
	const shown = useShown(subject);
	if (parent !== at) return null;
	return (
		<PageSheet open={subject !== null} onClose={pageSheetActions.closeProjectSettings} title="Project settings">
			{shown !== null && (
				<ProjectSettingsView
					project={shown.project}
					section={shown.section}
					onSectionChange={(section) => pageSheetActions.openProjectSettings({ project: shown.project, section })}
				/>
			)}
		</PageSheet>
	);
}
