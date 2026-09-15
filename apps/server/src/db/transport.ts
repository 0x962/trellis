import type { GhStatus, TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { createController } from "../agents/controller/controller.ts";
import { startNativeReconcile } from "../agents/nativeReconcile/host.ts";
import type { Config } from "../config.ts";
import { API_VERSION, type RequestContext, SYSTEM_ACTOR, systemContext } from "../context.ts";
import type { Bus } from "../events/bus.ts";
import type { GhRunner } from "../gh/run.ts";
import { type Jobs, type JobsLog, scaledClock, startJobs as startBackgroundJobs } from "../jobs.ts";
import type { DbTiming } from "../serverTiming.ts";
import { assertCurrentAttempt } from "../services/assignments/attempts.ts";
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

export type InlineTransport = ServiceTransport;

export type WorkerTransportOptions = { bus: Bus; config: Config; runtime: Runtime };

const MB = 1024 * 1024;

export const createInlineTransport = ({
	db,
	bus,
	config,
	runtime,
	applied = 0,
}: InlineTransportOptions): InlineTransport => {
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
		publicUrl: config.publicUrl,
	});

	// An `io` read never writes the actor, so a request without the header
	// carries the system actor there.
	const ioCtx = (ctx: RequestContext, emit: Emit, tasks: Array<() => Promise<void>>) => ({
		core: coreCtx(ctx, emit, tasks),
		localUrl: config.agentsUrl,
		publicUrl: config.publicUrl,
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
		newTx: <T>(fn: (tx: Tx) => Promise<T>) =>
			newTx(async (tx) => {
				await assertCurrentAttempt(ctx, tx);
				return fn(tx);
			}),
		vacuum: () => createMaintenance(db).runNow(),
	});

	const buildCtx = (entry: ServiceEntry, ctx: RequestContext, emit: Emit, tasks: Array<() => Promise<void>>) => {
		if (entry.family === "core") return coreCtx(ctx, emit, tasks);
		return ioCtx(ctx, emit, tasks);
	};

	// A `prepare` step runs first, with no transaction open. The commit comes
	// next, then the work queued for after it, then the events. A throw rolls
	// back the transaction of `run`, and none of its events reach the bus.
	// The events of `prepare` describe writes that its own short transactions
	// committed, so they reach the bus also when the call throws.
	const run = async (entry: ServiceEntry, ctx: RequestContext, rawInput: unknown) => {
		const tasks: Array<() => Promise<void>> = [];
		const early: TrellisEvent[] = [];
		try {
			if (entry.kind === "mutation" && "prepare" in entry) await newTx((tx) => assertCurrentAttempt(ctx, tx));
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
			const { result, events } = await withTx(db, async (tx, emit) => {
				if (entry.kind === "mutation") await assertCurrentAttempt(ctx, tx);
				return entry.run(buildCtx(entry, ctx, emit, tasks), tx, input);
			});
			for (const task of tasks) await task();
			for (const event of [...early.splice(0), ...events]) bus.emit(event, ctx.actor);
			return result;
		} catch (error) {
			for (const event of early) bus.emit(event, ctx.actor);
			throw error;
		}
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
	let controller: ReturnType<typeof createController> | null = null;
	let nativeReconcile: ReturnType<typeof startNativeReconcile> | null = null;
	let flowReconcile: ReturnType<typeof startNativeReconcile> | null = null;
	let reviewTimer: ReturnType<typeof setInterval> | undefined;
	const start = async (options?: JobsStart) => {
		await db.transaction((tx) => cache.rebuild(tx));
		await db.transaction((tx) =>
			tx.execute(
				sql`UPDATE agent_runs SET state = 'interrupted', error = 'Trellis stopped during startup. Refresh the status to reconnect to the workspace.' WHERE state = 'starting'`,
			),
		);
		await call("evidence.recover", systemContext(), {});
		await warmWrites(db, cache);
		const found = await db.execute(sql`SELECT DISTINCT sha256 FROM attachments`);
		if (options !== undefined) {
			await db.transaction((tx) =>
				tx.execute(
					sql`UPDATE review_deliveries SET state = 'unknown', error = 'Trellis stopped before delivery confirmation.' WHERE state = 'sending'`,
				),
			);
			reviewTimer = setInterval(() => {
				void call("reviews.deliverPending", systemContext(), {});
			}, 3000);
			const clock = scaledClock(options.clockRate);
			nativeReconcile = startNativeReconcile({
				tick: () => call("agentRuns.reconcileNative", systemContext(), {}),
				setTimer: clock.setTimer,
				clearTimer: clock.clearTimer,
				log: options.log,
			});
			flowReconcile = startNativeReconcile({
				tick: () => call("flowExecutions.reconcile", systemContext(), {}),
				setTimer: clock.setTimer,
				clearTimer: clock.clearTimer,
				log: options.log,
			});
			controller = createController({
				clock,
				log: options.log,
				call: (name, input) => call(name, systemContext(), input),
			});
			await controller.start();
			jobs = startBackgroundJobs({ db, gh: runtime.gh, bus, log: options.log, clock });
		}
		return { applied, liveShas: found.rows.map((row) => row.sha256 as string) };
	};

	const close = async () => {
		clearInterval(reviewTimer);
		await controller?.stop();
		await nativeReconcile?.stop();
		await flowReconcile?.stop();
		if (jobs !== null) await jobs.stop();
		await Promise.allSettled([...inFlight]);
	};

	return { call, start, close };
};
