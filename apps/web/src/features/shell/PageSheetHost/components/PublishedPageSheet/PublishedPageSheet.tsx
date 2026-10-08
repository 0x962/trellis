import { lazy } from "react";
import { pageSheetActions, usePageSheetStore } from "../../../../../stores/pageSheetStore";
import { PageSheet } from "../../../PageSheet";
import { useShown } from "../../useShown";
import { BrowserSheet } from "../BrowserSheet";
import { ProjectSettingsSheet } from "../ProjectSettingsSheet";
import { SettingsSheet } from "../SettingsSheet";

const PublishedPageContent = lazy(async () => ({
	default: (await import("./components/PublishedPageContent")).PublishedPageContent,
}));

export function PublishedPageSheet() {
	const page = usePageSheetStore((state) => state.publishedPage);
	const shown = useShown(page);
	return (
		<PageSheet
			open={page !== null}
			onClose={pageSheetActions.closePublishedPage}
			onReturn={pageSheetActions.returnToPublishedPage}
			title="Page"
		>
			{shown !== null && <PublishedPageContent key={shown.ref} subject={shown} />}
			<SettingsSheet at="publishedPage" />
			<ProjectSettingsSheet at="publishedPage" />
			<BrowserSheet at="publishedPage" />
		</PageSheet>
	);
}
