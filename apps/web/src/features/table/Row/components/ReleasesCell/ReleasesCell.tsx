import type { TicketSummary } from "@trellis/api";

export type ReleasesCellProps = {
	// The tickets that wait for this one.
	releases: TicketSummary["releases"];
};

export function ReleasesCell({ releases }: ReleasesCellProps) {
	if (releases.length === 0) return null;

	return <span className="text-sm text-fg-muted tabular">{releases.length}</span>;
}
