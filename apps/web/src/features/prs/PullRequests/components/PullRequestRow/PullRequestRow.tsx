import type { LinkedPullRequest, TicketSummary } from "@trellis/api";
import { cx, IconButton } from "@trellis/ui";
import { ExternalLink, TriangleAlert } from "lucide-react";
import { tabularClass } from "../../../../../lib/format";
import { DiffLink } from "./components/DiffLink";
import { PrStateIcon } from "./components/PrStateIcon";
import { ReviewStateIcon } from "./components/ReviewStateIcon";
import { UnlinkButton } from "./components/UnlinkButton";

export type PullRequestRowProps = {
	ticket: TicketSummary;
	pr: LinkedPullRequest;
};

// One pull request as a card 56 px tall: the state icon, the title, the
// number, the branch pair, and the review state. The card carries no content
// that grows, so a card never pushes the cards below it.
//
// The card is `relative` because the diff link stretches over it. Every other
// control inside the card carries `relative` as well, so it takes the click
// the stretched link would otherwise swallow.
export function PullRequestRow({ ticket, pr }: PullRequestRowProps) {
	return (
		<div
			data-pr-row={pr.id}
			className="group relative flex h-14 items-center gap-3 rounded-md border border-border bg-surface px-3 transition-colors duration-hover ease-out hover:border-border-strong hover:bg-bg focus-within:border-border-strong"
		>
			<PrStateIcon state={pr.state} isDraft={pr.isDraft} ciState={pr.ciState} />
			<span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
				<span className="flex min-w-0 items-center gap-2">
					<DiffLink url={pr.url}>{pr.title}</DiffLink>
					<span className={cx("shrink-0 font-mono text-sm text-fg-muted", tabularClass)}>#{pr.number}</span>
				</span>
				<span className="flex min-w-0 items-center gap-1 text-sm text-fg-faint">
					<span className="truncate font-mono">{pr.headRef}</span>
					<span aria-hidden="true">→</span>
					<span className="shrink-0 font-mono">{pr.baseRef}</span>
				</span>
			</span>
			{pr.fetchError !== null && (
				<span data-pr-stale="" title={pr.fetchError} className="relative shrink-0 text-warning">
					<TriangleAlert className="size-4" aria-hidden={true} />
					<span className="sr-only">The last read from GitHub failed, so these fields are old.</span>
				</span>
			)}
			<IconButton
				label="Open on GitHub"
				icon={<ExternalLink />}
				size="sm"
				className="relative opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
				onClick={() => window.open(pr.url, "_blank", "noopener")}
			/>
			<ReviewStateIcon reviewState={pr.reviewState} isDraft={pr.isDraft} />
			<UnlinkButton ticket={ticket} pr={pr} />
		</div>
	);
}
