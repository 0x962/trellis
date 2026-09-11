import type { ErrorCode } from "@trellis/api";

// A declared error a test arms for the next call of one service. `data`
// takes the shape the contract declares for `code`.
export type Failure = { code: ErrorCode; data?: unknown };

// A hold a test arms for the next call of one service. The call waits until
// `release` runs, so a test reads the pending state on screen and slips a
// live event in before the response.
export type Hold = { release: () => void; released: Promise<void> };

export type Hooks = ReturnType<typeof createHooks>;

// One-shot hooks by dotted service name. Each entry serves one call and is
// gone. A hold and a failure on the same name apply in that order: the call
// waits, then throws.
export const createHooks = () => {
	const failures = new Map<string, Failure[]>();
	const holds = new Map<string, Promise<void>[]>();

	const push = <T>(map: Map<string, T[]>, path: string, value: T) => {
		const queue = map.get(path) ?? [];
		queue.push(value);
		map.set(path, queue);
	};

	const take = <T>(map: Map<string, T[]>, path: string) => map.get(path)?.shift();

	const failNext = (path: string, failure: Failure) => push(failures, path, failure);

	const holdNext = (path: string): Hold => {
		let release: () => void = () => {};
		const released = new Promise<void>((resolve) => {
			release = resolve;
		});
		push(holds, path, released);
		return { release, released };
	};

	return {
		failNext,
		holdNext,
		takeFailure: (path: string) => take(failures, path),
		takeHold: (path: string) => take(holds, path),
	};
};
