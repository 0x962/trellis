import type { GhStatus } from "@trellis/api";
import type { Config } from "../../config.ts";
import type { RequestContext } from "../../context.ts";
import type { Bus } from "../../events/bus.ts";
import type { GhRunner } from "../../gh/run.ts";
import type { JobsLog } from "../../jobs.ts";
import type { DbTiming } from "../../serverTiming.ts";
import type { ServiceName } from "../../services/registry.ts";
import type { Db } from "../client.ts";

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

// `log` receives the `long transaction` lines. A transport without it, as in
// most tests, writes none. `longTransactionMs` is LONG_TRANSACTION_MS unless
// a test sets it.
export type InlineTransportOptions = {
	db: Db;
	bus: Bus;
	config: Config;
	runtime: Runtime;
	applied?: number;
	log?: JobsLog;
	longTransactionMs?: number;
};

export type InlineTransport = ServiceTransport;

export type WorkerTransportOptions = { bus: Bus; config: Config; runtime: Runtime };
