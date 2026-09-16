import type { AgentRun } from "@trellis/api";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { nativeHost } from "../../agents/native/harnessHost.ts";
import type { ExecutionAttemptRecord } from "../assignments/attempts.ts";
import type { ServiceCtx } from "../support.ts";
import type { StoredRun } from "./queries.ts";

export type RuntimeSessionIndex = ReadonlyMap<string, RuntimeProcessStatus>;

export const indexRuntimeSessions = (sessions: RuntimeProcessStatus[]): RuntimeSessionIndex =>
	new Map(sessions.map((session) => [session.id, session]));

export async function readRuntimeSessions(home: string): Promise<RuntimeProcessStatus[]> {
	try {
		return await nativeHost(home).list();
	} catch (error) {
		if (["ENOENT", "ECONNREFUSED"].includes((error as NodeJS.ErrnoException).code ?? "")) return [];
		throw error;
	}
}

export function executionMetrics(attemptIds: string[], sessions: RuntimeSessionIndex) {
	if (attemptIds.length === 0) return { durationMs: null, tokenCount: null };
	const attempts = attemptIds.map((id) => sessions.get(id));
	if (attempts.some((attempt) => attempt === undefined)) return { durationMs: null, tokenCount: null };
	const runtimeAttempts = attempts as RuntimeProcessStatus[];
	const durationMs = runtimeAttempts.every((attempt) => attempt.elapsedMs !== null)
		? runtimeAttempts.reduce((total, attempt) => total + attempt.elapsedMs!, 0)
		: null;
	const tokenTotalsBySession = new Map<string, number | null>();
	for (const attempt of runtimeAttempts) {
		const sessionId = attempt.agent?.sessionId;
		if (sessionId == null) return { durationMs, tokenCount: null };
		const previous = tokenTotalsBySession.get(sessionId);
		const total = attempt.agent?.tokenUsage?.totalTokens;
		if (total !== undefined)
			tokenTotalsBySession.set(sessionId, previous === null ? total : Math.max(previous ?? 0, total));
		else if (previous === undefined) tokenTotalsBySession.set(sessionId, null);
	}
	const totals = [...tokenTotalsBySession.values()];
	const tokenCount = totals.every((total) => total !== null)
		? (totals as number[]).reduce((total, current) => total + current, 0)
		: null;
	return { durationMs, tokenCount };
}

export function projectRun(
	run: StoredRun,
	sessions: RuntimeSessionIndex,
	attemptIds = [run.terminalId].filter(String) as string[],
): AgentRun {
	const process = run.terminalId === null ? undefined : sessions.get(run.terminalId);
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
	attempts: ExecutionAttemptRecord[] = [],
): Promise<AgentRun[]> {
	if (runs.length === 0) return [];
	const sessions = indexRuntimeSessions(await readRuntimeSessions(ctx.home));
	const attemptIdsByRun = new Map<string, string[]>();
	for (const attempt of attempts) {
		const runAttemptIds = attemptIdsByRun.get(attempt.runId) ?? [];
		runAttemptIds.push(attempt.id);
		attemptIdsByRun.set(attempt.runId, runAttemptIds);
	}
	return runs.map((run) => {
		const attemptIds = attemptIdsByRun.get(run.id);
		return projectRun(run, sessions, attemptIds === undefined ? undefined : attemptIds);
	});
}
