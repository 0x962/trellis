import { isLinkBrowserUrl } from "@trellis/api";

export type ClickedLink = { href: string };

export const interceptedLinkUrl = (link: ClickedLink | null, desktop: boolean, origin: string, newTab: boolean) => {
	if (link === null || !isLinkBrowserUrl(link.href)) return null;
	const internal = new URL(link.href).origin === origin;
	if (internal) return newTab ? link.href : null;
	return desktop ? link.href : null;
};
