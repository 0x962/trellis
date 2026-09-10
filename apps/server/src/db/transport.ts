import type { GhStatus, TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { createSupersetRunner } from "../agents/supersetRunner.ts";
import type { Config } from "../config.ts";
import { API_VERSION, type RequestContext, SYSTEM_ACTOR } from "../context.ts";
import type { Bus } from "../events/bus.ts";
import type { GhRunner } from "../gh/run.ts";
import { type Jobs, type JobsLog, scaledClock, startJobs as startBackgroundJobs } from "../jobs.ts";
import type { DbTiming } from "../serverTiming.ts";
import { gcAttachmentBlobs } from "../services/attachments.ts";
import { type ServiceEntry, type ServiceName, services } from "../services/registry.ts";
import { createCache } from "./cache.ts";
import type { Db } from "./client.ts";
import { createMaintenance } from "./maintenance.ts";
import { pullStream } from "./pullStream.ts";
import { type Emit, type Tx, withTx } from "./tx.ts";
import { warmWrites } from "./warmWrites.ts";

export { createWorkerTransport } from "./workerTransport.ts";

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
// `start` with `jobs` also starts the poller and the maintenance timer in the
// thread that owns the database. `close` then drains the poller first, for
// up to 5 s, so no poller write runs after the database closes.
// `timing` gains the database time of the call before the call settles.
export type ServiceTransport = {
	call: (name: ServiceName, ctx: RequestContext, input: unknown, timing?: DbTiming) => Promise<unknown>;
	start: (jobs?: JobsStart) => Promise<TransportStart>;
	close: () => Promise<void>;
};

export type TransportStart = { applied: number; liveShas: string[] };

export type JobsStart = { clockRate: number; log: JobsLog };

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

	const newTx = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

	const coreCtx = (ctx: RequestContext, emit: Emit, tasks: Array<() => Promise<void>>) => ({
		...ctx,
		emit,
		cache,
		actorCache,
		dropBlobs: (shas: string[]) => {
			tasks.push(() => gcAttachmentBlobs({ home: config.home, newTx }, shas).then(() => undefined));
		},
	});

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
		newTx,
		vacuum: () => createMaintenance(db).runNow(),
	});

	// The runner spawns the superset binary from the thread that owns the
	// database, so a service reaches it the way it reaches the database.
	const runner = createSupersetRunner({ bin: config.supersetBin, url: config.agentsUrl });
	const agentsCtx = (ctx: RequestContext, emit: Emit, tasks: Array<() => Promise<void>>) => ({
		...coreCtx(ctx, emit, tasks),
		runner,
		newTx,
	});

	const buildCtx = (entry: ServiceEntry, ctx: RequestContext, emit: Emit, tasks: Array<() => Promise<void>>) => {
		if (entry.family === "core") return coreCtx(ctx, emit, tasks);
		return entry.family === "agents" ? agentsCtx(ctx, emit, tasks) : ioCtx(ctx, emit, tasks);
	};

	// A `prepare` step runs first, with no transaction open. The commit comes
	// next, then the work queued for after it, then the events. A throw rolls
	// everything back and nothing reaches the bus.
	const run = async (entry: ServiceEntry, ctx: RequestContext, rawInput: unknown) => {
		const tasks: Array<() => Promise<void>> = [];
		const early: TrellisEvent[] = [];
		const input =
			"prepare" in entry
				? await entry.prepare(
						buildCtx(entry, ctx, (event) => void early.push(event), tasks),
						rawInput,
					)
				: rawInput;
		if ("stream" in entry) {
			return pullStream((push) =>
				withTx(db, async (tx, emit) => {
					for await (const line of entry.stream(buildCtx(entry, ctx, emit, tasks), tx, input)) await push(line);
				}).then(() => undefined),
			);
		}
		const { result, events } = await withTx(db, (tx, emit) => entry.run(buildCtx(entry, ctx, emit, tasks), tx, input));
		for (const task of tasks) await task();
		for (const event of [...early, ...events]) bus.emit(event);
		return result;
	};

	// The time covers the transaction and the after-commit work, and counts
	// for a call that rejects as well.
	const call = (name: ServiceName, ctx: RequestContext, input: unknown, timing?: DbTiming) => {
		const started = performance.now();
		const promise = run(services[name], ctx, input).finally(() => {
			if (timing !== undefined) timing.ms += performance.now() - started;
		});
		inFlight.add(promise);
		promise.finally(() => inFlight.delete(promise)).catch(() => undefined);
		return promise;
	};

	let jobs: Jobs | null = null;
	const start = async (options?: JobsStart) => {
		await db.transaction((tx) => cache.rebuild(tx));
		await warmWrites(db, cache);
		const found = await db.execute(sql`SELECT DISTINCT sha256 FROM attachments`);
		if (options !== undefined) {
			const clock = scaledClock(options.clockRate);
			jobs = startBackgroundJobs({ db, gh: runtime.gh, bus, log: options.log, clock });
		}
		return { applied, liveShas: found.rows.map((row) => row.sha256 as string) };
	};

	const close = async () => {
		if (jobs !== null) await jobs.stop();
		await Promise.allSettled([...inFlight]);
	};

	return { call, start, close };
};
