import { ORPCError } from "@orpc/server";
import { type AgentRun, errors, type TicketMetrics } from "@trellis/api";
import type { RuntimeListInput, RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { nativeHost } from "../../agents/native/harnessHost.ts";
import type { ExecutionAttemptRecord } from "../assignments.ts";
import type { ServiceCtx } from "../support.ts";
import { launchState } from "./launchState";
import type { StoredRun } from "./queries.ts";

type RuntimeSessionIndex = ReadonlyMap<string, RuntimeProcessStatus>;
type ReadRuntimeSessions = (home: string, input: RuntimeListInput) => Promise<RuntimeProcessStatus[]>;

const indexRuntimeSessions = (sessions: RuntimeProcessStatus[]): RuntimeSessionIndex =>
	new Map(sessions.map((session) => [session.id, session]));

export async function readRuntimeSessions(home: string, input: RuntimeListInput = {}): Promise<RuntimeProcessStatus[]> {
	try {
		return await nativeHost(home).list(input);
	} catch (error) {
		if (["ENOENT", "ECONNREFUSED"].includes((error as NodeJS.ErrnoException).code ?? "")) return [];
		throw error;
	}
}

// A runtime failure differs from a provider that did not record a metric.
export async function readRuntimeSessionsRequired(
	home: string,
	input: RuntimeListInput,
): Promise<RuntimeProcessStatus[]> {
	try {
		return await nativeHost(home).list(input);
	} catch (error) {
		throw new ORPCError("RUNNER_UNAVAILABLE", {
			defined: true,
			status: errors.RUNNER_UNAVAILABLE.status,
			message: error instanceof Error ? error.message : String(error),
			data: { reason: (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "error" },
		});
	}
}

// Each run maps to its execution attempts for one runtime read.
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

export function projectRun(run: StoredRun, sessions: RuntimeProcessStatus[], home?: string): AgentRun {
	const process = sessions.find((session) => session.id === run.terminalId);
	const { closedAt: _closedAt, ...metadata } = run;
	if (!process && home !== undefined && run.terminalId !== null && launchState.has(home, run.terminalId))
		return {
			...metadata,
			assigned: run.closedAt === null,
			state: "starting",
			processStatus: null,
			observation: null,
			error: null,
		};
	if (!process)
		return {
			...metadata,
			assigned: run.closedAt === null,
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
		assigned: run.closedAt === null,
		state,
		processStatus: process.status,
		observation: {
			checkedAt: process.checkedAt,
			attention: process.agent?.attention,
			controllable: process.controllable,
			activity: process.activity,
			lastMessage: process.agent?.lastMessage ?? null,
			// A tool input or output can hold a full file, so an AgentRun observation keeps only the tool state and times.
			lastTool: process.agent?.lastTool
				? {
						name: process.agent.lastTool.name,
						status: process.agent.lastTool.status,
						startedAt: process.agent.lastTool.startedAt,
						updatedAt: process.agent.lastTool.updatedAt,
					}
				: null,
			outcome: process.agent?.outcome ?? null,
			turnId: process.agent?.turnId ?? null,
		},
		error:
			process.agent?.error ?? process.error ?? (process.acknowledgedMessageIds.includes(process.id) ? null : run.error),
	};
}

const runtimeIds = (runs: StoredRun[], attemptIdsByRun: ReadonlyMap<string, string[]>) => [
	...new Set(runs.flatMap((run) => attemptIdsByRun.get(run.id) ?? ([run.terminalId].filter(String) as string[]))),
];

export async function observeRuns(
	ctx: Pick<ServiceCtx, "home">,
	runs: StoredRun[],
	readSessions: ReadRuntimeSessions = readRuntimeSessions,
): Promise<AgentRun[]> {
	if (runs.length === 0) return [];
	const ids = [...new Set(runs.flatMap((run) => (run.terminalId === null ? [] : [run.terminalId])))];
	if (ids.length === 0) return runs.map((run) => projectRun(run, [], ctx.home));
	const sessions = await readSessions(ctx.home, { ids });
	return runs.map((run) => projectRun(run, sessions, ctx.home));
}

type RunWork = Pick<TicketMetrics, "durationMs" | "tokenCount">;

export async function observeTicketMetrics(
	ctx: Pick<ServiceCtx, "home">,
	runs: StoredRun[],
	attempts: ExecutionAttemptRecord[] = [],
): Promise<RunWork[]> {
	if (runs.length === 0) return [];
	const attemptIdsByRun = groupAttemptIdsByRun(attempts);
	const ids = runtimeIds(runs, attemptIdsByRun);
	const sessions = indexRuntimeSessions(ids.length === 0 ? [] : await readRuntimeSessionsRequired(ctx.home, { ids }));
	return runs.map((run) => {
		const attemptIds = attemptIdsByRun.get(run.id);
		return executionMetrics(
			attemptIds === undefined ? ([run.terminalId].filter(String) as string[]) : attemptIds,
			sessions,
		);
	});
}
