import {
	type BrowserParent,
	browserParent,
	pageSheetActions,
	usePageSheetStore,
} from "../../../../../stores/pageSheetStore";
import { PageSheet } from "../../../PageSheet";
import { useShown } from "../../useShown";
import { browserHost } from "./browserTitle";
import { BrowserPage } from "./components/BrowserPage";

export type BrowserSheetProps = {
	// The sheet this copy of the browser stands inside. `browserParent`
	// answers which copy draws the browser, and the others draw nothing.
	at: BrowserParent;
};

// One web page in a `PageSheet` over the page that opened it. The sheet
// takes the width of the window, because a person reads a whole site here.
//
// The store holds one address, and the sheet stack draws this component in
// five places. Only the copy that `browserParent` names renders, so two
// sheets never answer the same Escape.
export function BrowserSheet({ at }: BrowserSheetProps) {
	const parent = usePageSheetStore(browserParent);
	const url = usePageSheetStore((state) => state.browser);
	const shown = useShown(url);
	if (parent !== at) return null;
	return (
		<PageSheet
			open={url !== null}
			onClose={pageSheetActions.closeBrowser}
			width="full"
			title={shown === null ? "Browser" : browserHost(shown)}
		>
			{shown !== null && <BrowserPage key={shown} url={shown} />}
		</PageSheet>
	);
}
