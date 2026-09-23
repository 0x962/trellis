import type { StatisticsLoop } from "@trellis/api";
import { formatCount, formatDuration } from "../../../../../lib/format";

// How many rounds of review one merged pull request took. The first read of
// a pull request is one round, and each change a person asks for adds one.
export const rounds = (sentBack: number) => (sentBack === 0 ? "1 round" : `${sentBack + 1} rounds`);

export type ReadyToVerdict = {
	// The figure, or the reason the page prints none.
	value: string;
	// What the figure covers.
	note: string;
};

// The wait from the moment a pull request became ready to the first verdict
// of the person, in words.
//
// The median covers the pull requests that carry both moments, and the line
// prints that count beside it. A median over fewer than half of the window
// says more about which rows carry the stamp than about the wait, so the
// line then prints the count alone.
export const readyToVerdict = (
	loop: Pick<StatisticsLoop, "merged" | "readyToVerdictMs" | "readyToVerdictMeasured">,
): ReadyToVerdict => {
	const covers = `${formatCount(loop.readyToVerdictMeasured)} of ${formatCount(loop.merged)}`;
	if (loop.readyToVerdictMs === null || loop.readyToVerdictMeasured === 0)
		return {
			value: "Not measured.",
			note: "No merged pull request of the window carries both the ready stamp and a verdict from you.",
		};
	if (loop.readyToVerdictMeasured * 2 < loop.merged)
		return {
			value: "Not printed.",
			note: `Only ${covers} carry both the ready stamp and a verdict from you.`,
		};
	return {
		value: `${formatDuration(loop.readyToVerdictMs)} median.`,
		note: `Over the ${covers} that carry both the ready stamp and a verdict from you.`,
	};
};
