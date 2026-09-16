import { ORPCError } from "@orpc/server";
import { type AgentRun, errors, type TicketMetrics } from "@trellis/api";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { nativeHost } from "../../agents/native/harnessHost.ts";
import type { ExecutionAttemptRecord } from "../assignments.ts";
import type { ServiceCtx } from "../support.ts";
import type { StoredRun } from "./queries.ts";

type RuntimeSessionIndex = ReadonlyMap<string, RuntimeProcessStatus>;

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

// The same read without the stopped-runtime fallback. A metrics request
// with attempts and no reachable runtime throws, so the request fails
// instead of reporting the missing data as unavailable.
export async function readRuntimeSessionsRequired(home: string): Promise<RuntimeProcessStatus[]> {
	try {
		return await nativeHost(home).list();
	} catch (error) {
		throw new ORPCError("RUNNER_UNAVAILABLE", {
			defined: true,
			status: errors.RUNNER_UNAVAILABLE.status,
			message: error instanceof Error ? error.message : String(error),
			data: { reason: (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "error" },
		});
	}
}

// Every attempt id of each run, so the run list and the metrics route
// share one grouping instead of scanning the attempts per run.
export const groupAttemptIdsByRun = (attempts: ExecutionAttemptRecord[]): Map<string, string[]> => {
	const attemptIdsByRun = new Map<string, string[]>();
	for (const attempt of attempts) {
		const runAttemptIds = attemptIdsByRun.get(attempt.runId) ?? [];
		runAttemptIds.push(attempt.id);
		attemptIdsByRun.set(attempt.runId, runAttemptIds);
	}
	return attemptIdsByRun;
};

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
	const attemptIdsByRun = groupAttemptIdsByRun(attempts);
	return runs.map((run) => {
		const attemptIds = attemptIdsByRun.get(run.id);
		return projectRun(run, sessions, attemptIds === undefined ? undefined : attemptIds);
	});
}

type RunWork = Pick<TicketMetrics, "durationMs" | "tokenCount">;

// The aggregate fields of each run without the full run projection. The
// ticket metrics route reads this, so one agent event never projects the
// same runs once for the list and again for the metrics.
export async function observeTicketMetrics(
	ctx: Pick<ServiceCtx, "home">,
	runs: StoredRun[],
	attempts: ExecutionAttemptRecord[] = [],
): Promise<RunWork[]> {
	if (runs.length === 0) return [];
	const sessions = indexRuntimeSessions(await readRuntimeSessionsRequired(ctx.home));
	const attemptIdsByRun = groupAttemptIdsByRun(attempts);
	return runs.map((run) => {
		const attemptIds = attemptIdsByRun.get(run.id);
		return executionMetrics(
			attemptIds === undefined ? ([run.terminalId].filter(String) as string[]) : attemptIds,
			sessions,
		);
	});
}
