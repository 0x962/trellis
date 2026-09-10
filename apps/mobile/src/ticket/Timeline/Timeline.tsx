import type { ReactElement } from "react";
import type { TimelineRow } from "./timelineRows";

export type TimelineProps = {
	rows: readonly TimelineRow[];
	// The sections above the timeline: the title, the grid, the description,
	// the sub-tickets, the pull requests, and the attachments.
	header: ReactElement;
};

// The FlashList of the ticket screen, under `testID="ticket-timeline"`.
// A comment row is a card under
// `testID="comment-<id>"` with a left border in the actor's color. An
// activity row is a 32 px line under `testID="activity-row"`; a run
// expands on press into one `testID="activity-line"` per item.
export function Timeline(_props: TimelineProps): ReactElement {
	throw new Error("Timeline is not implemented");
}
