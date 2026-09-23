import { ORPCError } from "@orpc/server";
import type { GhStatus } from "@trellis/api";
import { fail } from "../errors.ts";
import { createBus } from "../events/bus.ts";
import type { GhResult, GhRunner, GhSlot } from "../gh/run.ts";
import { createDbTiming } from "../serverTiming.ts";
import { type ServiceKind, services } from "../services/registry.ts";
import { openDatabase } from "./open.ts";
import { createInlineTransport, type Runtime, type ServiceTransport } from "./transport.ts";
import type { SerializedError, WorkerCall, WorkerInput, WorkerOutput } from "./workerProtocol.ts";

export type { SerializedError, WorkerCall, WorkerInput, WorkerOutput } from "./workerProtocol.ts";

declare const self: Worker;

const ranks: Record<ServiceKind, number> = { mutation: 0, read: 1, search: 2 };

export class ServiceQueue {
	private readonly calls: WorkerCall[] = [];

	get size() {
		return this.calls.length;
	}

	push(call: WorkerCall) {
		let dropped: WorkerCall | undefined;
		if (call.kind === "search") {
			const index = this.calls.findIndex((queued) => queued.kind === "search" && queued.clientId === call.clientId);
			if (index >= 0) [dropped] = this.calls.splice(index, 1);
		}
		this.calls.push(call);
		return dropped;
	}

	shift() {
		if (this.calls.length === 0) return undefined;
		let index = 0;
		for (let candidate = 1; candidate < this.calls.length; candidate += 1) {
			if (ranks[this.calls[candidate]!.kind] < ranks[this.calls[index]!.kind]) index = candidate;
		}
		return this.calls.splice(index, 1)[0];
	}
}

const errorOf = (error: unknown): SerializedError => {
	if (error instanceof ORPCError) {
		return {
			name: error.name,
			message: error.message,
			code: error.code,
			status: error.status,
			defined: error.defined,
			data: error.data,
		};
	}
	const typed = error as Error;
	return { name: typed.name, message: typed.message };
};

// The answer a search gets when a newer search of the same client takes its
// place in the queue. It is a declared error, so the page that sent it reads
// the code, waits for the newer search, and shows no failure.
const superseded = (): SerializedError => errorOf(fail("SEARCH_REPLACED"));

