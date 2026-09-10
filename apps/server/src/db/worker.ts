import { ORPCError } from "@orpc/server";
import type { GhStatus, TrellisEvent } from "@trellis/api";
import type { Config } from "../config.ts";
import type { RequestContext } from "../context.ts";
import { createBus } from "../events/bus.ts";
import type { GhResult, GhRunner, GhSlot } from "../gh/run.ts";
import { type ServiceKind, type ServiceName, services } from "../services/registry.ts";
import { openDb } from "./client.ts";
import { migrate } from "./migrate.ts";
import { openDatabase } from "./open.ts";
import { createInlineTransport, type Runtime, type ServiceTransport } from "./transport.ts";

declare const self: Worker;

export type WorkerCall = {
	type: "call";
	id: number;
	kind: ServiceKind;
	clientId?: string;
	name: ServiceName;
	ctx: RequestContext;
	input: unknown;
	ghStatus: GhStatus;
};

type WorkerRuntime = Pick<Runtime, "version" | "bootId"> & { ghBin: string; ghTimeoutMs: number };

export type WorkerInput =
	| { type: "start"; config: Config; runtime: WorkerRuntime; jobs: { clockRate: number } | null }
	| { type: "calls"; calls: WorkerCall[] }
	| { type: "ghResult"; id: number; result: GhResult }
	| { type: "addressesResult"; id: number; addresses: string[] }
	| { type: "pull"; id: number }
	| { type: "cancel"; id: number }
	| { type: "close" };

export type SerializedError = {
	name: string;
	message: string;
	code?: string;
	status?: number;
	defined?: boolean;
	data?: unknown;
};

export type WorkerOutput =
	| { type: "ready"; applied: number; liveShas: string[] }
	| { type: "startError"; error: SerializedError }
	| { type: "result"; id: number; result: unknown; dbMs: number }
	| { type: "error"; id: number; error: SerializedError; dbMs: number }
	| { type: "event"; event: TrellisEvent }
	| { type: "gh"; id: number; slot: GhSlot; args: string[] }
	| { type: "addresses"; id: number }
	| { type: "stream"; id: number }
	| { type: "chunk"; id: number; chunk: Uint8Array<ArrayBuffer> }
	| { type: "streamEnd"; id: number }
	| { type: "log"; msg: string; fields?: Record<string, unknown> }
	| { type: "closed" };

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

export const openWorkerDatabase = async (dataDir: string) => {
	const db = await openDb(dataDir);
	await migrate(db);
	return db;
};

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

const superseded = (): SerializedError => ({ name: "AbortError", message: "A newer search replaced this search." });

const startHost = () => {
	const queue = new ServiceQueue();
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
	let transport: ServiceTransport;
	let database: Awaited<ReturnType<typeof openDatabase>>;
	let currentGhStatus: GhStatus;
	let draining = false;
	let scheduled = false;
	let closing = false;

	const send = (message: WorkerOutput) => postMessage(message);
	const finish = async () => {
		await transport.close();
		await database.close();
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
		const timing = { ms: 0 };
		try {
			const result = await transport.call(call.name, call.ctx, call.input, timing);
			if (result instanceof ReadableStream) await relayStream(call.id, result);
			else send({ type: "result", id: call.id, result, dbMs: timing.ms });
		} catch (error) {
			send({ type: "error", id: call.id, error: errorOf(error), dbMs: timing.ms });
		}
	};

	// A call with a `prepare` step spends most of its time in gh, outside the
	// database. It runs beside the queue, so the next call does not wait for
	// gh. Its own transaction still waits for the database like any other.
	const drain = async () => {
		if (draining) return;
		draining = true;
		while (queue.size > 0) {
			const call = queue.shift()!;
			if ("prepare" in services[call.name]) void run(call);
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
				transport = createInlineTransport({ db: database.db, bus, config: data.config, runtime });
				const jobs = data.jobs;
				const log = (msg: string, fields?: Record<string, unknown>) => send({ type: "log", msg, fields });
				const started = await transport.start(jobs === null ? undefined : { clockRate: jobs.clockRate, log });
				send({ type: "ready", applied: database.applied, liveShas: started.liveShas });
			})().catch((error) => send({ type: "startError", error: errorOf(error) }));
			return;
		}
		if (data.type === "calls") {
			for (const call of data.calls) {
				const dropped = queue.push(call);
				if (dropped) send({ type: "error", id: dropped.id, error: superseded(), dbMs: 0 });
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
		if (draining || queue.size > 0) schedule();
		else void finish();
	};
};

if (!Bun.isMainThread && Bun.main === import.meta.path) startHost();
