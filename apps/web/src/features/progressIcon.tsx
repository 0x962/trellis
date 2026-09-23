import { StatusIcon } from "@trellis/ui";
import { formatCount } from "../lib/format";

// The progress circle of a wave or an epic: an empty circle before the
// first done ticket, a circle that fills with the done share, and the done
// mark when `done` is true. The label reads "3 of 11 done".
//
// `filling` draws the disk full, in the `wave-fill` class that gives it a
// transition, so the disk grows from the share it drew last. The counts of
// the wave reach the page in a later answer than the status of the ticket
// that completed it, so the full share comes from `filling` and not from
// the counts.
export const progressIcon = (completedCount: number, totalCount: number, done: boolean, filling = false) => {
	const label = `${formatCount(filling ? totalCount : completedCount)} of ${formatCount(totalCount)} done`;
	if (filling) {
		return <StatusIcon category="started" color="success" progress={1} label={label} className="wave-fill" />;
	}
	if (done) return <StatusIcon category="done" color="success" label={label} />;
	if (completedCount === 0) return <StatusIcon category="todo" label={label} />;
	const progress = totalCount === 0 ? 0 : completedCount / totalCount;
	return <StatusIcon category="started" color="success" progress={progress} label={label} />;
};
