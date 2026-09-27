import { expect, test } from "bun:test";
import type { LinuxLifecycleEvent } from "./cgroup.ts";
import { LinuxProcessExitWatcher, type LinuxExitWatcherOperations } from "./linuxProcessExitWatcher.ts";

function fixture() {
	const closed: number[] = [];
	const opened: number[] = [];
	const events: LinuxLifecycleEvent[] = [];
	let nextDescriptor = 100;
	let release: ((descriptors: number[]) => void) | undefined;
	const operations: LinuxExitWatcherOperations = {
		createQueue: () => ({ queue: 10, wake: 11 }),
		openProcess(pid) {
			opened.push(pid);
			return nextDescriptor++;
		},
		add: () => {},
		wait: () => new Promise((resolve) => (release = resolve)),
		wake: () => release?.([11]),
		close: (descriptor) => closed.push(descriptor),
	};
	return {
		operations,
		opened,
		closed,
		events,
		exit: (descriptor: number) => release?.([descriptor]),
		watcher: () =>
			new LinuxProcessExitWatcher(
				operations,
				(pid) => ({ attemptId: "attempt-one", pid, path: "/sys/fs/cgroup/attempt-one" }),
				(event) => events.push(event),
			),
	};
}

test("pidfd observation follows the opened process across PID reuse", async () => {
	const state = fixture();
	const watcher = state.watcher();
	let first = 0;
	watcher.watch(42, () => first++);
	state.exit(100);
	await Promise.resolve();
	await Promise.resolve();
	expect(first).toBe(1);
	expect(state.closed).toContain(100);
	let second = 0;
	watcher.watch(42, () => second++);
	state.exit(101);
	await Promise.resolve();
	await Promise.resolve();
	expect(second).toBe(1);
	expect(state.opened).toEqual([42, 42]);
});

test("a missing process notifies its listener without a poll", async () => {
	const state = fixture();
	state.operations.openProcess = () => -1;
	const watcher = state.watcher();
	let notifications = 0;
	watcher.watch(42, () => notifications++);
	await Promise.resolve();
	expect(notifications).toBe(1);
	expect(state.closed).toEqual([11, 10]);
});

test("close wakes epoll and closes each pidfd", async () => {
	const state = fixture();
	const watcher = state.watcher();
	watcher.watch(42, () => {});
	watcher.close();
	await Promise.resolve();
	await Promise.resolve();
	expect(state.closed).toEqual([100, 11, 10]);
	expect(state.events).toContainEqual({
		attemptId: "attempt-one",
		pid: 42,
		cgroupPath: "/sys/fs/cgroup/attempt-one",
		operation: "watcher-close",
		outcome: "succeeded",
		error: null,
	});
});
