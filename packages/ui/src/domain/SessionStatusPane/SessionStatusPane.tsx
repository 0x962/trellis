import { type MouseEvent, type ReactNode, useMemo, useState } from "react";
import { EmptyState } from "../../primitives/EmptyState";
import { ScrollArea } from "../../primitives/ScrollArea";
import { cx } from "../../utils/cx";
import { type LinkPress, linkPress } from "../../utils/linkPress";
import { SessionStatusEmbed } from "./components/SessionStatusEmbed";
import { sessionStatusNotice, sessionUpdateAge } from "./sessionStatusText";
import type { SessionStatusPaneProps, SessionUpdate } from "./types";

const defaultLateAfterMs = 10 * 60_000;

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

function UpdateContent({
	update,
	renderMarkdown,
	onOpenLink,
	announce,
}: {
	update: SessionUpdate;
	renderMarkdown: (markdown: string) => ReactNode;
	onOpenLink: (href: string, target: string, press: LinkPress) => void;
	announce: boolean;
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
		<article
			aria-live={announce ? "polite" : undefined}
			onClickCapture={handleLink}
			onAuxClickCapture={handleLink}
			className={messageClass}
		>
			{renderMarkdown(update.body)}
			{embeds.map(({ embed, key }) => (
				<SessionStatusEmbed key={key} {...embed} />
			))}
		</article>
	);
}

export function SessionStatusPane({
	updates,
	processState,
	now,
	renderMarkdown,
	onOpenLink,
	lateAfterMs = defaultLateAfterMs,
	className,
}: SessionStatusPaneProps) {
	const [previousOpen, setPreviousOpen] = useState(false);
	const notice = sessionStatusNotice({
		processState,
		request: updates.request,
		latestAt: updates.latest?.createdAt ?? null,
		now,
		lateAfterMs,
	});
	return (
		<aside
			aria-label="Session status"
			className={cx(
				"order-none flex h-full min-h-0 w-93.5 shrink-0 flex-col border-s border-border bg-bg",
				"max-md:order-first max-md:h-auto max-md:max-h-130 max-md:w-full max-md:border-s-0 max-md:border-b",
				className,
			)}
		>
			<ScrollArea label="Agent status updates" className="min-h-0 flex-1">
				<div className="flex min-h-full flex-col gap-5 px-5.5 py-5 max-md:gap-4 max-md:p-4.5">
					<header className="flex items-center justify-between gap-3">
						<h2 className="text-sm font-medium text-fg">From the agent</h2>
						{updates.latest === null ? (
							<span className="text-xs text-fg-faint">No update yet</span>
						) : (
							<time dateTime={updates.latest.createdAt} className="tabular shrink-0 text-xs text-fg-faint">
								{sessionUpdateAge(updates.latest.createdAt, now)}
							</time>
						)}
					</header>
					{notice !== null && (
						<p role="status" className="border-b border-border pb-3 text-xs leading-relaxed text-warning">
							{notice}
						</p>
					)}
					{updates.latest === null ? (
						<EmptyState
							image={null}
							title="The agent has not supplied a status update yet."
							description="Its first reply will appear here. You can read the session transcript while you wait."
							variant="section"
						/>
					) : (
						<UpdateContent update={updates.latest} renderMarkdown={renderMarkdown} onOpenLink={onOpenLink} announce />
					)}
					{updates.previous !== null && (
						<details
							onToggle={(event) => setPreviousOpen(event.currentTarget.open)}
							className="border-t border-border pt-4 text-xs leading-relaxed text-fg-faint"
						>
							<summary className="flex min-h-7 w-fit cursor-pointer items-center rounded-sm text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 max-md:min-h-11">
								Previous update
							</summary>
							{previousOpen && (
								<div className="mt-2.5">
									<UpdateContent
										update={updates.previous}
										renderMarkdown={renderMarkdown}
										onOpenLink={onOpenLink}
										announce={false}
									/>
								</div>
							)}
						</details>
					)}
					<details className="mt-auto text-xs leading-relaxed text-fg-faint">
						<summary className="flex min-h-7 w-fit cursor-pointer items-center rounded-sm text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 max-md:min-h-11">
							Updates every 5 min
						</summary>
						<p className="mt-2.5">
							Trellis asks the active agent for a rich update. A supported side conversation, such as /btw, keeps the
							work in progress. Otherwise, the request waits for a safe break. The latest reply stays visible until a
							new reply arrives. A paused session receives no automatic request.
						</p>
					</details>
				</div>
			</ScrollArea>
		</aside>
	);
}
