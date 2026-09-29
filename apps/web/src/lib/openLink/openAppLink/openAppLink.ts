import { isLinkBrowserUrl, parseInternalLink } from "@trellis/api";
import type { LinkPress } from "@trellis/ui";

type Dependencies = {
	resolve: (input: { link: string }) => Promise<{ href: string }>;
	navigate: (href: string, press?: LinkPress) => Promise<unknown>;
	openWebLink: (url: string, press?: LinkPress) => void;
};

export async function openAppLink(url: string, deps: Dependencies, press?: LinkPress) {
	if (parseInternalLink(url) !== null) {
		const { href } = await deps.resolve({ link: url });
		await deps.navigate(href, press);
		return;
	}
	if (!isLinkBrowserUrl(url)) throw new Error("This link has an unsupported or invalid address.");
	deps.openWebLink(url, press);
}
