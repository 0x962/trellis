import { closeSync } from "node:fs";
import { constants } from "node:os";
import { errno, load } from "koffi";

const library = load(null);
const kqueue = library.func("int kqueue(void)");
const kevent = library.func(
	"int kevent(int kq, void *changes, int nchanges, void *events, int nevents, void *timeout)",
);
// macOS sys/event.h defines the 32-byte kevent layout used by the native calls.
const KEVENT_SIZE = 32;
const EVENT_CAPACITY = 64;
const EVFILT_PROC = -5;
const EVFILT_USER = -10;
const EV_ADD = 0x01;
const EV_ONESHOT = 0x10;
const EV_CLEAR = 0x20;
const NOTE_EXIT = 0x80000000;
const NOTE_TRIGGER = 0x01000000;

const event = (pid: number, filter: number, flags: number, options: number) => {
	const bytes = Buffer.alloc(KEVENT_SIZE);
	bytes.writeBigUInt64LE(BigInt(pid), 0);
	bytes.writeInt16LE(filter, 8);
	bytes.writeUInt16LE(flags, 10);
	bytes.writeUInt32LE(options, 12);
	return bytes;
};

export class ProcessExitWatcher {
	private descriptor: number | undefined;
	private waiting = false;
	private closing = false;
	private readonly listeners = new Map<number, Set<() => void>>();
	watch(pid: number, listener: () => void) {
		if (this.descriptor === undefined) {
			const descriptor: number = kqueue();
			if (descriptor < 0) throw new Error(`kqueue failed with errno ${errno()}`);
			this.descriptor = descriptor;
			if (kevent(this.descriptor, event(0, EVFILT_USER, EV_ADD | EV_CLEAR, 0), 1, null, 0, null) < 0)
				throw new Error(`Cannot register process watcher shutdown: errno ${errno()}`);
		}
		const listeners = this.listeners.get(pid) ?? new Set();
		listeners.add(listener);
		this.listeners.set(pid, listeners);
		if (kevent(this.descriptor, event(pid, EVFILT_PROC, EV_ADD | EV_ONESHOT, NOTE_EXIT), 1, null, 0, null) < 0) {
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
		const events = Buffer.alloc(KEVENT_SIZE * EVENT_CAPACITY);
		kevent.async(this.descriptor, null, 0, events, EVENT_CAPACITY, null, (error: Error | null, count: number) => {
			if (error) throw error;
			if (count < 0) throw new Error("The process exit watcher failed");
			for (let index = 0; index < count; index++) {
				const offset = index * KEVENT_SIZE;
				if (events.readInt16LE(offset + 8) !== EVFILT_PROC) continue;
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
			kevent(this.descriptor, event(0, EVFILT_USER, 0, NOTE_TRIGGER), 1, null, 0, null) < 0
		)
			throw new Error(`Cannot stop process exit watcher: errno ${errno()}`);
	}
}
