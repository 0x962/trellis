import { closeSync, writeSync } from "node:fs";
import { constants } from "node:os";
import type { load } from "koffi";

export type LinuxExitWatcherOperations = {
	createQueue: () => { queue: number; wake: number };
	// Answers -1 when no process has this PID.
	openProcess: (pid: number) => number;
	add: (queue: number, descriptor: number) => void;
	// Resolves with the descriptors that became readable.
	wait: (queue: number) => Promise<number[]>;
	wake: (descriptor: number) => void;
	close: (descriptor: number) => void;
};

const eventCapacity = 64;
const epollIn = 0x001;
const epollControlAdd = 1;
const closeOnExec = 0x80000;

// sys/epoll.h packs struct epoll_event on x86_64 only. The 64-bit data field
// starts at byte 4 there and at byte 8 on arm64. The data field holds the
// descriptor.
const eventLayout = () => {
	if (process.arch === "x64") return { size: 12, data: 4 };
	if (process.arch === "arm64") return { size: 16, data: 8 };
	throw new Error(`The Linux runtime does not support ${process.arch}`);
};

type NativeFunction = ReturnType<ReturnType<typeof load>["func"]>;

export const exitWatcherSignatures = {
	pidfdOpen: "int pidfd_open(int pid, unsigned int flags)",
	epollCreate: "int epoll_create1(int flags)",
	epollControl: "int epoll_ctl(int epfd, int op, int fd, void *event)",
	epollWait: "int epoll_wait(int epfd, void *events, int maxevents, int timeout)",
	eventfd: "int eventfd(unsigned int initval, int flags)",
};

// `errno` is koffi.errno. The caller binds every native function, so this
// module loads no native code and its tests run under Bun.
export function nodeExitWatcherOperations(
	native: Record<keyof typeof exitWatcherSignatures, NativeFunction> & { errno: () => number },
): LinuxExitWatcherOperations {
	const layout = eventLayout();
	const { pidfdOpen, epollCreate, epollControl, epollWait, eventfd, errno } = native;
	const add = (queue: number, descriptor: number) => {
		const event = Buffer.alloc(layout.size);
		event.writeUInt32LE(epollIn, 0);
		event.writeInt32LE(descriptor, layout.data);
		if (epollControl(queue, epollControlAdd, descriptor, event) < 0)
			throw new Error(`Cannot add descriptor ${descriptor} to epoll: errno ${errno()}`);
	};
	return {
		createQueue() {
			const queue: number = epollCreate(closeOnExec);
			if (queue < 0) throw new Error(`epoll_create1 failed with errno ${errno()}`);
			const wake: number = eventfd(0, closeOnExec);
			if (wake < 0) throw new Error(`eventfd failed with errno ${errno()}`);
			add(queue, wake);
			return { queue, wake };
		},
		openProcess(pid) {
			const descriptor: number = pidfdOpen(pid, 0);
			if (descriptor >= 0) return descriptor;
			const failure = errno();
			if (failure === constants.errno.ESRCH) return -1;
			throw new Error(`Cannot open pidfd for process ${pid}: errno ${failure}`);
		},
		add,
		wait(queue) {
			const events = Buffer.alloc(layout.size * eventCapacity);
			return new Promise((resolve, reject) => {
				epollWait.async(queue, events, eventCapacity, -1, (error: Error | null, count: number) => {
					if (error) reject(error);
					else if (count < 0) reject(new Error(`epoll_wait failed with errno ${errno()}`));
					else
						resolve(Array.from({ length: count }, (_, index) => events.readInt32LE(index * layout.size + layout.data)));
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
}

// A pidfd refers to one process. It stays bound to that process after a
// reap, so a later process with the same PID cannot wake its listeners.
export class LinuxProcessExitWatcher {
	private queue: number | undefined;
	private wakeDescriptor: number | undefined;
	private waiting = false;
	private closing = false;
	private readonly byPid = new Map<number, { descriptor: number; listeners: Set<() => void> }>();
	private readonly byDescriptor = new Map<number, number>();

	constructor(private readonly operations: LinuxExitWatcherOperations) {}

	watch(pid: number, listener: () => void) {
		const existing = this.byPid.get(pid);
		if (existing !== undefined) {
			existing.listeners.add(listener);
			return;
		}
		if (this.queue === undefined) {
			const created = this.operations.createQueue();
			this.queue = created.queue;
			this.wakeDescriptor = created.wake;
		}
		const descriptor = this.operations.openProcess(pid);
		if (descriptor < 0) {
			queueMicrotask(listener);
			if (!this.waiting) this.finish();
			return;
		}
		this.operations.add(this.queue, descriptor);
		this.byPid.set(pid, { descriptor, listeners: new Set([listener]) });
		this.byDescriptor.set(descriptor, pid);
		if (!this.waiting) void this.wait();
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
		else this.operations.wake(this.wakeDescriptor!);
	}
}
