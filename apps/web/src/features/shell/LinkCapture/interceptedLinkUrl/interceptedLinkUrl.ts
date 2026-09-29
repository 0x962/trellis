import { isLinkBrowserUrl } from "@trellis/api";

export type ClickedLink = { href: string; target: string };

export const interceptedLinkUrl = (link: ClickedLink | null, desktop: boolean, origin: string) => {
	if (!desktop || link === null || !isLinkBrowserUrl(link.href)) return null;
	return new URL(link.href).origin === origin ? null : link.href;
};
