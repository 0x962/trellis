import type { AgentSession, AgentSettings, Project } from "@trellis/api";
import type { Bus } from "../events/bus.ts";
import type { JobsLog } from "../jobs.ts";
import type { ServiceName } from "../services/registry.ts";
import { type Batch, createDispatcher, type Dispatcher, type DispatcherClock } from "./dispatcher.ts";

// The agents host keeps one legacy manager per enabled project and wakes
// it with the batches of the dispatcher. A selected manager persona owns
// the project instead, so the host stops its legacy manager and watcher.
// The host runs in the thread that owns the database and reaches the
// database only through services that `call` runs as the system actor.
//
// The legacy manager starts and wakes only while the global switch is on.
// At start the host marks the sessions whose terminal is gone, starts the
// manager of each enabled project, and watches those projects. Every
// settings change starts the manager of each enabled project again. This
// recovers a failed manager. A disabled project loses its watcher, but its
// legacy manager and builders keep running. A wake for a project without
// a manager starts one.
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
		options.call("agents.wake", { project: batch.projectId, text: batch.text }).then(
			(session) => {
				if (started(session as AgentSession)) {
					options.bus.emit({ type: "agents.batch", projectId: batch.projectId, count: batch.count });
				}
			},
			failed("agents wake", { projectId: batch.projectId }),
		);

	const dispatcher = createDispatcher({ ...options.projects, bus: options.bus, clock: options.clock, flush });

	const settings = () => options.call("agents.settings", undefined) as Promise<AgentSettings>;
	const usesManagerPersona = async (projectId: string) => {
		const project = (await options.call("projects.get", { project: projectId })) as Project;
		return project.managerConfig?.personaId != null;
	};
	const stopLegacyManager = async (projectId: string) => {
		const result = (await options.call("agents.sessions", { project: projectId })) as { sessions: AgentSession[] };
		for (const session of result.sessions) {
			if (session.role !== "manager" || !["starting", "running", "waiting"].includes(session.state)) continue;
			await options.call("agents.stop", { id: session.id });
		}
	};

	const sync = async (current: AgentSettings) => {
		const personaProjects = new Set<string>();
		for (const row of current.projects) {
			if (await usesManagerPersona(row.projectId)) personaProjects.add(row.projectId);
		}
		for (const projectId of personaProjects) {
			dispatcher.unwatch(projectId);
			await stopLegacyManager(projectId);
		}
		const wanted = current.enabled
			? current.projects.filter((row) => row.enabled && !personaProjects.has(row.projectId)).map((row) => row.projectId)
			: [];
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
	const unsubscribe = options.bus.subscribe(() => void serial(async () => sync(await settings())), {
		types: ["project.updated"],
	});

	return {
		start: () =>
			serial(async () => {
				const current = await settings();
				if (current.enabled) await options.call("agents.reconcile", {}).catch(failed("agents reconcile", {}));
				await sync(current);
			}),
		reload: () => serial(async () => sync(await settings())),
		idle: () => chain,
		stop: () => {
			unsubscribe();
			dispatcher.stop();
		},
		dispatcher,
	};
};
