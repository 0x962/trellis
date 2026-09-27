import { closeSync } from "node:fs";
import { constants } from "node:os";
import { errno, load } from "koffi";

type ExitWatcher = {
	watch: (pid: number, listener: () => void) => void;
	close: () => void;
};

type NativeFunction = ReturnType<ReturnType<typeof load>["func"]>;

const keventSize = 32;
const eventCapacity = 64;
const eventFilterProcess = -5;
const eventFilterUser = -10;
const eventAdd = 0x01;
const eventOneShot = 0x10;
const eventClear = 0x20;
const noteExit = 0x80000000;
const noteTrigger = 0x01000000;

const darwinEvent = (pid: number, filter: number, flags: number, options: number) => {
	const bytes = Buffer.alloc(keventSize);
	bytes.writeBigUInt64LE(BigInt(pid), 0);
	bytes.writeInt16LE(filter, 8);
	bytes.writeUInt16LE(flags, 10);
	bytes.writeUInt32LE(options, 12);
	return bytes;
};

class DarwinProcessExitWatcher implements ExitWatcher {
	private descriptor: number | undefined;
	private waiting = false;
	private closing = false;
	private readonly listeners = new Map<number, Set<() => void>>();
	private readonly kqueue: NativeFunction;
	private readonly kevent: NativeFunction;

	constructor() {
		const library = load(null);
		this.kqueue = library.func("int kqueue(void)");
		this.kevent = library.func(
			"int kevent(int kq, void *changes, int nchanges, void *events, int nevents, void *timeout)",
		);
	}

	watch(pid: number, listener: () => void) {
		if (this.descriptor === undefined) {
			const descriptor: number = this.kqueue();
			if (descriptor < 0) throw new Error(`kqueue failed with errno ${errno()}`);
			this.descriptor = descriptor;
			if (this.kevent(this.descriptor, darwinEvent(0, eventFilterUser, eventAdd | eventClear, 0), 1, null, 0, null) < 0)
				throw new Error(`Cannot register process watcher shutdown: errno ${errno()}`);
		}
		const listeners = this.listeners.get(pid) ?? new Set();
		listeners.add(listener);
		this.listeners.set(pid, listeners);
		if (
			this.kevent(
				this.descriptor,
				darwinEvent(pid, eventFilterProcess, eventAdd | eventOneShot, noteExit),
				1,
				null,
				0,
				null,
			) < 0
		) {
			this.listeners.delete(pid);
			if (errno() !== constants.errno.ESRCH) throw new Error(`Cannot watch process ${pid}: errno ${errno()}`);
			queueMicrotask(() => {
				for (const notify of listeners) notify();
			});
		}
		if (!this.waiting) this.wait();
	}

	private wait() {
		if (this.listeners.size === 0 || this.closing) {
			closeSync(this.descriptor!);
			this.descriptor = undefined;
			this.waiting = false;
			this.listeners.clear();
			return;
		}
		this.waiting = true;
		const events = Buffer.alloc(keventSize * eventCapacity);
		this.kevent.async(this.descriptor, null, 0, events, eventCapacity, null, (error: Error | null, count: number) => {
			if (error) throw error;
			if (count < 0) throw new Error("The process exit watcher failed");
			for (let index = 0; index < count; index++) {
				const offset = index * keventSize;
				if (events.readInt16LE(offset + 8) !== eventFilterProcess) continue;
				const pid = Number(events.readBigUInt64LE(offset));
				const listeners = this.listeners.get(pid);
				this.listeners.delete(pid);
				for (const notify of listeners ?? []) notify();
			}
			this.wait();
		});
	}

	close() {
		this.closing = true;
		if (
			this.descriptor !== undefined &&
			this.kevent(this.descriptor, darwinEvent(0, eventFilterUser, 0, noteTrigger), 1, null, 0, null) < 0
		)
			throw new Error(`Cannot stop process exit watcher: errno ${errno()}`);
	}
}

const LinuxProcessExitWatcher =
	process.platform === "linux"
		? (await import("./platform/linuxLifecycle/linuxProcessExitWatcher.ts")).LinuxProcessExitWatcher
		: undefined;

export class ProcessExitWatcher implements ExitWatcher {
	private readonly watcher: ExitWatcher;

	constructor() {
		if (process.platform === "darwin") this.watcher = new DarwinProcessExitWatcher();
		else if (process.platform === "linux")
			this.watcher = new (
				LinuxProcessExitWatcher as typeof import("./platform/linuxLifecycle/linuxProcessExitWatcher.ts").LinuxProcessExitWatcher
			)();
		else throw new Error(`Process exit observation does not support ${process.platform}`);
	}

	watch(pid: number, listener: () => void) {
		this.watcher.watch(pid, listener);
	}

	close() {
		this.watcher.close();
	}
}
