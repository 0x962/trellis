export const LINK_BROWSER_PARTITION = "persist:trellis-link-browser";
export const LINK_BROWSER_NODE_INTEGRATION = false;
export const LINK_BROWSER_SANDBOX = true;
export const LINK_BROWSER_WEB_PREFERENCES = "nodeIntegration=no,sandbox=yes";

export const isLinkBrowserUrl = (url: string | undefined) =>
	url !== undefined && URL.canParse(url) && new URL(url).protocol === "https:";
