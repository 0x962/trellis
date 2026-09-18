import type { AgentActivity } from "../schemas/agentActivity.ts";

export type SessionAlert = {
	key: string;
	path: string;
	runId: string;
	title: string;
	body: string;
	kind: "question" | "completed" | "failed";
};
export class SessionAlerts {
	private readonly seen = new Map<string, number>();
	update(session: AgentActivity, notify: boolean): SessionAlert[] {
		const run = session.run;
		const attention = run.observation?.attention;
		if (run.terminalId === null) return [];
		const attempt = `${session.run.id}:${run.terminalId}`;
		for (const key of this.seen.keys())
			if (key.startsWith(`${session.run.id}:`) && key !== attempt) this.seen.delete(key);
		const candidates: Array<{ sequence: number; kind: SessionAlert["kind"]; body: string }> = [];
		if (run.state !== "failed" && run.processStatus === "running" && run.observation?.controllable)
			for (const request of attention?.requests ?? [])
				candidates.push({ sequence: request.sequence, kind: "question", body: request.title });
		if (run.state !== "failed" && !attention?.failure && attention?.completion)
			candidates.push({
				sequence: attention.completion.sequence,
				kind: "completed",
				body: "The agent finished its turn.",
			});
		if (attention?.failure)
			candidates.push({ sequence: attention.failure.sequence, kind: "failed", body: run.error ?? "The agent failed." });
		const previous = this.seen.get(attempt) ?? 0;
		let sequence = Math.max(previous, attention?.sequence ?? 0);
		const alerts: SessionAlert[] = [];
		for (const candidate of candidates) {
			const key = `${attempt}:${candidate.kind}:${candidate.sequence}`;
			if (notify && candidate.sequence > previous)
				alerts.push({
					key,
					path:
						session.sessionId !== null
							? `/sessions/${session.sessionId}`
							: `/t/${encodeURIComponent(run.ticketIdentifier!)}#attempt-${run.terminalId}`,
					runId: run.id,
					title: run.ticketIdentifier ? `${run.ticketIdentifier}: ${run.ticketTitle}` : run.name,
					body: candidate.body,
					kind: candidate.kind,
				});
			sequence = Math.max(sequence, candidate.sequence);
		}
		this.seen.set(attempt, sequence);
		return alerts;
	}
	prune(sessions: AgentActivity[]) {
		const keys = new Set(sessions.map((session) => `${session.run.id}:${session.run.terminalId}`));
		for (const key of this.seen.keys()) if (!keys.has(key)) this.seen.delete(key);
	}
}
