export const sameOrigin = (url: string, origin: string) => URL.canParse(url) && new URL(url).origin === origin;

export const externalUrl = (url: string) => {
	if (!URL.canParse(url)) return false;
	const parsed = new URL(url);
	return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password;
};

export const openExternalUrl = (url: string, open: (url: string) => unknown) => {
	if (!externalUrl(url)) return false;
	open(url);
	return true;
};

export const deepLinkPath = (url: string) => {
	if (!URL.canParse(url)) return null;
	const parsed = new URL(url);
	if (parsed.protocol !== "trellis:" || parsed.host !== "open" || parsed.username || parsed.password) return null;
	if (!/^\/(?:t\/[^/]+|p\/[^/]+(?:\/[^/]+)*|reviews(?:\/[^/]+)*|flows(?:\/[^/]+)*|settings|)$/.test(parsed.pathname))
		return null;
	return `${parsed.pathname}${parsed.search}${parsed.hash}`;
};

export const rendererPath = (url: string) => {
	const parsed = new URL(url);
	return `${parsed.pathname}${parsed.search}${parsed.hash}`;
};
