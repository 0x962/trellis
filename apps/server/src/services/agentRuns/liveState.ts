import type { AgentRun } from "@trellis/api";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { nativeHost } from "../../agents/native/harnessHost.ts";
import type { ServiceCtx } from "../support.ts";
import type { StoredAttempt, StoredRun } from "./queries.ts";

export async function readRuntimeSessions(home: string): Promise<RuntimeProcessStatus[]> {
	try {
		return await nativeHost(home).list();
	} catch (error) {
		if (["ENOENT", "ECONNREFUSED"].includes((error as NodeJS.ErrnoException).code ?? "")) return [];
		throw error;
	}
}

export function executionMetrics(attemptIds: string[], sessions: RuntimeProcessStatus[]) {
	if (attemptIds.length === 0) return { durationMs: null, tokenCount: null };
	const attempts = attemptIds.map((id) => sessions.find((session) => session.id === id));
	if (attempts.some((attempt) => attempt === undefined)) return { durationMs: null, tokenCount: null };
	const found = attempts as RuntimeProcessStatus[];
	const durationMs = found.every((attempt) => attempt.elapsedMs !== null)
		? found.reduce((total, attempt) => total + attempt.elapsedMs!, 0)
		: null;
	const sessionsByProvider = new Map<string, number | null>();
	for (const attempt of found) {
		const sessionId = attempt.agent?.sessionId;
		if (sessionId == null) return { durationMs, tokenCount: null };
		const previous = sessionsByProvider.get(sessionId);
		const total = attempt.agent?.tokenUsage?.totalTokens;
		if (total !== undefined)
			sessionsByProvider.set(sessionId, previous === null ? total : Math.max(previous ?? 0, total));
		else if (previous === undefined) sessionsByProvider.set(sessionId, null);
	}
	const totals = [...sessionsByProvider.values()];
	const tokenCount = totals.every((total) => total !== null)
		? (totals as number[]).reduce((total, current) => total + current, 0)
		: null;
	return { durationMs, tokenCount };
}

export function projectRun(
	run: StoredRun,
	sessions: RuntimeProcessStatus[],
	attemptIds = [run.terminalId].filter(String) as string[],
): AgentRun {
	const process = sessions.find((session) => session.id === run.terminalId);
	const { closedAt: _closedAt, ...metadata } = run;
	const metrics = executionMetrics(attemptIds, sessions);
	if (!process)
		return {
			...metadata,
			metrics,
			state: "interrupted",
			processStatus: null,
			observation: null,
			error: run.error ?? "The execution service has no live record of this attempt.",
		};
	const state =
		process.agent?.error || process.agent?.outcome === "failed"
			? "failed"
			: process.status === "running"
				? "running"
				: process.status === "unknown"
					? "interrupted"
					: process.exitCode !== null && process.exitCode !== 0
						? "failed"
						: "exited";
	return {
		...metadata,
		metrics,
		state,
		processStatus: process.status,
		observation: {
			checkedAt: process.checkedAt,
			controllable: process.controllable,
			activity: process.activity,
			outcome: process.agent?.outcome ?? null,
			turnId: process.agent?.turnId ?? null,
		},
		error: process.agent?.error ?? process.error,
	};
}

export async function observeRuns(
	ctx: Pick<ServiceCtx, "home">,
	runs: StoredRun[],
	attempts: StoredAttempt[] = [],
): Promise<AgentRun[]> {
	if (runs.length === 0) return [];
	const sessions = await readRuntimeSessions(ctx.home);
	return runs.map((run) => {
		const attemptIds = attempts.filter((attempt) => attempt.runId === run.id).map((attempt) => attempt.id);
		return projectRun(run, sessions, attemptIds.length > 0 ? attemptIds : undefined);
	});
}
