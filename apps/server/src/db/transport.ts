import { ORPCError } from "@orpc/server";
import type { GhStatus } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { Config } from "../config.ts";
import { API_VERSION, type RequestContext, SYSTEM_ACTOR } from "../context.ts";
import type { Bus } from "../events/bus.ts";
import type { GhRunner } from "../gh/run.ts";
import { type ServiceEntry, type ServiceName, services } from "../services/registry.ts";
import { createCache } from "./cache.ts";
import type { Db } from "./client.ts";
import { pullStream } from "./pullStream.ts";
import { type Emit, type Tx, withTx } from "./tx.ts";
import type { SerializedError, WorkerCall, WorkerInput, WorkerOutput } from "./worker.ts";

// The facts of the running process a service reports or uses: the package
// version, the boot id, the gh runner, the gh state the poller keeps, and
// the URLs the listener answers on.
export type Runtime = {
	version: string;
	bootId: string;
	gh: GhRunner;
	ghStatus: () => GhStatus;
	addresses: () => Promise<string[]>;
};

// How the HTTP process reaches the services. `call` runs one service in
// one transaction and resolves with its result, or rejects with the
// contract error the service threw. `start` loads what the services need
// before the first call. `close` waits for the calls in flight. The inline
// implementation runs on the calling thread; the worker implementation
// runs the same calls on a Worker and carries the same interface.
export type ServiceTransport = {
	call: (name: ServiceName, ctx: RequestContext, input: unknown) => Promise<unknown>;
	start: () => Promise<TransportStart>;
	close: () => Promise<void>;
};

export type TransportStart = { applied: number; liveShas: string[] };

export type InlineTransportOptions = { db: Db; bus: Bus; config: Config; runtime: Runtime; applied?: number };

export type WorkerTransportOptions = { bus: Bus; config: Config; runtime: Runtime };

const MB = 1024 * 1024;

export const createInlineTransport = ({
	db,
	bus,
	config,
	runtime,
	applied = 0,
}: InlineTransportOptions): ServiceTransport => {
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
		addresses: runtime.addresses,
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
		const found = await db.execute(sql`SELECT DISTINCT sha256 FROM attachments`);
		return { applied, liveShas: found.rows.map((row) => row.sha256 as string) };
	};

	const close = async () => {
		await Promise.allSettled([...inFlight]);
	};

	return { call, start, close };
};

type PendingCall = { resolve: (value: unknown) => void; reject: (error: unknown) => void };

type StreamState = {
	controller: ReadableStreamDefaultController<Uint8Array>;
	pulled?: () => void;
};

const fromError = (error: SerializedError) => {
	if (error.code !== undefined) {
		return new ORPCError(error.code, {
			defined: error.defined,
			status: error.status,
			message: error.message,
			data: error.data,
		});
	}
	const result = new Error(error.message);
	result.name = error.name;
	return result;
};

export const createWorkerTransport = ({ bus, config, runtime }: WorkerTransportOptions): ServiceTransport => {
	let worker: Worker;
	let nextId = 1;
	let batchScheduled = false;
	const outgoing: WorkerCall[] = [];
	const pending = new Map<number, PendingCall>();
	const streams = new Map<number, StreamState>();
	const ready = Promise.withResolvers<TransportStart>();
	const closed = Promise.withResolvers<void>();
	const fail = (error: unknown) => {
		ready.reject(error);
		for (const call of pending.values()) call.reject(error);
		pending.clear();
		for (const stream of streams.values()) stream.controller.error(error);
		streams.clear();
	};

	const send = (message: WorkerInput) => worker.postMessage(message);
	const flush = () => {
		batchScheduled = false;
		if (outgoing.length > 0) send({ type: "calls", calls: outgoing.splice(0) });
	};

	const receive = ({ data }: MessageEvent<WorkerOutput>) => {
		if (data.type === "ready") {
			ready.resolve({ applied: data.applied, liveShas: data.liveShas });
			return;
		}
		if (data.type === "startError") {
			ready.reject(fromError(data.error));
			return;
		}
		if (data.type === "result") {
			pending.get(data.id)!.resolve(data.result);
			pending.delete(data.id);
			return;
		}
		if (data.type === "error") {
			const error = fromError(data.error);
			const stream = streams.get(data.id);
			if (stream) {
				stream.controller.error(error);
				stream.pulled?.();
				streams.delete(data.id);
			} else {
				pending.get(data.id)!.reject(error);
				pending.delete(data.id);
			}
			return;
		}
		if (data.type === "event") {
			bus.emit(data.event);
			return;
		}
		if (data.type === "gh") {
			void runtime.gh(data.slot, data.args).then((result) => send({ type: "ghResult", id: data.id, result }));
			return;
		}
		if (data.type === "addresses") {
			void runtime.addresses().then((addresses) => send({ type: "addressesResult", id: data.id, addresses }));
			return;
		}
		if (data.type === "stream") {
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					streams.set(data.id, { controller });
				},
				pull() {
					send({ type: "pull", id: data.id });
					return new Promise<void>((resolve) => {
						streams.get(data.id)!.pulled = resolve;
					});
				},
				cancel() {
					streams.delete(data.id);
					send({ type: "cancel", id: data.id });
				},
			});
			pending.get(data.id)!.resolve(stream);
			pending.delete(data.id);
			return;
		}
		if (data.type === "chunk") {
			const stream = streams.get(data.id)!;
			stream.controller.enqueue(data.chunk);
			stream.pulled?.();
			stream.pulled = undefined;
			return;
		}
		if (data.type === "streamEnd") {
			const stream = streams.get(data.id)!;
			stream.controller.close();
			stream.pulled?.();
			streams.delete(data.id);
			return;
		}
		closed.resolve();
	};

	const start = async () => {
		worker = new Worker(new URL("./worker.ts", import.meta.url).href, { name: "trellis-db" });
		worker.onmessage = receive;
		worker.onerror = (event) => fail(event.error);
		send({
			type: "start",
			config,
			runtime: {
				version: runtime.version,
				bootId: runtime.bootId,
				ghBin: runtime.gh.bin,
				ghTimeoutMs: runtime.gh.timeoutMs,
			},
		});
		return ready.promise;
	};

	const call = (name: ServiceName, ctx: RequestContext, input: unknown) => {
		const id = nextId++;
		const promise = new Promise<unknown>((resolve, reject) => pending.set(id, { resolve, reject }));
		const entry = services[name];
		outgoing.push({
			type: "call",
			id,
			kind: entry.kind,
			clientId: entry.kind === "search" ? (ctx.session ?? ctx.reqId) : undefined,
			name,
			ctx,
			input,
			ghStatus: runtime.ghStatus(),
		});
		if (!batchScheduled) {
			batchScheduled = true;
			queueMicrotask(flush);
		}
		return promise;
	};

	const close = async () => {
		flush();
		for (const id of streams.keys()) send({ type: "cancel", id });
		streams.clear();
		send({ type: "close" });
		await closed.promise;
		worker.terminate();
	};

	return { call, start, close };
};
