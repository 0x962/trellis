import { expect, test } from "bun:test";
import { processCompletion } from "./processCompletion.ts";

test("completion waits for process cleanup and closed output streams", async () => {
	let finishCleanup = () => {};
	const cleanup = new Promise<void>((resolve) => (finishCleanup = resolve));
	const exits: (number | null)[] = [];
	const completion = processCompletion(
		() => cleanup,
		(code) => exits.push(code),
		() => {},
	);
	completion.leaderExited(7);
	finishCleanup();
	await cleanup;
	await Promise.resolve();
	expect(exits).toEqual([]);
	completion.closed(7);
	expect(exits).toEqual([7]);
});

test("a failed cleanup stays unconfirmed until an explicit stop succeeds", async () => {
	let attempts = 0;
	const exits: (number | null)[] = [];
	const failures: string[] = [];
	const completion = processCompletion(
		async () => {
			attempts++;
			if (attempts === 1) throw new Error("cannot confirm the empty cgroup");
		},
		(code) => exits.push(code),
		(error) => failures.push(error.message),
	);
	completion.closed(9);
	await Promise.resolve();
	expect(exits).toEqual([]);
	expect(failures).toEqual(["cannot confirm the empty cgroup"]);
	completion.stop();
	await Promise.resolve();
	expect(exits).toEqual([9]);
});
