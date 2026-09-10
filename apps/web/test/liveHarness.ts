import { mock } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { createLive, type LiveStatus } from "../src/lib/live";
import { createFakeScheduler } from "./fakeScheduler";

// The fakes behind `createLive`: the Web Locks API, BroadcastChannel, and
// EventSource. Every fake is synchronous and driven by the test, so a test
// reads each step of the leader election and the reconnect loop.

type LockCallback = (lock: { name: string }) => Promise<unknown>;

// One lock per name. The first request holds it until its callback's
// promise settles; the next request in line takes it then.
export const createFakeLocks = () => {
	const holders = new Map<string, boolean>();
	const queues = new Map<string, Array<() => void>>();

	const grant = (name: string, callback: LockCallback, done: () => void) => {
		holders.set(name, true);
		void Promise.resolve(callback({ name })).finally(() => {
			holders.set(name, false);
			done();
			const next = queues.get(name)?.shift();
			if (next !== undefined) next();
		});
	};

	const request = (name: string, callback: LockCallback) =>
		new Promise<void>((resolve) => {
			const run = () => grant(name, callback, resolve);
			if (holders.get(name) === true) {
				const queue = queues.get(name) ?? [];
				queue.push(run);
				queues.set(name, queue);
				return;
			}
			run();
		});

	return { request, isHeld: (name: string) => holders.get(name) === true };
};

export type FakeChannel = {
	name: string;
	postMessage: (message: unknown) => void;
	addEventListener: (type: "message", listener: (event: { data: unknown }) => void) => void;
	removeEventListener: (type: "message", listener: (event: { data: unknown }) => void) => void;
	onmessage: ((event: { data: unknown }) => void) | null;
	close: () => void;
	// Every message this channel posted, oldest first.
	posted: unknown[];
	// Hands a message from another channel to this channel's listeners.
	deliver: (message: unknown) => void;
};

// One bus per origin. A message posted on a channel reaches every other
// open channel with the same name in the same tick, never the poster.
export const createFakeBus = () => {
	const channels = new Set<FakeChannel>();

	const createChannel = (name: string): FakeChannel => {
		const listeners = new Set<(event: { data: unknown }) => void>();
		const channel: FakeChannel = {
			name,
			posted: [],
			onmessage: null,
			postMessage: (message) => {
				channel.posted.push(message);
				for (const other of channels) {
					if (other === channel || other.name !== name) continue;
					other.deliver(message);
				}
			},
			addEventListener: (_type, listener) => {
				listeners.add(listener);
			},
			removeEventListener: (_type, listener) => {
				listeners.delete(listener);
			},
			close: () => {
				channels.delete(channel);
			},
			deliver: (message) => {
				const event = { data: message };
				channel.onmessage?.(event);
				for (const listener of listeners) listener(event);
			},
		};
		channels.add(channel);
		return channel;
	};

	return { createChannel, channels };
};

type Listener = (event: MessageEvent) => void;

// A recording EventSource. Listeners run synchronously from `emit`, so an
// exception in a handler reaches the test that emitted the frame.
export class FakeEventSource {
	readonly url: string;
	readonly openedAt: number;
	closed = false;
	onerror: ((event: Event) => void) | null = null;
	onopen: ((event: Event) => void) | null = null;
	onmessage: Listener | null = null;
	private readonly listeners = new Map<string, Set<Listener>>();

	constructor(url: string, openedAt: number) {
		this.url = url;
		this.openedAt = openedAt;
	}

	addEventListener(type: string, listener: Listener) {
		const set = this.listeners.get(type) ?? new Set();
		set.add(listener);
		this.listeners.set(type, set);
	}

	removeEventListener(type: string, listener: Listener) {
		this.listeners.get(type)?.delete(listener);
	}

	close() {
		this.closed = true;
	}

	// Emits one named frame with `data` as its JSON text.
	emit(type: string, id: string, data: unknown) {
		this.emitRaw(type, id, JSON.stringify(data));
	}

	emitRaw(type: string, id: string, data: string) {
		const event = new MessageEvent(type, { data, lastEventId: id });
		if (type === "message") this.onmessage?.(event);
		for (const listener of this.listeners.get(type) ?? []) listener(event);
	}

	open() {
		const event = new Event("open");
		this.onopen?.(event);
		for (const listener of this.listeners.get("open") ?? []) listener(event as MessageEvent);
	}

	fail() {
		const event = new Event("error");
		this.onerror?.(event);
		for (const listener of this.listeners.get("error") ?? []) listener(event as MessageEvent);
	}
}

export type Origin = ReturnType<typeof createOrigin>;

// One origin: the shared locks, bus, and clock every tab on it sees.
export const createOrigin = () => {
	const locks = createFakeLocks();
	const bus = createFakeBus();
	const clock = createFakeScheduler();
	return { locks, bus, ...clock };
};

export type TabOptions = {
	applyEvent?: (event: unknown, queryClient: QueryClient) => void;
};

// One tab: its own QueryClient, its own EventSource class, and a `live`
// built over the origin's fakes. `sources` lists every EventSource the tab
// constructed, oldest first.
export const createTab = (origin: Origin, options: TabOptions = {}) => {
	const queryClient = new QueryClient();
	const sources: FakeEventSource[] = [];
	const { scheduler } = origin;
	class TabEventSource extends FakeEventSource {
		constructor(url: string) {
			super(url, scheduler.now());
			sources.push(this);
		}
	}
	const statuses: LiveStatus[] = [];
	const live = createLive({
		queryClient,
		locks: origin.locks,
		createChannel: origin.bus.createChannel,
		EventSource: TabEventSource,
		scheduler,
		...(options.applyEvent === undefined ? {} : { applyEvent: options.applyEvent }),
	});
	live.status.subscribe(() => statuses.push(live.status.get()));
	return {
		queryClient,
		sources,
		live,
		statuses,
		latest: () => sources[sources.length - 1]!,
		applyEvent: options.applyEvent,
	};
};

export const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// Starts a tab and waits for the lock election to settle.
export const startTab = async (origin: Origin, options: TabOptions = {}) => {
	const tab = createTab(origin, options);
	tab.live.start();
	await flush();
	return tab;
};

export const recordingApplier = () => mock((_event: unknown, _queryClient: QueryClient) => {});
