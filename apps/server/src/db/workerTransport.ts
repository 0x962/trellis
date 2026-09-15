import { ORPCError } from "@orpc/server";
import type { RequestContext } from "../context.ts";
import type { JobsLog } from "../jobs.ts";
import type { DbTiming } from "../serverTiming.ts";
import { type ServiceName, services } from "../services/registry.ts";
import type { JobsStart, ServiceTransport, TransportStart, WorkerTransportOptions } from "./transport.ts";
import type { SerializedError, WorkerCall, WorkerInput, WorkerOutput } from "./worker.ts";

// The production ServiceTransport. The database, the services, the poller,
// and the maintenance timer run on one Bun Worker, `worker.ts`. This side
// batches the calls, relays gh spawns and log lines, and puts the events of
// the worker on the bus of the HTTP process.

// `timing` gains the database time the worker reports with the answer.
type PendingCall = { resolve: (value: unknown) => void; reject: (error: unknown) => void; timing?: DbTiming };

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
	let worker: Worker | null = null;
	let nextId = 1;
	let batchScheduled = false;
	const outgoing: WorkerCall[] = [];
	const pending = new Map<number, PendingCall>();
	const streams = new Map<number, StreamState>();
	// `start` and `close` make one cycle, and the inline transport runs the
	// cycle again after a close. The worker transport carries the same
	// interface, so each cycle gets its own gates: the second `start` waits
	// for the boot of its own worker, and the second `close` waits for the
	// goodbye of that worker. One pair of gates for the life of the
	// transport would settle on the first cycle and let every later `start`
	// return before its worker holds a database.
	let ready: PromiseWithResolvers<TransportStart> | null = null;
	let closed: PromiseWithResolvers<void> | null = null;
	let jobsLog: JobsLog;
	const fail = (error: unknown) => {
		ready?.reject(error);
		for (const call of pending.values()) call.reject(error);
		pending.clear();
		for (const stream of streams.values()) stream.controller.error(error);
		streams.clear();
	};

	const send = (message: WorkerInput) => worker?.postMessage(message);
	const flush = () => {
		batchScheduled = false;
		if (outgoing.length > 0) send({ type: "calls", calls: outgoing.splice(0) });
	};

	const receive = ({ data }: MessageEvent<WorkerOutput>) => {
		if (data.type === "ready") {
			ready?.resolve({ applied: data.applied, liveShas: data.liveShas });
			return;
		}
		if (data.type === "startError") {
			ready?.reject(fromError(data.error));
			return;
		}
		if (data.type === "result") {
			const call = pending.get(data.id)!;
			if (call.timing !== undefined) call.timing.ms += data.dbMs;
			call.resolve(data.result);
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
				const call = pending.get(data.id)!;
				if (call.timing !== undefined) call.timing.ms += data.dbMs;
				call.reject(error);
				pending.delete(data.id);
			}
			return;
		}
		if (data.type === "event") {
			bus.emit(data.event);
			return;
		}
		if (data.type === "log") {
			jobsLog(data.msg, data.fields);
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
		closed?.resolve();
	};

	// The jobs run on the worker, beside the database. Their log lines come
	// back as messages, so they reach the one logger of the process.
	const start = async (jobs?: JobsStart) => {
		if (worker !== null) throw new Error("the database worker is already running");
		const gate = Promise.withResolvers<TransportStart>();
		ready = gate;
		closed = Promise.withResolvers<void>();
		worker = new Worker(new URL("./worker.ts", import.meta.url).href, { name: "trellis-db" });
		worker.onmessage = receive;
		worker.onerror = (event) => fail(event.error);
		if (jobs !== undefined) jobsLog = jobs.log;
		send({
			type: "start",
			config,
			runtime: {
				version: runtime.version,
				bootId: runtime.bootId,
				source: runtime.source,
				ghBin: runtime.gh.bin,
				ghTimeoutMs: runtime.gh.timeoutMs,
			},
			jobs: jobs === undefined ? null : { clockRate: jobs.clockRate },
		});
		return gate.promise;
	};

	const call = (name: ServiceName, ctx: RequestContext, input: unknown, timing?: DbTiming) => {
		if (worker === null) return Promise.reject(new Error("the database worker is not running"));
		const id = nextId++;
		const promise = new Promise<unknown>((resolve, reject) => pending.set(id, { resolve, reject, timing }));
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

	// The worker drains the poller before it closes the database. This side
	// keeps answering gh relays until the worker says closed. A close with no
	// worker running returns at once, so a caller closes twice without a wait
	// on a goodbye that never comes.
	const close = async () => {
		const running = worker;
		const gate = closed;
		if (running === null || gate === null) return;
		flush();
		for (const id of streams.keys()) send({ type: "cancel", id });
		streams.clear();
		send({ type: "close" });
		await gate.promise;
		running.terminate();
		worker = null;
		ready = null;
		closed = null;
	};

	return { call, start, close };
};
