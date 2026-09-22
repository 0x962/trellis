import type { QueryClient } from "@tanstack/react-query";
import { applyEvent as applyApiEvent, eventNames, type Scheduler } from "@trellis/api";

export type LiveStatus = "connecting" | "live" | "reconnecting" | "restarting" | "down";

export type StatusStore = {
	get: () => LiveStatus;
	set: (value: LiveStatus) => void;
	subscribe: (listener: () => void) => () => void;
};

// A value with listeners. `set` with the same value notifies nobody.
export const createStatusStore = (initial: LiveStatus): StatusStore => {
	let value = initial;
	const listeners = new Set<() => void>();
	return {
		get: () => value,
		set: (next) => {
			if (next === value) return;
			value = next;
			for (const listener of listeners) listener();
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
};

// The browser APIs the connection uses, as the shapes the fakes implement.
type LocksLike = { request: (name: string, callback: (lock: unknown) => Promise<unknown>) => Promise<unknown> };
type ChannelLike = {
	postMessage: (message: unknown) => void;
	addEventListener: (type: "message", listener: (event: { data: unknown }) => void) => void;
	close: () => void;
};
type SourceLike = {
	addEventListener: (type: string, listener: (event: MessageEvent) => void) => void;
	close: () => void;
};

export type LiveOptions = {
	queryClient: QueryClient;
	locks: LocksLike;
	createChannel: (name: string) => ChannelLike;
	EventSource: new (url: string) => SourceLike;
	scheduler: Scheduler;
	applyEvent?: (event: unknown, queryClient: QueryClient) => void;
};

export type Live = {
	start: () => void;
	stop: () => Promise<void>;
	isLeader: () => boolean;
	lastId: () => string | null;
	bootId: () => string | null;
	status: StatusStore;
};

// One SSE frame as it crosses the tab channel.
type FrameMessage = { id: string; type: string; data: unknown };
type StatusMessage = { type: "status"; value: LiveStatus };
type StatusRequest = { type: "status-request" };

export const lockName = "trellis-sse";
export const channelName = "trellis-events";
export const eventsPath = "/api/events";

// The reopen delays after a failure, then the last one again.
export const backoffMs = [1000, 2000, 4000, 8000];
// A short blip shows nothing; the banner waits this long.
export const reconnectingAfterMs = 3000;
// This many failed reopens in a row mean the server is down.
export const downAfterFailures = 4;

// One EventSource per origin. The tab that holds the trellis-sse lock owns
// the connection and rebroadcasts every frame over the channel. Every tab,
// the leader included, feeds applyEvent once per data event. The leader's
// status travels over the channel, so a follower's dot and banner mirror it.
// A failed connection reopens from the last id with the backoff above; a
// `bye` reopens after 1 s. Every ready but the first refetches active
// queries, because the gap between two connections may exceed the server's
// ring buffer, and so does a ready from another boot.
export const createLive = (options: LiveOptions): Live => {
	const { queryClient, locks, createChannel, EventSource, scheduler } = options;
	const applyEvent = options.applyEvent ?? applyApiEvent;
	const status = createStatusStore("connecting");
	let channel: ChannelLike | null = null;
	let source: SourceLike | null = null;
	let leader = false;
	let stopped = false;
	let lastId: string | null = null;
	let bootId: string | null = null;
	let hadReady = false;
	let attempt = 0;
	let reopenFailures = 0;
	let reconnectTimer: unknown;
	let reconnectingTimer: unknown;
	let releaseLock: (() => void) | null = null;
	let lockPromise: Promise<unknown> | null = null;

	const invalidateAll = () => {
		void queryClient.invalidateQueries();
	};

	const refreshActiveAfterReconnect = () => {
		void queryClient.invalidateQueries({ refetchType: "none" });
		void queryClient.refetchQueries({ type: "active" });
	};

	const clearTimer = (handle: unknown) => {
		if (handle !== undefined) scheduler.clearTimeout(handle);
	};

	const handleFrame = (type: string, data: unknown) => {
		if (type === "ready") {
			const payload = data as { bootId: string };
			const first = !hadReady;
			const bootChanged = bootId !== null && bootId !== payload.bootId;
			hadReady = true;
			bootId = payload.bootId;
			if (leader) {
				attempt = 0;
				reopenFailures = 0;
				clearTimer(reconnectingTimer);
				reconnectingTimer = undefined;
				status.set("live");
			}
			if (!first || bootChanged) refreshActiveAfterReconnect();
			return;
		}
		if (type === "reset") {
			invalidateAll();
			return;
		}
		if (type === "bye") {
			if (!leader) return;
			status.set("restarting");
			source?.close();
			source = null;
			attempt = 0;
			scheduleReconnect(backoffMs[0]!);
			return;
		}
		applyEvent({ type, ...(data as object) }, queryClient);
	};

	const scheduleReconnect = (delay: number) => {
		reconnectTimer = scheduler.setTimeout(() => {
			reconnectTimer = undefined;
			connect();
		}, delay);
	};

	const onError = (failed: SourceLike) => {
		if (failed !== source) return;
		failed.close();
		source = null;
		if (attempt > 0) reopenFailures += 1;
		if (reopenFailures >= downAfterFailures) {
			status.set("down");
		} else if (reconnectingTimer === undefined && status.get() !== "reconnecting" && status.get() !== "down") {
			reconnectingTimer = scheduler.setTimeout(() => {
				reconnectingTimer = undefined;
				status.set("reconnecting");
			}, reconnectingAfterMs);
		}
		scheduleReconnect(backoffMs[Math.min(attempt, backoffMs.length - 1)]!);
		attempt += 1;
	};

	const connect = () => {
		if (stopped) return;
		const url = lastId === null ? eventsPath : `${eventsPath}?since=${lastId}`;
		const next = new EventSource(url);
		source = next;
		for (const type of eventNames) {
			next.addEventListener(type, (event) => {
				const data: unknown = JSON.parse(event.data);
				if (event.lastEventId !== "") lastId = event.lastEventId;
				channel?.postMessage({ id: event.lastEventId, type, data } satisfies FrameMessage);
				handleFrame(type, data);
			});
		}
		next.addEventListener("error", () => onError(next));
	};

	const onMessage = (event: { data: unknown }) => {
		const message = event.data as FrameMessage | StatusMessage | StatusRequest;
		if (message.type === "status-request") {
			if (leader) channel?.postMessage({ type: "status", value: status.get() } satisfies StatusMessage);
			return;
		}
		if (leader) return;
		if (message.type === "status") {
			status.set((message as StatusMessage).value);
			return;
		}
		const frame = message as FrameMessage;
		if (frame.id !== "") lastId = frame.id;
		handleFrame(frame.type, frame.data);
	};

	const becomeLeader = () =>
		new Promise<void>((resolve) => {
			releaseLock = resolve;
			if (stopped) {
				resolve();
				return;
			}
			leader = true;
			connect();
		});

	const start = () => {
		channel = createChannel(channelName);
		channel.addEventListener("message", onMessage);
		status.subscribe(() => {
			if (leader) channel?.postMessage({ type: "status", value: status.get() } satisfies StatusMessage);
		});
		channel.postMessage({ type: "status-request" } satisfies StatusRequest);
		lockPromise = locks.request(lockName, becomeLeader);
	};

	const stop = async () => {
		stopped = true;
		clearTimer(reconnectTimer);
		clearTimer(reconnectingTimer);
		source?.close();
		source = null;
		leader = false;
		releaseLock?.();
		await lockPromise;
		channel?.close();
		channel = null;
	};

	return {
		start,
		stop,
		isLeader: () => leader,
		lastId: () => lastId,
		bootId: () => bootId,
		status,
	};
};
