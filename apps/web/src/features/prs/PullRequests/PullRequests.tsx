import { useQuery } from "@tanstack/react-query";
import type { LinkedPullRequest, TicketSummary } from "@trellis/api";
import { Button, SectionHeader, Skeleton } from "@trellis/ui";
import { Link2 } from "lucide-react";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { GhBanner } from "./components/GhBanner";
import { LinkPrField } from "./components/LinkPrField";
import { PullRequestRow } from "./components/PullRequestRow";
import { RefreshControl } from "./components/RefreshControl";

export type PullRequestsProps = {
	ticket: TicketSummary;
	// The rows a cached ticket detail already holds. With them, the section
	// paints at once and shows no skeleton while `pullRequests.list` loads.
	initialPrs?: LinkedPullRequest[];
};

// Every PR linked to one ticket. The header row holds the count, the fetch
// age with Refresh, and Link PR, which turns into the URL field in place.
// With no PR the section is that header row alone. The gh notice shows only
// above a PR, because checks exist only on a linked PR. The ticket page
// mounts this and nothing else.
export function PullRequests({ ticket, initialPrs }: PullRequestsProps) {
	const { orpc } = useApp();
	const [linking, setLinking] = useState(false);
	const [linkError, setLinkError] = useState<string | null>(null);
	const prs = useQuery({
		...orpc.pullRequests.list.queryOptions({ input: { ticket: ticket.id } }),
		initialData: initialPrs,
	}).data;

	const closeField = () => {
		setLinking(false);
		setLinkError(null);
	};

	return (
		<section aria-label="PRs" className="flex flex-col gap-2">
			<div data-prs-header="">
				<SectionHeader
					title="PRs"
					count={prs !== undefined && prs.length > 0 ? prs.length : undefined}
					actions={
						<>
							{prs !== undefined && <RefreshControl ticket={ticket} prs={prs} />}
							{linking ? (
								<LinkPrField ticket={ticket} onClose={closeField} onError={setLinkError} />
							) : (
								<Button variant="quiet" size="sm" icon={<Link2 />} onClick={() => setLinking(true)}>
									Link PR
								</Button>
							)}
						</>
					}
				/>
			</div>
			{linkError !== null && (
				<span data-link-error="" role="alert" className="self-end text-sm text-danger">
					{linkError}
				</span>
			)}
			{prs === undefined ? (
				<div data-pr-skeleton="" className="flex h-14 items-center rounded-md border border-border bg-surface px-3">
					<Skeleton width="w-64" />
				</div>
			) : (
				prs.length > 0 && (
					<>
						<GhBanner />
						<ul className="flex flex-col gap-1">
							{prs.map((pr) => (
								<li key={pr.id}>
									<PullRequestRow ticket={ticket} pr={pr} />
								</li>
							))}
						</ul>
					</>
				)
			)}
		</section>
	);
}
