import type { AgentSession, AgentSettings } from "@trellis/api";
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
// manager of each enabled project, and watches those projects. Every
// settings change starts the manager of each enabled project again, so a
// fix in the settings recovers a failed manager, and stops watching a
// project turned off; its manager and its builders keep running. A wake
// for a project without a manager starts one.
//
// Start and reload run one at a time, in call order. A manager the runner
// cannot start comes back as a failed session; the host logs what the
// runner said, and the other projects go on.

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

	// True when the manager runs; a failed start is logged with the runner's
	// message.
	const started = (session: AgentSession) => {
		if (session.state !== "failed") return true;
		options.log("agents manager failed", { projectId: session.projectId, error: session.error });
		return false;
	};

	// The wake moves no cursor: a batch the runner refused stays in the inbox,
	// and the next batch points the manager at it.
	const flush = (batch: Batch) =>
		options.call("agents.wake", { project: batch.projectId, text: batch.text }).then((session) => {
			if (started(session as AgentSession)) {
				options.bus.emit({ type: "agents.batch", projectId: batch.projectId, count: batch.count });
			}
		}, failed("agents wake", { projectId: batch.projectId }));

	const dispatcher = createDispatcher({ ...options.projects, bus: options.bus, clock: options.clock, flush });

	const settings = () => options.call("agents.settings", undefined) as Promise<AgentSettings>;

	const sync = async (current: AgentSettings) => {
		const wanted = current.enabled ? current.projects.filter((row) => row.enabled).map((row) => row.projectId) : [];
		for (const projectId of dispatcher.watched()) {
			if (!wanted.includes(projectId)) dispatcher.unwatch(projectId);
		}
		for (const projectId of wanted) {
			const session = await options
				.call("agents.ensureManager", { project: projectId })
				.catch(failed("agents manager", { projectId }));
			if (session !== undefined) started(session as AgentSession);
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
			}),
		reload: () => serial(async () => sync(await settings())),
		idle: () => chain,
		stop: () => dispatcher.stop(),
		dispatcher,
	};
};
