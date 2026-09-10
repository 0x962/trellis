import type { AgentSettings } from "@trellis/api";
import type { Bus } from "../events/bus.ts";
import type { JobsLog } from "../jobs.ts";
import type { ServiceName } from "../services/registry.ts";
import { type Batch, createDispatcher, type Dispatcher, type DispatcherClock } from "./dispatcher.ts";

// The agents host keeps one manager per enabled project and wakes it with
// the batches of the dispatcher. It runs in the thread that owns the
// database and reaches the database only through the services, which
// `call` runs as the system actor.
//
// Nothing runs while the global switch of the agent settings is off. At
// start the host marks the sessions whose terminal is gone, starts the
// manager of each enabled project, and watches those projects. A settings
// change starts the manager of a project turned on and stops watching a
// project turned off; its manager and its builders keep running.
//
// Start and reload run one at a time, in call order. A runner that fails
// for one project is logged and the other projects go on.
//
// A watchdog runs every WATCHDOG_MS. An agent that holds a terminal and
// never called agents.register waits for an answer it will not get, such
// as the folder trust dialog. The watchdog writes that reason onto the
// session, so the person reads it instead of a badge that says Starting.

// How often the watchdog looks for an agent that never registered.
export const WATCHDOG_MS = 60_000;

export type AgentsHostOptions = {
	bus: Bus;
	clock: DispatcherClock;
	log: JobsLog;
	call: (name: ServiceName, input: unknown) => Promise<unknown>;
	projects: { scope: (projectId: string) => string[]; path: (projectId: string) => string };
};

export type AgentsHost = {
	start: () => Promise<void>;
	reload: () => Promise<void>;
	// Resolves when the start and every reload called so far are done.
	idle: () => Promise<void>;
	stop: () => void;
	dispatcher: Dispatcher;
};

export const createAgentsHost = (options: AgentsHostOptions): AgentsHost => {
	const failed = (msg: string, fields: Record<string, unknown>) => (error: unknown) =>
		options.log(msg, { ...fields, message: (error as Error).message });

	// The wake moves no cursor: a batch the runner refused stays in the inbox,
	// and the next batch points the manager at it.
	const flush = (batch: Batch) =>
		options
			.call("agents.wake", { project: batch.projectId, text: batch.text })
			.then(
				() => void options.bus.emit({ type: "agents.batch", projectId: batch.projectId, count: batch.count }),
				failed("agents wake", { projectId: batch.projectId }),
			);

	const dispatcher = createDispatcher({ ...options.projects, bus: options.bus, clock: options.clock, flush });

	const settings = () => options.call("agents.settings", undefined) as Promise<AgentSettings>;

	let watchdog: number | null = null;
	// The returned promise lets a test with a fake clock wait for the sweep
	// the timer started.
	const sweep = (): Promise<unknown> =>
		options
			.call("agents.stalled", {})
			.catch(failed("agents watchdog", {}))
			.finally(() => {
				if (watchdog !== null) watchdog = options.clock.setTimer(sweep, WATCHDOG_MS);
			});

	const sync = async (current: AgentSettings) => {
		// A project that just gained a runner project gets that repo root as
		// its first trusted folder, so its agents skip the trust dialog.
		if (current.enabled) await options.call("agents.trustBackfill", {}).catch(failed("agents trusted roots", {}));
		const wanted = current.enabled ? current.projects.filter((row) => row.enabled).map((row) => row.projectId) : [];
		for (const projectId of dispatcher.watched()) {
			if (!wanted.includes(projectId)) dispatcher.unwatch(projectId);
		}
		for (const projectId of wanted.filter((id) => !dispatcher.watched().includes(id))) {
			await options.call("agents.ensureManager", { project: projectId }).catch(failed("agents manager", { projectId }));
			dispatcher.watch(projectId);
		}
	};

	let chain = Promise.resolve();
	const serial = (work: () => Promise<void>) => {
		chain = chain.then(work).catch(failed("agents", {}));
		return chain;
	};

	return {
		start: () =>
			serial(async () => {
				const current = await settings();
				if (!current.enabled) return;
				await options.call("agents.reconcile", {}).catch(failed("agents reconcile", {}));
				await sync(current);
				watchdog = options.clock.setTimer(sweep, WATCHDOG_MS);
			}),
		reload: () => serial(async () => sync(await settings())),
		idle: () => chain,
		stop: () => {
			if (watchdog !== null) options.clock.clearTimer(watchdog);
			watchdog = null;
			dispatcher.stop();
		},
		dispatcher,
	};
};
