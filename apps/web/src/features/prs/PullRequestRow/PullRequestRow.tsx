import { Warning } from "@phosphor-icons/react";
import type { LinkedPullRequest, TicketSummary } from "@trellis/api";
import { cx, GithubMark, IconButton, PrGlyph, ReviewStateIcon, Tooltip } from "@trellis/ui";
import { tabularClass } from "../../../lib/format";
import { openLink } from "../../../lib/openLink";
import { PrActions } from "./components/PrActions";

export type PullRequestRowProps = {
	ticket: TicketSummary;
	pr: LinkedPullRequest;
};

// One pull request is 56 px tall. The first line holds the title and number.
// The second line holds the branch pair. The caller draws the control that
// opens the review, such as `PullRequestCard` on the ticket page.
export function PullRequestRow({ ticket, pr }: PullRequestRowProps) {
	return (
		<div
			data-pr-row={pr.id}
			className="group flex h-14 items-center gap-3 px-5 transition-colors duration-hover ease-out hover:bg-band focus-within:bg-band focus-within:outline-2 focus-within:outline-accent focus-within:-outline-offset-2 max-md:px-4"
		>
			<PrGlyph state={pr.state} isDraft={pr.isDraft} isQueued={pr.isQueued} />
			<span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
				<span className="flex min-w-0 items-center gap-2">
					<span className="min-w-0 truncate text-base font-medium text-fg">{pr.title}</span>
					<span className={cx("shrink-0 text-sm text-fg-muted", tabularClass)}>#{pr.number}</span>
				</span>
				<span className="flex min-w-0 items-center gap-1 text-sm text-fg-faint">
					<span className="truncate">{pr.headRef}</span>
					<span aria-hidden="true">→</span>
					<span className="shrink-0">{pr.baseRef}</span>
				</span>
			</span>
			{pr.fetchError !== null && (
				<Tooltip content={pr.fetchError}>
					<span
						data-pr-stale=""
						role="img"
						aria-label="The last read from GitHub failed, so these fields are old."
						className="shrink-0 text-warning"
					>
						<Warning className="size-4" aria-hidden={true} />
					</span>
				</Tooltip>
			)}
			<IconButton
				label="Open on GitHub"
				icon={<GithubMark />}
				size="xs"
				className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
				onClick={() => openLink(pr.url)}
			/>
			<PrActions ticket={ticket} pr={pr} />
			<ReviewStateIcon reviewState={pr.reviewState} isDraft={pr.isDraft} />
		</div>
	);
}
