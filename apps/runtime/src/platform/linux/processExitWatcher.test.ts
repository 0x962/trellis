import { expect, test } from "bun:test";
import { type LinuxExitWatcherOperations, LinuxProcessExitWatcher } from "./processExitWatcher.ts";

function fixture() {
	const opened: number[] = [];
	const closed: number[] = [];
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
	const settle = async () => {
		for (let index = 0; index < 4; index++) await Promise.resolve();
	};
	return { operations, opened, closed, settle, ready: (descriptor: number) => release?.([descriptor]) };
}

test("each watch opens a new pidfd, so a reused PID has its own descriptor", async () => {
	const state = fixture();
	const watcher = new LinuxProcessExitWatcher(state.operations);
	let first = 0;
	watcher.watch(42, () => first++);
	state.ready(100);
	await state.settle();
	expect(first).toBe(1);
	expect(state.closed).toEqual([100, 11, 10]);
	let second = 0;
	watcher.watch(42, () => second++);
	state.ready(100);
	await state.settle();
	expect(second).toBe(0);
	state.ready(101);
	await state.settle();
	expect(second).toBe(1);
	expect(state.opened).toEqual([42, 42]);
});

test("a missing process notifies its listener at once", async () => {
	const state = fixture();
	state.operations.openProcess = () => -1;
	const watcher = new LinuxProcessExitWatcher(state.operations);
	let notifications = 0;
	watcher.watch(42, () => notifications++);
	await state.settle();
	expect(notifications).toBe(1);
	expect(state.closed).toEqual([11, 10]);
});

test("close wakes epoll and closes each descriptor", async () => {
	const state = fixture();
	const watcher = new LinuxProcessExitWatcher(state.operations);
	let notifications = 0;
	watcher.watch(42, () => notifications++);
	watcher.close();
	await state.settle();
	expect(notifications).toBe(0);
	expect(state.closed).toEqual([100, 11, 10]);
});
