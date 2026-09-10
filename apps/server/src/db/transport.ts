import type { GhStatus } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { Config } from "../config.ts";
import { API_VERSION, type RequestContext, SYSTEM_ACTOR } from "../context.ts";
import type { Bus } from "../events/bus.ts";
import type { GhRunner } from "../gh/run.ts";
import { type Jobs, type JobsLog, scaledClock, startJobs as startBackgroundJobs } from "../jobs.ts";
import { type ServiceEntry, type ServiceName, services } from "../services/registry.ts";
import { createCache } from "./cache.ts";
import type { Db } from "./client.ts";
import { createMaintenance } from "./maintenance.ts";
import { pullStream } from "./pullStream.ts";
import { type Emit, type Tx, withTx } from "./tx.ts";

export { createWorkerTransport } from "./workerTransport.ts";

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
// `startJobs` starts the poller and the maintenance timer in the thread that
// owns the database. `stopJobs` stops them and must settle before `close`.
export type ServiceTransport = {
	call: (name: ServiceName, ctx: RequestContext, input: unknown) => Promise<unknown>;
	start: () => Promise<TransportStart>;
	startJobs: (options: JobsStart) => void;
	stopJobs: () => Promise<void>;
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
		vacuum: () => createMaintenance(db).runNow(),
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

	let jobs: Jobs;
	const startJobs = ({ clockRate, log }: JobsStart) => {
		jobs = startBackgroundJobs({ db, gh: runtime.gh, bus, log, clock: scaledClock(clockRate) });
	};
	const stopJobs = () => jobs.stop();

	const close = async () => {
		await Promise.allSettled([...inFlight]);
	};

	return { call, start, startJobs, stopJobs, close };
};
