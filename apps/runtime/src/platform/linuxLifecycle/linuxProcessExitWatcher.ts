import { closeSync, writeSync } from "node:fs";
import { constants } from "node:os";
import { errno, load } from "koffi";

export type LinuxExitWatcherOperations = {
	createQueue: () => { queue: number; wake: number };
	openProcess: (pid: number) => number;
	add: (queue: number, descriptor: number) => void;
	wait: (queue: number) => Promise<number[]>;
	wake: (descriptor: number) => void;
	close: (descriptor: number) => void;
};

const eventSize = 12;
const eventCapacity = 64;
const epollIn = 0x001;
const epollHangup = 0x010;
const epollAdd = 1;
const closeOnExec = 0x80000;
const pidfdOpenSystemCall = 434;

const nodeOperations = (): LinuxExitWatcherOperations => {
	if (process.arch !== "x64" && process.arch !== "arm64")
		throw new Error(`pidfd does not support the ${process.arch} runtime target`);
	const library = load(null);
	const syscall = library.func("long syscall(long number, ...)");
	const epollCreate = library.func("int epoll_create1(int flags)");
	const epollControl = library.func("int epoll_ctl(int epfd, int operation, int fd, void *event)");
	const epollWait = library.func("int epoll_wait(int epfd, void *events, int capacity, int timeout)");
	const eventfd = library.func("int eventfd(unsigned int initial, int flags)");
	const event = (descriptor: number) => {
		const buffer = Buffer.alloc(eventSize);
		buffer.writeUInt32LE(epollIn | epollHangup, 0);
		buffer.writeInt32LE(descriptor, 4);
		return buffer;
	};
	const add = (queue: number, descriptor: number) => {
		if (epollControl(queue, epollAdd, descriptor, event(descriptor)) < 0)
			throw new Error(`Cannot add descriptor ${descriptor} to epoll: errno ${errno()}`);
	};
	return {
		createQueue() {
			const queue: number = epollCreate(closeOnExec);
			if (queue < 0) throw new Error(`epoll_create1 failed with errno ${errno()}`);
			const wake: number = eventfd(0, closeOnExec);
			if (wake < 0) {
				closeSync(queue);
				throw new Error(`eventfd failed with errno ${errno()}`);
			}
			try {
				add(queue, wake);
			} catch (error) {
				closeSync(wake);
				closeSync(queue);
				throw error;
			}
			return { queue, wake };
		},
		openProcess(pid) {
			const descriptor: number = syscall(pidfdOpenSystemCall, "int", pid, "unsigned int", 0);
			if (descriptor >= 0) return descriptor;
			const failure = errno();
			if (failure === constants.errno.ESRCH) return -1;
			throw new Error(`Cannot open pidfd for process ${pid}: errno ${failure}`);
		},
		add,
		wait(queue) {
			const events = Buffer.alloc(eventSize * eventCapacity);
			return new Promise<number[]>((resolve, reject) => {
				epollWait.async(queue, events, eventCapacity, -1, (error: Error | null, count: number) => {
					if (error) {
						reject(error);
						return;
					}
					if (count < 0) {
						reject(new Error(`epoll_wait failed with errno ${errno()}`));
						return;
					}
					resolve(Array.from({ length: count }, (_, index) => events.readInt32LE(index * eventSize + 4)));
				});
			});
		},
		wake(descriptor) {
			const value = Buffer.alloc(8);
			value.writeBigUInt64LE(1n);
			writeSync(descriptor, value);
		},
		close: closeSync,
	};
};

export class LinuxProcessExitWatcher {
	private queue: number | undefined;
	private wakeDescriptor: number | undefined;
	private waiting = false;
	private closing = false;
	private readonly byPid = new Map<number, { descriptor: number; listeners: Set<() => void> }>();
	private readonly byDescriptor = new Map<number, number>();

	constructor(private readonly operations: LinuxExitWatcherOperations = nodeOperations()) {}

	watch(pid: number, listener: () => void) {
		const existing = this.byPid.get(pid);
		if (existing !== undefined) {
			existing.listeners.add(listener);
			return;
		}
		this.ensureQueue();
		const descriptor = this.operations.openProcess(pid);
		if (descriptor < 0) {
			queueMicrotask(listener);
			if (this.byPid.size === 0) this.finish();
			return;
		}
		try {
			this.operations.add(this.queue!, descriptor);
		} catch (error) {
			this.operations.close(descriptor);
			if (this.byPid.size === 0) this.finish();
			throw error;
		}
		this.byPid.set(pid, { descriptor, listeners: new Set([listener]) });
		this.byDescriptor.set(descriptor, pid);
		if (!this.waiting) void this.wait();
	}

	private ensureQueue() {
		if (this.queue !== undefined) return;
		const created = this.operations.createQueue();
		this.queue = created.queue;
		this.wakeDescriptor = created.wake;
	}

	private finish() {
		for (const { descriptor } of this.byPid.values()) this.operations.close(descriptor);
		this.byPid.clear();
		this.byDescriptor.clear();
		if (this.wakeDescriptor !== undefined) this.operations.close(this.wakeDescriptor);
		if (this.queue !== undefined) this.operations.close(this.queue);
		this.wakeDescriptor = undefined;
		this.queue = undefined;
		this.waiting = false;
	}

	private async wait() {
		if (this.closing || this.byPid.size === 0) {
			this.finish();
			return;
		}
		this.waiting = true;
		const descriptors = await this.operations.wait(this.queue!);
		if (descriptors.includes(this.wakeDescriptor!)) {
			this.finish();
			return;
		}
		for (const descriptor of descriptors) {
			const pid = this.byDescriptor.get(descriptor);
			if (pid === undefined) continue;
			const entry = this.byPid.get(pid)!;
			this.byPid.delete(pid);
			this.byDescriptor.delete(descriptor);
			this.operations.close(descriptor);
			for (const notify of entry.listeners) notify();
		}
		void this.wait();
	}

	close() {
		this.closing = true;
		if (!this.waiting) this.finish();
		else if (this.wakeDescriptor !== undefined) this.operations.wake(this.wakeDescriptor);
	}
}
