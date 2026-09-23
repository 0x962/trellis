import {
	pageSheetActions,
	type SheetParent,
	sheetParent,
	usePageSheetStore,
} from "../../../../../stores/pageSheetStore";
import { PageSheet } from "../../../PageSheet";
import { useShown } from "../../useShown";
import { browserHost } from "./browserTitle";
import { BrowserPage } from "./components/BrowserPage";

export type BrowserSheetProps = {
	// The sheet this copy of the browser stands inside. `sheetParent`
	// answers which copy draws the browser, and the others draw nothing.
	at: SheetParent;
};

// One web page in a wide `PageSheet` over the page that opened it. A person
// reads a whole site here, so the sheet needs more room than a page sheet.
//
// The store holds one address, and the sheet stack draws this component in
// five places. Only the copy that `sheetParent` names renders, so two
// sheets never answer the same Escape.
export function BrowserSheet({ at }: BrowserSheetProps) {
	const parent = usePageSheetStore(sheetParent);
	const url = usePageSheetStore((state) => state.browser);
	const shown = useShown(url);
	if (parent !== at) return null;
	return (
		<PageSheet
			open={url !== null}
			onClose={pageSheetActions.closeBrowser}
			width="wide"
			title={shown === null ? "Browser" : browserHost(shown)}
		>
			{shown !== null && <BrowserPage key={shown} url={shown} />}
		</PageSheet>
	);
}
