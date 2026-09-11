import type { Activity, ActorRef, Comment, TimelineItem } from "@trellis/api";
import { describeActivity, describeRun } from "./activityLabel";

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

const sameActor = (a: ActorRef, b: ActorRef) => a.name === b.name && a.kind === b.kind;

// An activity item joins the last row when that row is a run by the same
// actor and the item sits inside the window after the run's newest item.
const joins = (row: TimelineRow | undefined, item: Activity): row is ActivityRow =>
	row !== undefined &&
	row.kind === "activity" &&
	sameActor(row.actor, item.actor) &&
	Date.parse(item.createdAt) - Date.parse(row.at) <= runWindowMs;

const label = (items: Activity[]) => (items.length === 1 ? describeActivity(items[0]!) : describeRun(items));

// The server writes a `comment.created` activity row beside every comment.
// The comment card already shows that event, so the row draws no line.
const shown = (item: TimelineItem) => item.kind === "comment" || item.action !== "comment.created";

// Turns one page of `timeline.list`, newest first, into rows oldest first.
export const timelineRows = (items: readonly TimelineItem[]): TimelineRow[] => {
	const oldestFirst = items.filter(shown).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
	const rows: TimelineRow[] = [];
	for (const item of oldestFirst) {
		if (item.kind === "comment") {
			const { kind, ...comment } = item;
			rows.push({ kind, key: `comment-${comment.id}`, comment });
			continue;
		}
		const { kind, ...activity } = item;
		const last = rows.at(-1);
		if (joins(last, activity)) {
			last.items.push(activity);
			last.at = activity.createdAt;
			last.label = label(last.items);
			continue;
		}
		rows.push({
			kind,
			key: `activity-${activity.id}`,
			actor: activity.actor,
			items: [activity],
			label: label([activity]),
			at: activity.createdAt,
		});
	}
	return rows;
};
