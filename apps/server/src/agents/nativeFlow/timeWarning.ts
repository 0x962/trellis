import type { BoxClock } from "./boxClocks.ts";
import { formatTimeLeft } from "./formatTimeLeft.ts";
import type { FlowStep } from "./types.ts";

// A warning goes out when the time left drops to each of these fractions
// of the budget of the box whose clock ends first.
const fractions = [1 / 2, 1 / 4] as const;

// The next time warning for the worker of a step, or null when none is due.
// `count` is the number of warnings due so far. The host stores it on the
// step as `timeWarnings` after the send, so each warning goes out once, and
// two fractions passed at the same time give one message.
export function timeWarning(
	clocks: readonly BoxClock[],
	step: Pick<FlowStep, "timeWarnings">,
	now: number,
): { count: number; text: string } | null {
	const running = clocks.filter((clock) => clock.deadlineAt !== null);
	if (running.length === 0) return null;
	const clock = running.reduce((first, next) => (next.deadlineAt! < first.deadlineAt! ? next : first));
	const left = clock.deadlineAt! - now;
	if (left <= 0) return null;
	const count = fractions.filter((fraction) => left <= clock.budgetMs * fraction).length;
	if (count <= (step.timeWarnings ?? 0)) return null;
	return {
		count,
		text: `Time check: group ${clock.box.title} has ${formatTimeLeft(left)} left of its ${clock.box.minutes} min limit. Trellis stops this process when the limit ends. Finish now and write your result.`,
	};
}
