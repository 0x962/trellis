import type { Activity, ActorRef, Comment, TimelineItem } from "@trellis/api";

// Consecutive activity by one actor inside this window is one row.
export const runWindowMs = 5 * 60 * 1000;

export type CommentRow = {
	kind: "comment";
	key: string;
	comment: Comment;
};

// One line in the timeline: one activity item, or a run of them by one
// actor. `label` names every changed field, as in "changed priority and
// parent". `items` holds the rows the line expands to. `at` is the stamp of
// the newest item.
export type ActivityRow = {
	kind: "activity";
	key: string;
	actor: ActorRef;
	items: Activity[];
	label: string;
	at: string;
};

export type TimelineRow = CommentRow | ActivityRow;

// Turns one page of `timeline.list`, newest first, into rows oldest first.
export const timelineRows = (_items: readonly TimelineItem[]): TimelineRow[] => {
	throw new Error("timelineRows is not implemented");
};
