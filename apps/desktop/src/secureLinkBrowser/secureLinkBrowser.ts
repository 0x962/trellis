import {
	isLinkBrowserUrl,
	LINK_BROWSER_NODE_INTEGRATION,
	LINK_BROWSER_PARTITION,
	LINK_BROWSER_SANDBOX,
} from "@trellis/api";

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

// `secureLinkBrowser` applies to the one webview that `BrowserSheet` creates.
// It removes `preload`, so the remote page cannot reach Trellis code.
// It disables Node integration and enables the sandbox, so the remote page runs as a plain web page.
// It forces a fixed partition that no other surface uses, so a browsed site's cookie cannot reach the Trellis app session.
// It removes `allowpopups`, so the remote page cannot open another window.
// It accepts only HTTPS sources, so Trellis does not load an unencrypted remote page.
export const secureLinkBrowser = (event: AttachEvent, webPreferences: WebviewPreferences, params: WebviewParams) => {
	delete webPreferences.preload;
	delete params.preload;
	webPreferences.nodeIntegration = LINK_BROWSER_NODE_INTEGRATION;
	webPreferences.sandbox = LINK_BROWSER_SANDBOX;
	webPreferences.partition = LINK_BROWSER_PARTITION;
	params.partition = LINK_BROWSER_PARTITION;
	delete params.allowpopups;
	if (!isLinkBrowserUrl(params.src)) {
		console.warn("Link browser refused a source that is not HTTPS", { src: params.src });
		event.preventDefault();
	}
};
