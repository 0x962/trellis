import { useQuery } from "@tanstack/react-query";
import type { Ticket } from "@trellis/api";
import { PrGlyph, PropertyRow } from "@trellis/ui";
import { useApp } from "../../../../../lib/appContext";
import { tabularClass } from "../../../../../lib/format";
import { pageSheetActions } from "../../../../../stores/pageSheetStore";

export type PullRequestsRowProps = {
	ticket: Ticket;
};

const linkClass =
	"flex min-w-0 items-center gap-2 rounded-md py-0.5 text-left text-sm text-fg transition-colors duration-hover ease-out hover:text-accent focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";

// Every pull request of the ticket, as one line each: the state glyph, the
// number and the title. A click opens the review in the pull request sheet,
// which holds the explanation, the evidence, the checks, the flow runs and
// the diff.
//
// `ticket.prs` comes with the ticket record. The list request repeats it, so
// a pull request that an agent links while the page stands open appears
// without a reload.
export function PullRequestsRow({ ticket }: PullRequestsRowProps) {
	const { orpc } = useApp();
	const prs = useQuery({
		...orpc.pullRequests.list.queryOptions({ input: { ticket: ticket.id } }),
		initialData: ticket.prs,
	});
	return (
		<PropertyRow compact align="start" label="Pull requests">
			{prs.data.length === 0 ? (
				<span className="text-fg-muted">None</span>
			) : (
				<span className="flex min-w-0 flex-col">
					{prs.data.map((pr) => (
						<button
							key={pr.id}
							type="button"
							className={linkClass}
							onClick={() => pageSheetActions.openPullRequest(pr.url)}
						>
							<PrGlyph state={pr.state} isDraft={pr.isDraft} isQueued={pr.isQueued} size="sm" decorative />
							<span className={`shrink-0 text-fg-muted ${tabularClass}`}>#{pr.number}</span>
							<span className="min-w-0 truncate">{pr.title}</span>
						</button>
					))}
				</span>
			)}
		</PropertyRow>
	);
}
