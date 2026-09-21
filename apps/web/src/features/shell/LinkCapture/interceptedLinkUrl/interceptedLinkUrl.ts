import { isLinkBrowserUrl } from "@trellis/api";

export type ClickedLink = {
	// The address the browser resolved for the anchor.
	href: string;
	target: string;
};

// The address the browser sheet opens for a click, or null when the click
// keeps the behavior the page gives it. Only a plain left click on an
// anchor that asks for a new tab opens the sheet. A click with a modifier
// key asks the operating system for a window or a download, and the desktop
// window handler answers it.
export const interceptedLinkUrl = (link: ClickedLink | null, modified: boolean, desktop: boolean) => {
	if (!desktop || modified || link === null || link.target !== "_blank") return null;
	return isLinkBrowserUrl(link.href) ? link.href : null;
};
