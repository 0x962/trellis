import type { GhStatus, TrellisEvent } from "@trellis/api";
import { ulid } from "ulid";
import type { Db } from "../../src/db/client.ts";
import { createMaintenance } from "../../src/db/maintenance.ts";
import type { Emit, Tx } from "../../src/db/tx.ts";
import type { GhRunner } from "../../src/gh/run.ts";

export type ActorRef = { name: string; kind: "human" | "agent" | "system" };

// The context every service takes first. `emit` queues an event that reaches
// the sink after the commit. `afterCommit` queues work that runs once the
// transaction commits, which is where a blob is unlinked. `newTx` opens a
// further transaction for that work, because the service transaction is
// closed by then. `ghStatus` reads the state the poller keeps, so the health
// check and the banner report the same words.
export type ServiceCtx = {
	actor: ActorRef;
	session: string | null;
	home: string;
	maxUploadBytes: number;
	version: string;
	apiVersion: string;
	bootId: string;
	now: () => Date;
	gh: GhRunner;
	ghStatus: () => GhStatus;
	addresses: () => Promise<string[]>;
	emit: Emit;
	afterCommit: (task: () => Promise<void>) => void;
	newTx: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
	vacuum: () => Promise<void>;
};

export const navidCtxActor: ActorRef = { name: "navid", kind: "human" };

// A runner that fails the test when a service spawns gh where the outcome
// says it must not.
export const noGh: GhRunner = Object.assign(
	() => {
		throw new Error("this test expects no gh call");
	},
	{ bin: "gh", timeoutMs: 0 },
) as unknown as GhRunner;

export const signedInGh = (): GhStatus => ({
	ok: true,
	user: "navid",
	reason: null,
	message: null,
	checkedAt: "2026-09-09T10:00:00.000Z",
});

export type CtxHandle = {
	ctx: ServiceCtx;
	tasks: Array<() => Promise<void>>;
	runAfterCommit: () => Promise<void>;
};

export type CtxOptions = {
	db: Db;
	home: string;
	actor?: ActorRef;
	gh?: GhRunner;
	ghStatus?: () => GhStatus;
	addresses?: () => string[];
	now?: () => Date;
	maxUploadBytes?: number;
};

export const testCtx = (options: CtxOptions): CtxHandle => {
	const tasks: Array<() => Promise<void>> = [];
	const ctx: ServiceCtx = {
		actor: options.actor ?? navidCtxActor,
		session: null,
		home: options.home,
		maxUploadBytes: options.maxUploadBytes ?? 50 * 1024 * 1024,
		version: "0.1.0",
		apiVersion: "1",
		bootId: ulid(),
		now: options.now ?? (() => new Date()),
		gh: options.gh ?? noGh,
		ghStatus: options.ghStatus ?? signedInGh,
		addresses: async () => (options.addresses ?? (() => ["http://127.0.0.1:4521"]))(),
		emit: () => {},
		afterCommit: (task) => {
			tasks.push(task);
		},
		newTx: (fn) => options.db.transaction(fn),
		vacuum: () => createMaintenance(options.db).runNow(),
	};
	return {
		ctx,
		tasks,
		runAfterCommit: async () => {
			for (const task of tasks.splice(0)) await task();
		},
	};
};

// The sink withTx calls after the commit. The array stays empty while the
// transaction is open, so a test can prove an event waits for the commit.
export const eventSink = () => {
	const delivered: TrellisEvent[] = [];
	return { delivered, sink: (events: TrellisEvent[]) => void delivered.push(...events) };
};

export const withEmit = (ctx: ServiceCtx, emit: Emit): ServiceCtx => ({ ...ctx, emit });
