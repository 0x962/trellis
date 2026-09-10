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
// A watched project also gets a heartbeat, at the interval its settings row
// gives in `heartbeatSeconds`. Each beat types PING into the manager's
// terminal through `agents.ping`, which records the ping.
//
// Start and reload run one at a time, in call order. A runner that fails
// for one project is logged and the other projects go on.

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

	// The ping moves no cursor either. A ping the runner refused is logged
	// and no row is written, so the next beat tries again.
	const ping = (projectId: string) =>
		options.call("agents.ping", { project: projectId }).then(() => undefined, failed("agents ping", { projectId }));

	const dispatcher = createDispatcher({ ...options.projects, bus: options.bus, clock: options.clock, flush, ping });

	const settings = () => options.call("agents.settings", undefined) as Promise<AgentSettings>;

	const sync = async (current: AgentSettings) => {
		const wanted = current.enabled ? current.projects.filter((row) => row.enabled) : [];
		const wantedIds = wanted.map((row) => row.projectId);
		for (const projectId of dispatcher.watched()) {
			if (!wantedIds.includes(projectId)) dispatcher.unwatch(projectId);
		}
		// A project the host already watches keeps its manager and its queue;
		// the watch call arms its heartbeat again, so an interval the settings
		// changed takes effect here.
		for (const row of wanted) {
			const projectId = row.projectId;
			if (!dispatcher.watched().includes(projectId)) {
				await options
					.call("agents.ensureManager", { project: projectId })
					.catch(failed("agents manager", { projectId }));
			}
			dispatcher.watch(projectId, row.heartbeatSeconds === null ? null : row.heartbeatSeconds * 1000);
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
			}),
		reload: () => serial(async () => sync(await settings())),
		idle: () => chain,
		stop: () => dispatcher.stop(),
		dispatcher,
	};
};
