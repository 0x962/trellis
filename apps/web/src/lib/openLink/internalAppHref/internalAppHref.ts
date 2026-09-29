import { isLinkBrowserUrl } from "@trellis/api";

export const internalAppHref = (url: string, origin: string) => {
	if (!isLinkBrowserUrl(url)) return null;
	const parsed = new URL(url);
	if (parsed.origin !== origin) return null;
	return `${parsed.pathname}${parsed.search}${parsed.hash}`;
};
