import type { AgentRun } from "@trellis/api";
import type { RuntimeListInput, RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { nativeHost } from "../../agents/native/harnessHost.ts";
import type { ServiceCtx } from "../support.ts";
import type { StoredRun } from "./queries.ts";

export async function readRuntimeSessions(home: string, input: RuntimeListInput = {}): Promise<RuntimeProcessStatus[]> {
	try {
		return await nativeHost(home).list(input);
	} catch (error) {
		if (["ENOENT", "ECONNREFUSED"].includes((error as NodeJS.ErrnoException).code ?? "")) return [];
		throw error;
	}
}

type ReadRuntimeSessions = (home: string, input: RuntimeListInput) => Promise<RuntimeProcessStatus[]>;

export function projectRun(run: StoredRun, sessions: RuntimeProcessStatus[]): AgentRun {
	const process = sessions.find((session) => session.id === run.terminalId);
	const { closedAt: _closedAt, ...metadata } = run;
	if (!process)
		return {
			...metadata,
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
	readSessions: ReadRuntimeSessions = readRuntimeSessions,
): Promise<AgentRun[]> {
	if (runs.length === 0) return [];
	const ids = [...new Set(runs.flatMap((run) => (run.terminalId === null ? [] : [run.terminalId])))];
	if (ids.length === 0) return runs.map((run) => projectRun(run, []));
	const sessions = await readSessions(ctx.home, { ids });
	return runs.map((run) => projectRun(run, sessions));
}
