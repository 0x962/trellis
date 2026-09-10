import type { GhStatus } from "@trellis/api";
import type { Config } from "../config.ts";
import { API_VERSION, type RequestContext, SYSTEM_ACTOR } from "../context.ts";
import type { Bus } from "../events/bus.ts";
import type { GhRunner } from "../gh/run.ts";
import { type ServiceEntry, type ServiceName, services } from "../services/registry.ts";
import { createCache } from "./cache.ts";
import type { Db } from "./client.ts";
import { type Emit, type Tx, withTx } from "./tx.ts";

// The facts of the running process a service reports or uses: the package
// version, the boot id, the gh runner, and the gh state the poller keeps.
export type Runtime = {
	version: string;
	bootId: string;
	gh: GhRunner;
	ghStatus: () => GhStatus;
};

// How the HTTP process reaches the services. `call` runs one service in
// one transaction and resolves with its result, or rejects with the
// contract error the service threw. `start` loads what the services need
// before the first call. `close` waits for the calls in flight. The inline
// implementation runs on the calling thread; the worker implementation
// runs the same calls on a Worker and carries the same interface.
export type ServiceTransport = {
	call: (name: ServiceName, ctx: RequestContext, input: unknown) => Promise<unknown>;
	start: () => Promise<void>;
	close: () => Promise<void>;
};

export type InlineTransportOptions = { db: Db; bus: Bus; config: Config; runtime: Runtime };

const MB = 1024 * 1024;

const encoder = new TextEncoder();

// The bytes a stream holds for a reader that has not caught up. Below it
// the producer runs free; above it the producer waits for the next pull.
const STREAM_BUFFER_BYTES = 8 * MB;

// A stream fed by a producer that runs inside one transaction. The
// producer starts on the first pull and runs ahead of the reader by up to
// STREAM_BUFFER_BYTES, so a small export finishes at once and frees the
// database, and a large one never holds more than the buffer in memory.
// A cancel makes the pending `push` throw, so the transaction behind it
// rolls back.
const pullStream = (produce: (push: (chunk: string) => Promise<void>) => Promise<void>) => {
	let started = false;
	let cancelled = false;
	let onPull: (() => void) | null = null;
	let onChunk: (() => void) | null = null;
	const settle = () => {
		onChunk?.();
		onChunk = null;
	};
	return new ReadableStream<Uint8Array>(
		{
			pull(controller) {
				return new Promise<void>((resolve) => {
					onChunk = resolve;
					if (started) {
						onPull?.();
						onPull = null;
						return;
					}
					started = true;
					const push = async (chunk: string) => {
						controller.enqueue(encoder.encode(chunk));
						settle();
						if ((controller.desiredSize ?? 0) > 0) return;
						await new Promise<void>((next) => {
							onPull = next;
						});
						if (cancelled) throw new Error("The stream was cancelled before the producer finished.");
					};
					produce(push).then(
						() => {
							if (!cancelled) controller.close();
							settle();
						},
						(error: unknown) => {
							if (!cancelled) controller.error(error);
							settle();
						},
					);
				});
			},
			cancel() {
				cancelled = true;
				onPull?.();
			},
		},
		new ByteLengthQueuingStrategy({ highWaterMark: STREAM_BUFFER_BYTES }),
	);
};

export const createInlineTransport = ({ db, bus, config, runtime }: InlineTransportOptions): ServiceTransport => {
	const cache = createCache();
	const actorCache = new Map<string, number>();
	const inFlight = new Set<Promise<unknown>>();

	const coreCtx = (ctx: RequestContext, emit: Emit) => ({ ...ctx, emit, cache, actorCache });

	// An `io` read never writes the actor, so a request without the header
	// carries the system actor there.
	const ioCtx = (ctx: RequestContext, emit: Emit, tasks: Array<() => Promise<void>>) => ({
		actor: ctx.actor ?? SYSTEM_ACTOR,
		session: ctx.session,
		home: config.home,
		maxUploadBytes: config.maxUploadMb * MB,
		version: runtime.version,
		apiVersion: API_VERSION,
		bootId: runtime.bootId,
		now: () => ctx.now,
		gh: runtime.gh,
		ghStatus: runtime.ghStatus,
		emit,
		afterCommit: (task: () => Promise<void>) => {
			tasks.push(task);
		},
		newTx: <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn),
	});

	const buildCtx = (entry: ServiceEntry, ctx: RequestContext, emit: Emit, tasks: Array<() => Promise<void>>) =>
		entry.family === "core" ? coreCtx(ctx, emit) : ioCtx(ctx, emit, tasks);

	// The commit comes first, then the work queued for after it, then the
	// events. A throw rolls everything back and nothing reaches the bus.
	const run = async (entry: ServiceEntry, ctx: RequestContext, input: unknown) => {
		const tasks: Array<() => Promise<void>> = [];
		if ("stream" in entry) {
			return pullStream((push) =>
				withTx(db, async (tx, emit) => {
					for await (const line of entry.stream(buildCtx(entry, ctx, emit, tasks), tx, input)) await push(line);
				}).then(() => undefined),
			);
		}
		const { result, events } = await withTx(db, (tx, emit) => entry.run(buildCtx(entry, ctx, emit, tasks), tx, input));
		for (const task of tasks) await task();
		for (const event of events) bus.emit(event);
		return result;
	};

	const call = (name: ServiceName, ctx: RequestContext, input: unknown) => {
		const promise = run(services[name], ctx, input);
		inFlight.add(promise);
		promise.finally(() => inFlight.delete(promise)).catch(() => undefined);
		return promise;
	};

	const start = async () => {
		await db.transaction((tx) => cache.rebuild(tx));
	};

	const close = async () => {
		await Promise.allSettled([...inFlight]);
	};

	return { call, start, close };
};