const startHost = () => {
	const queue = new ServiceQueue();
	// The clock reading when each queued call arrived, by call id. The time
	// from that reading to the start of the call is its wait in the queue.
	const received = new Map<number, number>();
	const ghCalls = new Map<number, (result: GhResult) => void>();
	// The listen addresses live in the HTTP process, which alone knows the
	// port. A service that reads them asks for them by id.
	const addressCalls = new Map<number, (addresses: string[]) => void>();
	let nextAddressId = 1;
	const streams = new Map<
		number,
		{ reader: ReadableStreamDefaultReader<Uint8Array>; done: () => void; reads: Promise<void>; cancelled: boolean }
	>();
	let nextGhId = 1;
	let transport: ServiceTransport | undefined;
	let database: Awaited<ReturnType<typeof openDatabase>> | undefined;
	let currentGhStatus: GhStatus;
	let draining = false;
	let scheduled = false;
	let closing = false;
	// The start builds the transport a call runs on. The host answers a call
	// only after the start settles, so a call that arrives during the boot
	// waits in the queue instead of reading a transport that is not there
	// yet. A start that throws answers every queued call with its error.
	const booted = Promise.withResolvers<void>();
	booted.promise.catch(() => undefined);

	const send = (message: WorkerOutput) => postMessage(message);
	// A start that threw leaves no transport, and can still leave the
	// database open, so the close reaches each part that exists and always
	// sends the goodbye the HTTP side waits for.
	const finish = async () => {
		await transport?.close();
		await database?.close();
		send({ type: "closed" });
	};

	const relayStream = async (id: number, stream: ReadableStream<Uint8Array>) => {
		const gate = Promise.withResolvers<void>();
		streams.set(id, { reader: stream.getReader(), done: gate.resolve, reads: Promise.resolve(), cancelled: false });
		send({ type: "stream", id });
		await gate.promise;
	};

	const run = async (call: WorkerCall) => {
		currentGhStatus = call.ghStatus;
		const timing = createDbTiming();
		timing.queueMs = performance.now() - received.get(call.id)!;
		received.delete(call.id);
		try {
			const result = await transport!.call(call.name, call.ctx, call.input, timing);
			if (result instanceof ReadableStream) await relayStream(call.id, result);
			else send({ type: "result", id: call.id, result, timing });
		} catch (error) {
			send({ type: "error", id: call.id, error: errorOf(error), timing });
		}
	};

	// A call with a `prepare` step spends most of its time in gh, outside the
	// database. It runs beside the queue, so the next call does not wait for
	// gh. Its own transaction still waits for the database like any other.
	const drain = async () => {
		if (draining) return;
		draining = true;
		const startError = await booted.promise.then(
			() => undefined,
			(error: unknown) => error,
		);
		while (queue.size > 0) {
			const call = queue.shift()!;
			if (startError !== undefined) {
				received.delete(call.id);
				send({ type: "error", id: call.id, error: errorOf(startError), timing: createDbTiming() });
			} else if ("prepare" in services[call.name]) void run(call);
			else await run(call);
		}
		draining = false;
		if (closing) await finish();
	};

	const schedule = () => {
		if (scheduled || draining) return;
		scheduled = true;
		setTimeout(() => {
			scheduled = false;
			void drain();
		}, 0);
	};

	const readStream = (id: number) => {
		const state = streams.get(id)!;
		state.reads = state.reads.then(async () => {
			const next = await state.reader.read();
			if (next.done) {
				streams.delete(id);
				if (!state.cancelled) send({ type: "streamEnd", id });
				state.done();
				return;
			}
			send({ type: "chunk", id, chunk: next.value as Uint8Array<ArrayBuffer> });
		});
	};

	self.onmessage = ({ data }: MessageEvent<WorkerInput>) => {
		if (data.type === "start") {
			void (async () => {
				database = await openDatabase(data.config.dbDir);
				const gh = Object.assign(
					(slot: GhSlot, args: string[]) =>
						new Promise<GhResult>((resolve) => {
							const id = nextGhId++;
							ghCalls.set(id, resolve);
							send({ type: "gh", id, slot, args });
						}),
					{ bin: data.runtime.ghBin, timeoutMs: data.runtime.ghTimeoutMs },
				) as GhRunner;
				const bus = createBus({ bootId: data.runtime.bootId });
				bus.subscribe(({ event }) => send({ type: "event", event }));
				const runtime: Runtime = {
					...data.runtime,
					gh,
					ghStatus: () => currentGhStatus,
					addresses: () =>
						new Promise<string[]>((resolve) => {
							const id = nextAddressId++;
							addressCalls.set(id, resolve);
							send({ type: "addresses", id });
						}),
				};
				const jobs = data.jobs;
				const log = (msg: string, fields?: Record<string, unknown>) => send({ type: "log", msg, fields });
				// The HTTP side has a logger only when the start carries jobs, so
				// the services send log lines only then.
				transport = createInlineTransport({
					db: database.db,
					bus,
					config: data.config,
					runtime,
					log: jobs === null ? undefined : log,
				});
				const started = await transport.start(jobs === null ? undefined : { clockRate: jobs.clockRate, log });
				send({ type: "ready", applied: database.applied, liveShas: started.liveShas });
				booted.resolve();
			})().catch((error: unknown) => {
				booted.reject(error);
				send({ type: "startError", error: errorOf(error) });
			});
			return;
		}
		if (data.type === "calls") {
			for (const call of data.calls) {
				received.set(call.id, performance.now());
				const dropped = queue.push(call);
				if (dropped) {
					received.delete(dropped.id);
					send({ type: "error", id: dropped.id, error: superseded(), timing: createDbTiming() });
				}
			}
			schedule();
			return;
		}
		if (data.type === "ghResult") {
			ghCalls.get(data.id)!(data.result);
			ghCalls.delete(data.id);
			return;
		}
		if (data.type === "addressesResult") {
			addressCalls.get(data.id)!(data.addresses);
			addressCalls.delete(data.id);
			return;
		}
		if (data.type === "pull") {
			readStream(data.id);
			return;
		}
		if (data.type === "cancel") {
			const stream = streams.get(data.id)!;
			stream.cancelled = true;
			streams.delete(data.id);
			void stream.reader.cancel().then(stream.done);
			return;
		}
		closing = true;
		// A close that arrives during the boot waits for it, so the close
		// never shuts a database that the start is still opening.
		if (draining || queue.size > 0) schedule();
		else void booted.promise.then(finish, finish);
	};
};

if (!Bun.isMainThread && Bun.main === import.meta.path) startHost();
