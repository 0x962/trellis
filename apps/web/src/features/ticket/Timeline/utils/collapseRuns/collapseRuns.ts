import type { Activity, TimelineItem } from "@trellis/api";

export type TimelineEntry = { kind: "comment"; item: TimelineItem } | { kind: "activity"; items: Activity[] };

// Activity by one actor inside this window reads as one line.
export const runWindowMs = 5 * 60 * 1000;

const sameActor = (a: Activity, b: Activity) => a.actor.name === b.actor.name && a.actor.kind === b.actor.kind;

// Groups consecutive activity rows by one agent when each row lands within
// five minutes of the one before it. An agent's burst of changes reads as
// one line; a person's changes stay one line each. A comment is its own
// entry and ends the run. `items` is oldest first, and so is the result.
export const collapseRuns = (items: readonly TimelineItem[]): TimelineEntry[] => {
	const entries: TimelineEntry[] = [];
	for (const item of items) {
		if (item.kind === "comment") {
			entries.push({ kind: "comment", item });
			continue;
		}
		const last = entries[entries.length - 1];
		const previous = last?.kind === "activity" ? last.items[last.items.length - 1]! : null;
		if (
			last !== undefined &&
			last.kind === "activity" &&
			previous !== null &&
			item.actor.kind === "agent" &&
			sameActor(previous, item) &&
			Date.parse(item.createdAt) - Date.parse(previous.createdAt) <= runWindowMs
		) {
			last.items.push(item);
			continue;
		}
		entries.push({ kind: "activity", items: [item] });
	}
	return entries;
};
