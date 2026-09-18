import type { BoxClock } from "./boxClocks.ts";
import { formatTimeLeft } from "./formatTimeLeft.ts";

// The part of a step prompt that names each time limit around the step. A
// clock that runs gives its time left; a clock that starts with this
// process gives its whole budget. null when no box around the step has a
// time limit.
export function timeLimitNotice(clocks: readonly BoxClock[], now: number): string | null {
	if (clocks.length === 0) return null;
	const limits = clocks.map(({ box, deadlineAt }) =>
		deadlineAt === null
			? `Group ${box.title} allows ${box.minutes} min, counted from the start of this process.`
			: `Group ${box.title} has ${formatTimeLeft(deadlineAt - now)} left of its ${box.minutes} min limit.`,
	);
	return [
		`Time limit: ${limits.join(" ")}`,
		"Trellis stops this process when the limit ends. Finish and write your result before then.",
		"You get a message when half of the time is left, and again when a quarter is left.",
	].join(" ");
}
