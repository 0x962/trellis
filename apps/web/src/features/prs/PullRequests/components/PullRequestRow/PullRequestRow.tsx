import { ArrowSquareOut, Warning } from "@phosphor-icons/react";
import type { LinkedPullRequest, TicketSummary } from "@trellis/api";
import { cx, IconButton } from "@trellis/ui";
import { tabularClass } from "../../../../../lib/format";
import { DiffLink } from "./components/DiffLink";
import { PrStateIcon } from "./components/PrStateIcon";
import { ReviewStateIcon } from "./components/ReviewStateIcon";
import { UnlinkButton } from "./components/UnlinkButton";

export type PullRequestRowProps = {
	ticket: TicketSummary;
	pr: LinkedPullRequest;
};

// One pull request is 56 px tall. The first line holds the title and number.
// The second line holds the branch pair.
//
// The row is `relative` because the diff link stretches over it. Every other
// control inside the row carries `relative`, so it takes the click
// the stretched link would otherwise swallow.
export function PullRequestRow({ ticket, pr }: PullRequestRowProps) {
	return (
		<div
			data-pr-row={pr.id}
			className="group relative flex h-14 items-center gap-3 px-5 transition-colors duration-hover ease-out hover:bg-band focus-within:bg-band focus-within:outline-2 focus-within:outline-accent focus-within:-outline-offset-2 max-md:px-4"
		>
			<PrStateIcon state={pr.state} isDraft={pr.isDraft} ciState={pr.ciState} />
			<span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
				<span className="flex min-w-0 items-center gap-2">
					<DiffLink url={pr.url}>{pr.title}</DiffLink>
					<span className={cx("shrink-0 text-sm text-fg-muted", tabularClass)}>#{pr.number}</span>
				</span>
				<span className="flex min-w-0 items-center gap-1 text-sm text-fg-faint">
					<span className="truncate">{pr.headRef}</span>
					<span aria-hidden="true">→</span>
					<span className="shrink-0">{pr.baseRef}</span>
				</span>
			</span>
			{pr.fetchError !== null && (
				<span data-pr-stale="" title={pr.fetchError} className="relative shrink-0 text-warning">
					<Warning className="size-4" aria-hidden={true} />
					<span className="sr-only">The last read from GitHub failed, so these fields are old.</span>
				</span>
			)}
			<IconButton
				label="Open on GitHub"
				icon={<ArrowSquareOut />}
				size="xs"
				className="relative opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
				onClick={() => window.open(pr.url, "_blank", "noopener")}
			/>
			<UnlinkButton ticket={ticket} pr={pr} />
			<ReviewStateIcon reviewState={pr.reviewState} isDraft={pr.isDraft} />
		</div>
	);
}
