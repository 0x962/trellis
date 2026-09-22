import { isReviewDraft, type Ticket } from "@trellis/api";
import { MergeConflictMark, PrGlyph, ReviewStateIcon, SectionHeader } from "@trellis/ui";
import { tabularClass } from "../../../lib/format";
import { pageSheetActions } from "../../../stores/pageSheetStore";

export type PullRequestsSectionProps = {
	ticket: Ticket;
};

const rowClass =
	"flex h-9 w-full items-center gap-3 border-b border-border px-3 text-left text-base text-fg transition-colors duration-hover ease-out hover:bg-band focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2";

const verdictLabel = (verdict: NonNullable<Ticket["prRows"][number]["verdict"]>) =>
	verdict === "approved" ? "You approved this commit" : "You asked for changes";

export function PullRequestsSection({ ticket }: PullRequestsSectionProps) {
	if (ticket.prRows.length === 0) return null;
	return (
		<section aria-label="Pull requests" className="flex flex-col gap-2">
			<SectionHeader title="Pull requests" count={ticket.prRows.length} />
			<ul className="overflow-hidden rounded-md border border-border">
				{ticket.prRows.map((pr) => (
					<li key={pr.id}>
						<button type="button" className={rowClass} onClick={() => pageSheetActions.openPullRequest(pr.url)}>
							<PrGlyph
								state={pr.state}
								isDraft={pr.isDraft}
								isQueued={pr.isQueued}
								localState={pr.localState}
								size="sm"
								decorative
							/>
							<span className={`w-14 shrink-0 text-fg-muted ${tabularClass}`}>#{pr.number}</span>
							<span className="min-w-0 flex-1 truncate">{pr.title}</span>
							{pr.state === "open" && pr.mergeable === "conflicting" && <MergeConflictMark baseRef={pr.baseRef} />}
							{pr.verdict !== null && (
								<ReviewStateIcon
									reviewState={pr.verdict}
									isDraft={isReviewDraft(pr)}
									label={verdictLabel(pr.verdict)}
								/>
							)}
						</button>
					</li>
				))}
			</ul>
		</section>
	);
}
