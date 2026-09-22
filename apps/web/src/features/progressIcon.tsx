import { StatusIcon } from "@trellis/ui";
import { formatCount } from "../lib/format";

// The progress circle of a wave or an epic: an empty circle before the
// first done ticket, a circle that fills with the done share, and the done
// mark when `done` is true. The label reads "3 of 11 done".
export const progressIcon = (completedCount: number, totalCount: number, done: boolean) => {
	const label = `${formatCount(completedCount)} of ${formatCount(totalCount)} done`;
	if (done) return <StatusIcon category="done" color="success" label={label} />;
	if (completedCount === 0) return <StatusIcon category="todo" label={label} />;
	const progress = totalCount === 0 ? 0 : completedCount / totalCount;
	return <StatusIcon category="started" color="success" progress={progress} label={label} />;
};
