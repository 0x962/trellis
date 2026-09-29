import { isLinkBrowserUrl, parseInternalLink } from "@trellis/api";

export type LinkModifiers = Pick<MouseEvent, "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "button">;

type Dependencies = {
	resolve: (input: { link: string }) => Promise<{ href: string }>;
	navigate: (href: string, modifiers?: LinkModifiers) => Promise<unknown>;
	openWebLink: (url: string, modifiers?: LinkModifiers) => void;
};

export async function openAppLink(url: string, deps: Dependencies, modifiers?: LinkModifiers) {
	if (parseInternalLink(url) !== null) {
		const { href } = await deps.resolve({ link: url });
		await deps.navigate(href, modifiers);
		return;
	}
	if (!isLinkBrowserUrl(url)) throw new Error("This link has an unsupported or invalid address.");
	deps.openWebLink(url, modifiers);
}
