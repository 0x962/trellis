// A copilot that exits right after its launch, for example because its
// login expired, must not launch again on the next beat: every launch
// writes a new process record, and a beat comes every second. The wait
// after such an exit starts at `BASE_DELAY_MS` and doubles with every
// launch inside `WINDOW_MS`, up to `MAX_DELAY_MS`. A process that ran for
// `SHORT_LIFE_MS` or longer counts as a real run and waits nothing.
export const SHORT_LIFE_MS = 90_000;
export const BASE_DELAY_MS = 30_000;
export const MAX_DELAY_MS = 15 * 60_000;
export const WINDOW_MS = 60 * 60_000;

export type RestartInput = {
	// The start times of the launches inside the window, newest first.
	attemptsAt: number[];
	// The start and the end of the last process. `endedAt` is null while it runs.
	startedAt: number;
	endedAt: number | null;
	now: number;
};

// The wait before the next launch, in milliseconds.
export function restartDelayMs({ attemptsAt, startedAt, endedAt, now }: RestartInput) {
	if (attemptsAt.length === 0 || (endedAt ?? now) - startedAt >= SHORT_LIFE_MS) return 0;
	return Math.min(BASE_DELAY_MS * 2 ** (attemptsAt.length - 1), MAX_DELAY_MS);
}

// The instant the next launch is allowed: the newest launch plus the wait.
export function restartAllowedAt(input: RestartInput) {
	const delay = restartDelayMs(input);
	return delay === 0 ? input.now : input.attemptsAt[0]! + delay;
}
