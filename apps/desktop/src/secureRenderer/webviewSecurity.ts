export const LINK_BROWSER_PARTITION = "persist:trellis-link-browser";

type AttachEvent = { preventDefault: () => void };
type WebviewPreferences = {
	preload?: string;
	nodeIntegration?: boolean;
	sandbox?: boolean;
	partition?: string;
};
type WebviewParams = {
	src?: string;
	preload?: string;
	partition?: string;
	allowpopups?: string;
};

export const secureLinkBrowser = (event: AttachEvent, webPreferences: WebviewPreferences, params: WebviewParams) => {
	delete webPreferences.preload;
	delete params.preload;
	webPreferences.nodeIntegration = false;
	webPreferences.sandbox = true;
	webPreferences.partition = LINK_BROWSER_PARTITION;
	params.partition = LINK_BROWSER_PARTITION;
	delete params.allowpopups;
	const src = params.src ?? "";
	if (!URL.canParse(src) || new URL(src).protocol !== "https:") event.preventDefault();
};
