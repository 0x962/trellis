import { expect, test } from "bun:test";
import { LinuxProcessExitWatcher, type LinuxExitWatcherOperations } from "./linuxProcessExitWatcher.ts";

function fixture() {
	const closed: number[] = [];
	const opened: number[] = [];
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
		exit: (descriptor: number) => release?.([descriptor]),
	};
}

test("pidfd observation follows the opened process across PID reuse", async () => {
	const state = fixture();
	const watcher = new LinuxProcessExitWatcher(state.operations);
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
	const watcher = new LinuxProcessExitWatcher(state.operations);
	let notifications = 0;
	watcher.watch(42, () => notifications++);
	await Promise.resolve();
	expect(notifications).toBe(1);
	expect(state.closed).toEqual([11, 10]);
});

test("close wakes epoll and closes each pidfd", async () => {
	const state = fixture();
	const watcher = new LinuxProcessExitWatcher(state.operations);
	watcher.watch(42, () => {});
	watcher.close();
	await Promise.resolve();
	await Promise.resolve();
	expect(state.closed).toEqual([100, 11, 10]);
});
