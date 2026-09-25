import type { AgentActivity, TrellisEvent } from "@trellis/api";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import { projectRun } from "../../services/agentRuns/liveState.ts";
import { startNativeReconcile } from "../nativeReconcile/host.ts";

// Each change of the fingerprint sends the whole run to every open page. A
// field that changes on each event of a run, such as `lastTool.updatedAt`,
// which each piece of command output moves, sends one event per piece. The
// tool fields here change only when the agent line changes: a new tool, or
// the end of one.
const fingerprint = (session: AgentActivity) =>
	JSON.stringify({
		process: session.run.processStatus,
		state: session.run.state,
		seen: session.run.seenAttention,
		activity: session.run.observation?.activity?.state,
		outcome: session.run.observation?.outcome,
		controllable: session.run.observation?.controllable,
		lastMessageAt: session.run.observation?.lastMessage?.at,
		lastTool: session.run.observation?.lastTool && {
			name: session.run.observation.lastTool.name,
			target: session.run.observation.lastTool.target,
			status: session.run.observation.lastTool.status,
			startedAt: session.run.observation.lastTool.startedAt,
		},
		requests: session.run.observation?.attention?.requests,
		completion: session.run.observation?.attention?.completion,
		failure: session.run.observation?.attention?.failure,
	});

export function startSessionMonitor(options: {
	read: () => Promise<AgentActivity[]>;
	client: Pick<RuntimeClient, "subscribeSession">;
	emit: (event: TrellisEvent) => unknown;
	complete: (input: { sessionId: string; runId: string; agentResponse: string }) => Promise<unknown>;
	log: (message: string, fields?: Record<string, unknown>) => void;
}) {
	const subscriptions = new Map<string, { abort: AbortController; done: Promise<void> }>();
	const sessions = new Map<string, AgentActivity>();
	const fingerprints = new Map<string, string>();
	let stopped = false;
	let initialized = false;
	const publish = (session: AgentActivity, notify: boolean, completedEvent: boolean) => {
		const key = `${session.run.id}:${session.run.terminalId}`;
		const next = fingerprint(session);
		if (fingerprints.get(key) === next) return;
		fingerprints.set(key, next);
		options.emit({ type: "agent-runs.status", activity: session, notify });
		const agentResponse = session.run.observation?.lastMessage?.text;
		if (
			!completedEvent ||
			session.sessionId === null ||
			session.run.observation?.outcome !== "completed" ||
			agentResponse === undefined
		)
			return;
		const fields = { session: session.sessionId, run: session.run.id };
		options.log("session name trigger", fields);
		void options
			.complete({ sessionId: session.sessionId, runId: session.run.id, agentResponse })
			.catch((error) => options.log("session name failed", { ...fields, error: String(error) }));
	};
	const tick = async () => {
		const entries = await options.read();
		if (stopped) return;
		const ids = new Set(entries.map((session) => session.run.terminalId));
		for (const [id, subscription] of subscriptions) {
			if (!ids.has(id)) {
				subscription.abort.abort();
				subscriptions.delete(id);
			}
		}
		for (const [id] of sessions) if (!ids.has(id)) sessions.delete(id);
		for (let entry of entries) {
			const id = entry.run.terminalId;
			if (id === null) continue;
			const previous = sessions.get(id);
			if (
				previous?.run.observation &&
				entry.run.observation &&
				previous.run.observation.checkedAt > entry.run.observation.checkedAt
			)
				entry = { ...entry, run: { ...previous.run, seenAttention: entry.run.seenAttention } };
			sessions.set(id, entry);
			publish(entry, initialized, false);
			if (entry.run.processStatus !== "running" || subscriptions.has(id)) continue;
			const abort = new AbortController();
			const done = (async () => {
				try {
					for await (const event of options.client.subscribeSession(id, abort.signal)) {
						if (event.type !== "session") continue;
						const current = sessions.get(id);
						if (!current) break;
						const run = projectRun({ ...current.run, closedAt: current.run.assigned ? null : current.run.updatedAt }, [
							event.session,
						]);
						const next = { ...current, run };
						sessions.set(id, next);
						publish(next, true, true);
					}
				} catch (error) {
					if (!abort.signal.aborted) options.log("Session observation failed", { id, error: String(error) });
				} finally {
					if (subscriptions.get(id)?.abort === abort) subscriptions.delete(id);
				}
			})();
			subscriptions.set(id, { abort, done });
		}
		initialized = true;
		const keys = new Set(entries.map((entry) => `${entry.run.id}:${entry.run.terminalId}`));
		for (const key of fingerprints.keys()) if (!keys.has(key)) fingerprints.delete(key);
	};
	const loop = startNativeReconcile({
		tick,
		log: options.log,
		intervalMs: 2000,
		setTimer: (fn, ms) => Number(setTimeout(fn, ms)),
		clearTimer: (id) => clearTimeout(id),
	});
	return {
		tick: loop.tick,
		async stop() {
			stopped = true;
			await loop.stop();
			const current = [...subscriptions.values()];
			for (const entry of current) entry.abort.abort();
			await Promise.all(current.map((entry) => entry.done));
		},
	};
}
