import { isLinkBrowserUrl } from "@trellis/api";

export type ClickedLink = { href: string };

export const interceptedLinkUrl = (link: ClickedLink | null, desktop: boolean, origin: string) => {
	if (!desktop || link === null || !isLinkBrowserUrl(link.href)) return null;
	return new URL(link.href).origin === origin ? null : link.href;
};
