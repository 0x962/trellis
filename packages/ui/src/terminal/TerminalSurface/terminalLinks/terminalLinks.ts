type OpenWindow = (url: string, target: string, features: string) => unknown;

const safeTerminalUrl = (url: string) => {
	if (!URL.canParse(url)) return false;
	const parsed = new URL(url);
	return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password;
};

export const terminalLinkHandler =
	(open: OpenWindow = (url, target, features) => window.open(url, target, features)) =>
	(_event: MouseEvent, url: string) => {
		if (safeTerminalUrl(url)) open(url, "_blank", "noopener,noreferrer");
	};
