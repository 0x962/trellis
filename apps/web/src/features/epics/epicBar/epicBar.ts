import type { EpicCounts } from "@trellis/api";
import type { StackedBarSegment } from "@trellis/ui";
import { formatCount } from "../../../lib/format";

// The segments of the epic bar, one per status category. The list page and
// the epic page draw the same bar, so a category keeps one color on both.
// Todo takes `faint`, the neutral of the Todo status icon, so a bar of Todo
// tickets alone reads as not started in both themes. Review takes `fg`, the
// strongest neutral, because the light theme draws `accent` and `faint` in
// one grey and the two segments would read as one.
export const epicSegments = (counts: EpicCounts): StackedBarSegment[] => [
	{ key: "done", label: "Done", value: counts.done, valueLabel: formatCount(counts.done), tone: "success" },
	{ key: "review", label: "Review", value: counts.review, valueLabel: formatCount(counts.review), tone: "fg" },
	{ key: "started", label: "Started", value: counts.started, valueLabel: formatCount(counts.started), tone: "warning" },
	{ key: "todo", label: "Todo", value: counts.todo, valueLabel: formatCount(counts.todo), tone: "faint" },
	{
		key: "canceled",
		label: "Canceled",
		value: counts.canceled,
		valueLabel: formatCount(counts.canceled),
		tone: "danger",
	},
];

// The progress of an epic: the done tickets over the tickets that count. A
// canceled ticket is never done and never in the denominator.
export const epicProgress = (counts: EpicCounts) => ({ done: counts.done, of: counts.total - counts.canceled });

// "3/20", as a row prints it.
export const epicProgressLabel = (counts: EpicCounts) => {
	const { done, of } = epicProgress(counts);
	return `${formatCount(done)}/${formatCount(of)}`;
};
