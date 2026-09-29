import { expect, test } from "bun:test";
import { scheduleLaunchDeadline } from "./launchDeadline.ts";

test("schedules the complete deadline across the platform timer range", () => {
	let now = 0;
	let deadlineCount = 0;
	const delays: number[] = [];
	const callbacks: Array<() => void> = [];
	const timeoutMs = 2_147_483_647 + 1000;
	scheduleLaunchDeadline(timeoutMs, () => deadlineCount++, {
		now: () => now,
		schedule: (callback, delayMs) => {
			delays.push(delayMs);
			callbacks.push(callback);
			return 1 as unknown as ReturnType<typeof setTimeout>;
		},
		setCurrentTimer: () => {},
	});

	expect(delays).toEqual([2_147_483_647]);
	now += delays[0]!;
	callbacks.shift()!();
	expect(deadlineCount).toBe(0);
	expect(delays).toEqual([2_147_483_647, 1000]);
	now += delays[1]!;
	callbacks.shift()!();
	expect(deadlineCount).toBe(1);
	expect(now).toBe(timeoutMs);
});

test("uses the remaining wall time after a late timer callback", () => {
	let now = 100;
	let deadlineCount = 0;
	const callbacks: Array<() => void> = [];
	scheduleLaunchDeadline(2_147_483_648, () => deadlineCount++, {
		now: () => now,
		schedule: (callback) => {
			callbacks.push(callback);
			return 1 as unknown as ReturnType<typeof setTimeout>;
		},
		setCurrentTimer: () => {},
	});

	now += 2_147_483_648;
	callbacks.shift()!();
	expect(callbacks).toHaveLength(0);
	expect(deadlineCount).toBe(1);
});
