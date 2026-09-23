import { STATISTICS_WINDOW, type StatisticsLoop, shortDay } from "@trellis/api";
import { formatCount } from "../../../lib/format";

// The window of block two in words. It names how many merged pull requests
// the window holds and the day the oldest of them merged, so a reader knows
// what every figure of the block covers. The window is a count of merged
// pull requests: between twenty and forty merge in a week, so a week is no
// stable denominator.
export const windowLine = (loop: Pick<StatisticsLoop, "merged" | "oldestMergedAt">) => {
	if (loop.oldestMergedAt === null) return "No pull request has merged yet, so this block holds no figure.";
	const held = loop.merged < STATISTICS_WINDOW ? formatCount(loop.merged) : String(STATISTICS_WINDOW);
	return `The window is the last ${held} merged pull requests, not a calendar week. The oldest of them merged on ${shortDay(loop.oldestMergedAt)}.`;
};
