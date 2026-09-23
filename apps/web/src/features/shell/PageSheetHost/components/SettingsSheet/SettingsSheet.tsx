import {
	pageSheetActions,
	type SheetParent,
	sheetParent,
	usePageSheetStore,
} from "../../../../../stores/pageSheetStore";
import { SettingsView } from "../../../../settings/SettingsView";
import { PageSheet } from "../../../PageSheet";
import { useShown } from "../../useShown";

export type SettingsSheetProps = {
	// The sheet this copy of the settings stands inside. `sheetParent`
	// answers which copy renders, and the others render nothing.
	at: SheetParent;
};

// The settings of the app in a `PageSheet` over the page a person is on.
// Closing the sheet leaves them on that page, so the settings never take
// a person away from their work.
//
// The store holds one section, and the sheet stack draws this component in
// four places. Only the copy that `sheetParent` names renders, so two
// sheets never answer the same Escape.
export function SettingsSheet({ at }: SettingsSheetProps) {
	const parent = usePageSheetStore(sheetParent);
	const section = usePageSheetStore((state) => state.settings);
	const shown = useShown(section);
	if (parent !== at) return null;
	return (
		<PageSheet open={section !== null} onClose={pageSheetActions.closeSettings} title="Settings">
			{shown !== null && <SettingsView section={shown} onSectionChange={pageSheetActions.openSettings} />}
		</PageSheet>
	);
}
