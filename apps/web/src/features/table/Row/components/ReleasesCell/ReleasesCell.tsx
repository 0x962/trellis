import type { TicketSummary } from "@trellis/api";

export type ReleasesCellProps = {
	// The tickets that wait for this one.
	releases: TicketSummary["releases"];
};

// How many tickets this ticket holds back. The cell stays empty when it
// holds none back, so a column of counts reads as the levers of the plan.
export function ReleasesCell({ releases }: ReleasesCellProps) {
	if (releases.length === 0) return null;

	return <span className="text-sm text-fg-muted tabular">{releases.length}</span>;
}
