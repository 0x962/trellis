import { useQuery } from "@tanstack/react-query";
import type { TicketSummary } from "@trellis/api";
import { cx, Skeleton } from "@trellis/ui";
import { useId } from "react";
import { useApp } from "../../../lib/appContext";
import { tabularClass } from "../../../lib/format";
import { GhBanner } from "./components/GhBanner";
import { LinkPrField } from "./components/LinkPrField";
import { PullRequestRow } from "./components/PullRequestRow";
import { RefreshControl } from "./components/RefreshControl";

export type PullRequestsProps = {
	ticket: TicketSummary;
};

// Every pull request linked to one ticket, with the gh banner, the fetch age,
// and the Link PR field. The ticket page mounts this and nothing else.
export function PullRequests({ ticket }: PullRequestsProps) {
	const { orpc } = useApp();
	const headingId = useId();
	const prs = useQuery(orpc.pullRequests.list.queryOptions({ input: { ticket: ticket.id } })).data;

	return (
		<section aria-labelledby={headingId} className="mt-8 flex flex-col gap-2">
			<div data-prs-header="" className="flex h-7 items-center gap-3">
				<h2 id={headingId} className={cx("text-sm font-medium text-fg-muted", tabularClass)}>
					Pull requests{prs !== undefined && prs.length > 0 && ` · ${prs.length}`}
				</h2>
				{prs !== undefined && <RefreshControl ticket={ticket} prs={prs} />}
			</div>
			<GhBanner />
			{prs === undefined ? (
				<div data-pr-skeleton="" className="flex h-14 items-center rounded-md border border-border bg-surface px-3">
					<Skeleton width="w-64" />
				</div>
			) : prs.length === 0 ? (
				<p className="text-sm text-fg-muted">No pull request is linked to this ticket.</p>
			) : (
				<ul className="flex flex-col gap-1">
					{prs.map((pr) => (
						<li key={pr.id}>
							<PullRequestRow ticket={ticket} pr={pr} />
						</li>
					))}
				</ul>
			)}
			<LinkPrField ticket={ticket} />
		</section>
	);
}
