import type { AgentActivity, TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { nativeClient } from "../agents/native/connection.ts";
import { startNativeReconcile } from "../agents/nativeReconcile/host.ts";
import { startRepeatingCall } from "../agents/repeatingCall.ts";
import { startReviewDeliveryLoop } from "../agents/reviewDeliveryLoop.ts";
import { startSessionMonitor } from "../agents/sessionMonitor/sessionMonitor.ts";
import { API_VERSION, type RequestContext, SYSTEM_ACTOR, systemContext } from "../context.ts";
import { type Jobs, scaledClock, startJobs as startBackgroundJobs } from "../jobs.ts";
import { type DbTiming, LONG_TRANSACTION_MS } from "../serverTiming.ts";
import { recordObservedActivity } from "../services/agentRuns/activity.ts";
import { restoreHarnesses } from "../services/agentRuns/restoreHarnesses.ts";
import { assertCurrentAttempt } from "../services/assignments/attempts.ts";
import { gcBlobs } from "../services/blobs.ts";
import { collectUnheldPageObjects } from "../services/pages/pages.ts";
import { type ServiceEntry, type ServiceName, services } from "../services/registry.ts";
import type { IoCtx } from "../services/support.ts";
import type { SweepResult } from "../services/sweep/prepareSweep.ts";
import { createCache } from "./cache.ts";
import { createMeasuredTransaction } from "./createMeasuredTransaction";
import { createMaintenance } from "./maintenance.ts";
import { pullStream } from "./pullStream.ts";
import { allResourceBlobShas } from "./queries/epicResources.ts";
import { allPrFileBlobShas } from "./queries/prFiles.ts";
import type { InlineTransport, InlineTransportOptions, JobsStart } from "./transportTypes";
import { type Emit, type Tx, withTx } from "./tx.ts";
import { warmWrites } from "./warmWrites.ts";

export type {
	InlineTransport,
	InlineTransportOptions,
	JobsStart,
	Runtime,
	ServiceTransport,
	TransportStart,
	WorkerTransportOptions,
} from "./transportTypes";
export { createWorkerTransport } from "./workerTransport.ts";

const MB = 1024 * 1024;

// The time between two sweeps of finished agent files.
export const FILE_SWEEP_MS = 60 * 60 * 1000;

export const createInlineTransport = ({
	db,
	bus,
	config,
	runtime,
	applied = 0,
	log = () => undefined,
	longTransactionMs = LONG_TRANSACTION_MS,
}: InlineTransportOptions): InlineTransport => {
	const cache = createCache();
	const actorCache = new Map<string, number>();
	const inFlight = new Set<Promise<unknown>>();
	const backgroundTasks = new Set<Promise<void>>();

	const newTx = <T>(fn: (tx: Tx) => Promise<T>) => db.transaction(fn);

	const coreCtx = (ctx: RequestContext, emit: Emit, tasks: Array<() => Promise<void>>, transaction = newTx) => ({
		...ctx,
		emit,
		cache,
		actorCache,
		dropBlobs: (shas: string[]) => {
			tasks.push(() => gcBlobs({ home: config.home, newTx: transaction }, shas).then(() => undefined));
		},
		dropPageObjects: (shas: string[]) => {
			tasks.push(() => collectUnheldPageObjects({ home: config.home, newTx: transaction }, shas).then(() => undefined));
		},
		publicUrl: config.publicUrl,
	});

	// An `io` read never writes the actor, so a request without the header
	// carries the system actor there.
	const ioCtx = (ctx: RequestContext, emit: Emit, tasks: Array<() => Promise<void>>, transaction = newTx): IoCtx => ({
		core: coreCtx(ctx, emit, tasks, transaction),
		installationHome: config.installationHome,
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
		ghStatus: runtime.ghStatus,
		addresses: runtime.addresses,
		log,
		emit,
		afterCommit: (task: () => Promise<void>) => {
			tasks.push(task);
		},
		background: (task) => {
			const pending: Array<() => Promise<void>> = [];
			const background = ioCtx({ ...ctx, now: new Date() }, (event) => bus.emit(event, ctx.actor), pending);
			const work = (async () => {
				await task(background);
				for (const followup of pending) await followup();
			})()
				.catch((error: unknown) => {
					log("background task failed", { error: error instanceof Error ? error.message : String(error) });
				})
				.finally(() => backgroundTasks.delete(work));
			backgroundTasks.add(work);
		},
		newTx: <T>(fn: (tx: Tx) => Promise<T>) =>
			transaction(async (tx) => {
				await assertCurrentAttempt(ctx, tx);
				return fn(tx);
			}),
		vacuum: () => createMaintenance(db).runNow(),
	});

	// A `prepare` step runs first, with no transaction open. Only its context
	// carries the gh runner. The commit comes next, then the work queued for
	// after it, then the events. A throw rolls back the transaction of `run`,
	// and none of its events reach the bus. The events of `prepare` describe
	// writes that its own short transactions committed, so they reach the bus
	// also when the call throws.
	const run = async (name: ServiceName, ctx: RequestContext, rawInput: unknown, timing?: DbTiming) => {
		const transaction = createMeasuredTransaction(db, { name, reqId: ctx.reqId, log, longTransactionMs, timing });
		const entry: ServiceEntry = services[name];
		const tasks: Array<() => Promise<void>> = [];
		const early: TrellisEvent[] = [];
		try {
			if (entry.kind === "mutation" && "prepare" in entry) await transaction((tx) => assertCurrentAttempt(ctx, tx));
			const input =
				"prepare" in entry
					? await entry.prepare(
							{
								...ioCtx(ctx, (event) => void early.push(event), tasks, transaction),
								gh: runtime.gh,
								releaseId: config.releaseId,
							},
							rawInput,
						)
					: rawInput;
			if ("stream" in entry) {
				return pullStream((push) =>
					withTx({ transaction }, async (tx, emit) => {
						for await (const line of entry.stream(ioCtx(ctx, emit, tasks, transaction), tx, input)) await push(line);
					}).then(() => undefined),
				);
			}
			const { result, events } = await withTx({ transaction }, async (tx, emit) => {
				if (entry.kind === "mutation") await assertCurrentAttempt(ctx, tx);
				if (entry.family === "core") return entry.run(coreCtx(ctx, emit, tasks, transaction), tx, input);
				return entry.run(ioCtx(ctx, emit, tasks, transaction), tx, input);
			});
			for (const task of tasks) await task();
			for (const event of [...early.splice(0), ...events]) bus.emit(event, ctx.actor);
			return result;
		} catch (error) {
			for (const event of early) bus.emit(event, ctx.actor);
			throw error;
		}
	};

	const call = (name: ServiceName, ctx: RequestContext, input: unknown, timing?: DbTiming) => {
		const promise = run(name, ctx, input, timing);
		inFlight.add(promise);
		promise.finally(() => inFlight.delete(promise)).catch(() => undefined);
		return promise;
	};

	const backgroundCall = (name: ServiceName, input: unknown) => call(name, systemContext(), input);

	let sessionMonitor: ReturnType<typeof startSessionMonitor> | null = null;
	let jobs: Jobs | null = null;
	let pageDelivery: ReturnType<typeof startRepeatingCall> | null = null;
	let reviewDelivery: ReturnType<typeof startReviewDeliveryLoop> | null = null;
	let flowReconcile: ReturnType<typeof startNativeReconcile> | null = null;
	let fileSweep: ReturnType<typeof startNativeReconcile> | null = null;
	const start = async (options?: JobsStart) => {
		await db.transaction((tx) => restoreHarnesses({ home: config.home }, tx));
		await db.transaction((tx) => cache.rebuild(tx));
		await warmWrites(db, cache);
		const found = await db.execute(sql`SELECT sha256 FROM attachments`);
		const prFiles = await db.transaction(allPrFileBlobShas);
		const resources = await db.transaction(allResourceBlobShas);
		if (options !== undefined) {
			const clock = scaledClock(options.clockRate);
			sessionMonitor = startSessionMonitor({
				read: () => backgroundCall("agentRuns.activity", {}) as Promise<AgentActivity[]>,
				record: (input) => db.transaction((tx) => recordObservedActivity(systemContext(), tx, input)),
				client: nativeClient(config.home),
				emit: (event) => bus.emit(event),
				complete: (input) => backgroundCall("sessions.nameFirstExchange", input),
				log: options.log,
			});
			flowReconcile = startNativeReconcile({
				tick: () => backgroundCall("flowExecutions.reconcile", {}),
				allowConcurrentTicks: true,
				setTimer: clock.setTimer,
				clearTimer: clock.clearTimer,
				log: options.log,
			});
			// The sweep of finished agent files runs once at boot and then once
			// an hour. Its first tick runs before the port answers, so a home
			// with a large backlog is swept in the background of the boot.
			fileSweep = startNativeReconcile({
				// One line per sweep holds the counts and the scratch bytes, so
				// the log says that the sweep ran and what it took away. A
				// directory that the sweep cannot remove fails at every sweep,
				// so its own message gives a person a word to search for.
				tick: async () => {
					const result = (await backgroundCall("system.sweep", {})) as SweepResult;
					options.log("sweep agent files", result);
					if (result.errors.length > 0)
						options.log("sweep could not remove", { count: result.errors.length, errors: result.errors });
				},
				setTimer: clock.setTimer,
				clearTimer: clock.clearTimer,
				log: options.log,
				intervalMs: FILE_SWEEP_MS,
			});
			pageDelivery = startRepeatingCall({
				clock,
				log: options.log,
				failureLogMessage: "Page comment delivery failed",
				call: () => backgroundCall("pages.dispatchWatches", {}),
			});
			reviewDelivery = startReviewDeliveryLoop({
				clock,
				log: options.log,
				call: () => backgroundCall("reviews.dispatchDeliveries", {}),
			});
			jobs = startBackgroundJobs({
				db,
				cache,
				actorCache,
				publicUrl: config.publicUrl,
				gh: runtime.gh,
				bus,
				log: options.log,
				clock,
			});
		}
		return {
			applied,
			liveShas: [...new Set([...found.rows.map((row) => row.sha256 as string), ...prFiles, ...resources])],
		};
	};

	const close = async () => {
		await sessionMonitor?.stop();
		await reviewDelivery?.stop();
		await pageDelivery?.stop();
		await flowReconcile?.stop();
		await fileSweep?.stop();
		if (jobs !== null) await jobs.stop();
		await Promise.allSettled([...inFlight]);
		while (backgroundTasks.size > 0) await Promise.all([...backgroundTasks]);
	};

	return { call, start, close };
};
