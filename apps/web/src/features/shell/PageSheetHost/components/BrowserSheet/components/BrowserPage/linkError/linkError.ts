import { isLinkBrowserUrl } from "@trellis/api";

export type LinkLoadFailure = Event & {
	errorCode: number;
	errorDescription: string;
	isMainFrame: boolean;
};

// Chromium sends `LOAD_STOPPED` when it stops a load before completion.
// The person closed the sheet or started another load, so the sheet has no failure to show.
const LOAD_STOPPED = -3;

export const linkLoadError = (event: Pick<LinkLoadFailure, "errorCode" | "errorDescription" | "isMainFrame">) => {
	if (!event.isMainFrame || event.errorCode === LOAD_STOPPED) return null;
	return event.errorDescription;
};

export const linkUrlError = (url: string) => (isLinkBrowserUrl(url) ? null : "Trellis opens only HTTPS links.");
