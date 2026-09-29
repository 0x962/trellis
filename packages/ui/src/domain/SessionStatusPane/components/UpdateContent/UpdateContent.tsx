import { type MouseEvent, type ReactNode, useMemo } from "react";
import { cx } from "../../../../utils/cx";
import { type LinkPress, linkPress } from "../../../../utils/linkPress";
import type { SessionUpdate } from "../../types";
import { SessionStatusEmbed } from "../SessionStatusEmbed";

const messageClass = cx(
	"text-md text-fg [overflow-wrap:anywhere]",
	"[&_p]:mb-4 [&_p:last-child]:mb-0",
	"[&_h1]:mt-6 [&_h1]:mb-2.5 [&_h1]:text-md [&_h1]:font-semibold",
	"[&_h2]:mt-6 [&_h2]:mb-2.5 [&_h2]:text-md [&_h2]:font-semibold",
	"[&_h3]:mt-6 [&_h3]:mb-2.5 [&_h3]:text-md [&_h3]:font-semibold",
	"[&_h4]:mt-6 [&_h4]:mb-2.5 [&_h4]:text-sm [&_h4]:font-semibold",
	"[&_ul]:mb-5 [&_ul]:list-disc [&_ul]:ps-4.5",
	"[&_ol]:mb-5 [&_ol]:list-decimal [&_ol]:ps-4.5",
	"[&_li]:my-1.5",
	"[&_a]:rounded-hairline [&_a]:font-medium [&_a]:text-agent [&_a]:underline [&_a]:underline-offset-3",
	"[&_a]:focus-visible:outline-2 [&_a]:focus-visible:outline-agent [&_a]:focus-visible:outline-offset-2",
	"[&_code]:rounded-hairline [&_code]:border [&_code]:border-border [&_code]:bg-elevated [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs",
	"[&_pre]:mb-5 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-border [&_pre]:bg-surface [&_pre]:p-3",
	"[&_pre_code]:border-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
	"[&_blockquote]:my-5 [&_blockquote]:border-s-hairline [&_blockquote]:border-agent [&_blockquote]:ps-3 [&_blockquote]:text-fg-muted",
	"[&_table]:mb-5 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-xs",
	"[&_th]:border-b [&_th]:border-border-strong [&_th]:py-2 [&_th]:text-start [&_th]:font-medium [&_th]:text-fg-faint",
	"[&_td]:border-b [&_td]:border-border [&_td]:py-2 [&_td]:pe-3 [&_td]:align-top",
);

const linkFromEvent = (event: MouseEvent): { href: string; target: string; press: LinkPress } | null => {
	if (!(event.target instanceof Element)) return null;
	const anchor = event.target.closest("a[href]");
	if (!(anchor instanceof HTMLAnchorElement)) return null;
	return {
		href: anchor.href,
		target: anchor.target,
		press: linkPress(event),
	};
};

export function UpdateContent({
	update,
	renderMarkdown,
	onOpenLink,
}: {
	update: SessionUpdate;
	renderMarkdown: (markdown: string) => ReactNode;
	onOpenLink: (href: string, target: string, press: LinkPress) => void;
}) {
	const embeds = useMemo(
		() => update.embeds.map((embed, index) => ({ embed, key: `${update.id}:${index}` })),
		[update.id, update.embeds],
	);
	const handleLink = (event: MouseEvent) => {
		const opened = linkFromEvent(event);
		if (opened === null) return;
		event.preventDefault();
		onOpenLink(opened.href, opened.target, opened.press);
	};
	return (
		<article onClickCapture={handleLink} onAuxClickCapture={handleLink} className={messageClass}>
			{renderMarkdown(update.body)}
			{embeds.map(({ embed, key }) => (
				<SessionStatusEmbed key={key} {...embed} />
			))}
		</article>
	);
}
