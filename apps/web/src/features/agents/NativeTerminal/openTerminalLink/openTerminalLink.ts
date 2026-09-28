import { parseInternalLink } from "@trellis/api";

type Dependencies = {
	resolve: (input: { link: string }) => Promise<{ href: string }>;
	navigate: (href: string) => Promise<unknown>;
	openWebLink: (url: string) => void;
};

export async function openTerminalLink(url: string, deps: Dependencies) {
	if (parseInternalLink(url) !== null) {
		const { href } = await deps.resolve({ link: url });
		await deps.navigate(href);
		return;
	}
	if (!URL.canParse(url)) return;
	const parsed = new URL(url);
	if (["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password) deps.openWebLink(url);
}
