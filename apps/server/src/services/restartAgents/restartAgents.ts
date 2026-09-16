import { existsSync } from "node:fs";
import { join } from "node:path";
import type { RestartResumeOutput, RestartStatus } from "@trellis/api";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import {
	type RestartPlan,
	type RestartSession,
	readRestartPlan,
	removeRestartPlan,
	writeRestartPlan,
} from "@trellis/runtime-protocol/restart-plan";
import { sql } from "drizzle-orm";
import type { HarnessHost } from "../../agents/harnessHost/harnessHost.ts";
import { ensureNativeRuntime } from "../../agents/native/connection.ts";
import { nativeHost } from "../../agents/native/harnessHost.ts";
import type { ServiceCtx as CoreCtx } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import { invalidInput } from "../../errors.ts";
import { startNative } from "../agentRuns/nativeStart.ts";
import { readNativeHarness } from "../agentRuns/readNativeHarness.ts";
import type { ServiceCtx } from "../support.ts";
import { orderRestartSessions } from "./orderRestartSessions.ts";
import { preserveCompletedFlow } from "./preserveCompletedFlow.ts";
import { reserveRestart } from "./reserveRestart.ts";

type Ctx = ServiceCtx & { core: CoreCtx; localUrl: string };
type Dependencies = {
	host: (
		home: string,
	) =>
		| Pick<HarnessHost, "list" | "status" | "waitFor" | "startPrepared">
		| Promise<Pick<HarnessHost, "list" | "status" | "waitFor" | "startPrepared">>;
	start: typeof startNative;
};
const defaults: Dependencies = {
	host: async (home) => nativeHost(home, process.env, await ensureNativeRuntime(home)),
	start: startNative,
};
type Host = Awaited<ReturnType<Dependencies["host"]>>;
// One resume run of a home. It lives past the request that started it, so a
// later status read can report the entry the host works on now.
type Progress = {
	id: string;
	plan: RestartPlan;
	startedAt: string;
	finishedAt: string | null;
	resuming: Set<string>;
	error: string | null;
	counts: { resumed: number; skipped: number; failed: number };
	task: Promise<void>;
};
const active = new Map<string, Progress>();
const resumePrompt =
	"Trellis performed a system restart. Everything is okay. Your session and workspace are preserved. Continue any unfinished work as usual. If your assignment is complete, remain idle. Check the result of any interrupted command before you repeat it.";

// Resumes one entry and returns how it ended. A throw states why the entry
// cannot resume now; the caller records that reason on the entry and moves on.
async function resumeEntry(
	ctx: Ctx,
	plan: RestartPlan,
	entry: RestartSession,
	host: Host,
	deps: Dependencies,
): Promise<"resumed" | "skipped"> {
	const eligible = await ctx.newTx((tx) => reserveRestart({ ...ctx.core, now: ctx.now() }, tx, entry, false));
	if (eligible === null) return "skipped";
	const processes = await host.list();
	let next = processes.find((p) => p.id === entry.attempt.id);
	if (next === undefined) {
		const previous = processes.find((p) => p.id === entry.previousAttemptId);
		if (previous?.status !== "exited")
			throw new Error(`Confirm that restart attempt ${entry.previousAttemptId} stopped before resume.`);
		if (previous.agent?.sessionId !== entry.providerSessionId)
			throw new Error("The provider session does not match the saved restart plan.");
		const snapshot = await readNativeHarness(
			ctx,
			{ runtime: "native", terminalId: entry.previousAttemptId, sessionId: entry.providerSessionId },
			{ inspect: (id) => host.status(id) },
		);
		const reservation = await ctx.newTx(async (tx) => {
			const core = { ...ctx.core, now: ctx.now() };
			await preserveCompletedFlow(core, tx, { entry, snapshot });
			return reserveRestart(core, tx, entry, true);
		});
		if (reservation === null) return "skipped";
		if (existsSync(join(ctx.home, "harness-attempts", entry.attempt.id, "launch.json"))) {
			const timeoutMs = reservation.deadlineAt === undefined ? undefined : reservation.deadlineAt - Date.now();
			if (timeoutMs !== undefined && timeoutMs <= 0)
				throw new Error("The flow group deadline elapsed before restart launch.");
			await host.startPrepared(entry.attempt.id, timeoutMs);
		} else {
			await deps.start(ctx, {
				...reservation,
				attempt: reservation.attempt!,
				previousAttemptId: entry.previousAttemptId,
				resume: true,
				context: "",
				resumePrompt:
					reservation.run.kind === "manager"
						? JSON.stringify({
								type: "trellis.system_restarted",
								restartId: plan.id,
								runId: entry.runId,
								previousAttemptId: entry.previousAttemptId,
								attemptId: entry.attempt.id,
								providerSessionId: entry.providerSessionId,
							})
						: resumePrompt,
				preserveAssignmentOnFailure: true,
			});
		}
		next = (await host.list()).find((p) => p.id === entry.attempt.id);
	}
	if (next === undefined) {
		const [failed] = await ctx.newTx((tx) =>
			rows<{ error: string | null }>(
				tx,
				sql`SELECT error FROM agent_runs WHERE id=${entry.runId} AND terminal_id=${entry.attempt.id}`,
			),
		);
		throw new Error(
			`Could not restore ${eligible.run.name} in ${eligible.run.projectPath}: ${failed?.error ?? `Restart attempt ${entry.attempt.id} did not start.`}`,
		);
	}
	const acknowledged = (p: RuntimeProcessStatus) =>
		p.agent?.sessionId === entry.providerSessionId && p.acknowledgedMessageIds.includes(entry.attempt.id);
	if (!acknowledged(next)) {
		if (next.status !== "running")
			throw new Error(`Restart attempt ${entry.attempt.id} has no confirmed prompt receipt.`);
		({ process: next } = await host.startPrepared(entry.attempt.id));
	}
	if (!acknowledged(next)) throw new Error(`Restart attempt ${entry.attempt.id} has no confirmed prompt receipt.`);
	if (next.status === "unknown" || next.error)
		throw new Error(next.error ?? `Restart attempt ${entry.attempt.id} has unknown process ownership.`);
	ctx.emit({ type: "agent-runs.changed", id: entry.runId });
	return "resumed";
}

// Every entry gets one try per run. A failed entry keeps its error in the
// plan, so the plan stays on disk and a later resume tries that entry again.
// The entries of one wave resume at the same time; the next wave starts when
// the whole wave has an outcome. Plan writes queue up, so two entries that
// finish together never write the file at the same time.
async function resumeAll(ctx: Ctx, deps: Dependencies, progress: Progress) {
	const { plan } = progress;
	const host = await deps.host(ctx.home);
	let writing = Promise.resolve();
	const persist = () => {
		writing = writing.then(() => writeRestartPlan(ctx.home, plan));
		return writing;
	};
	const resumeOne = async (entry: RestartSession) => {
		progress.resuming.add(entry.runId);
		try {
			const outcome = await resumeEntry(ctx, plan, entry, host, deps);
			entry.done = true;
			entry.outcome = outcome;
			delete entry.error;
			progress.counts[outcome]++;
		} catch (error) {
			entry.error = error instanceof Error ? error.message : String(error);
			progress.counts.failed++;
		}
		progress.resuming.delete(entry.runId);
		await persist();
	};
	for (const wave of await ctx.newTx((tx) => orderRestartSessions(tx, plan.sessions)))
		await Promise.all(wave.filter((entry) => !entry.done).map(resumeOne));
	if (plan.sessions.every((entry) => entry.done)) await removeRestartPlan(ctx.home);
}

const summary = (progress: Progress): RestartResumeOutput => ({
	restartId: progress.id,
	finished: progress.finishedAt !== null,
	...progress.counts,
});

// Two calls for one home at the same time share one run, so an agent starts once.
const starting = new Map<string, Promise<Progress | null>>();
const startResume = (ctx: Ctx, deps: Dependencies) => {
	let pending = starting.get(ctx.home);
	if (pending === undefined) {
		pending = (async () => {
			const plan = await readRestartPlan(ctx.home);
			if (plan === null) return null;
			const started: Progress = {
				id: plan.id,
				plan,
				startedAt: new Date().toISOString(),
				finishedAt: null,
				resuming: new Set(),
				error: null,
				counts: { resumed: 0, skipped: 0, failed: 0 },
				task: Promise.resolve(),
			};
			started.task = resumeAll(ctx, deps, started)
				.catch((error: Error) => {
					started.error = error.message;
				})
				.finally(() => {
					started.finishedAt = new Date().toISOString();
				});
			active.set(ctx.home, started);
			return started;
		})().finally(() => starting.delete(ctx.home));
		starting.set(ctx.home, pending);
	}
	return pending;
};

export async function prepareResumeRestart(
	ctx: Ctx,
	input: { restartId: string; wait?: boolean },
	deps: Dependencies = defaults,
): Promise<RestartResumeOutput> {
	if (ctx.actor.kind !== "human") throw invalidInput("actor", "A person must resume agents after a system restart.");
	let progress = active.get(ctx.home);
	if (progress === undefined || progress.finishedAt !== null) {
		const started = await startResume(ctx, deps);
		if (started === null) return { restartId: input.restartId, finished: true, resumed: 0, skipped: 0, failed: 0 };
		progress = started;
	}
	if (progress.id !== input.restartId) throw new Error("The requested restart does not match the saved restart plan.");
	if (input.wait) await progress.task;
	return summary(progress);
}

export async function restartStatus(ctx: Ctx): Promise<RestartStatus | null> {
	const progress = active.get(ctx.home);
	const plan = (await readRestartPlan(ctx.home)) ?? progress?.plan ?? null;
	if (plan === null) return null;
	const live = progress?.id === plan.id ? progress : undefined;
	const ids = plan.sessions.map((entry) => entry.runId);
	const runs =
		ids.length === 0
			? []
			: await ctx.newTx((tx) =>
					rows<{ id: string; name: string; project_id: string; project_path: string }>(
						tx,
						sql`SELECT id,name,project_id,project_path FROM agent_runs WHERE id IN (${sql.join(
							ids.map((id) => sql`${id}`),
							sql`, `,
						)})`,
					),
				);
	const byId = new Map(runs.map((run) => [run.id, run]));
	return {
		restartId: plan.id,
		createdAt: plan.createdAt,
		startedAt: live?.startedAt ?? null,
		finishedAt: live?.finishedAt ?? null,
		error: live?.error ?? null,
		sessions: plan.sessions.map((entry) => {
			const run = byId.get(entry.runId);
			return {
				runId: entry.runId,
				runName: run?.name ?? null,
				projectId: run?.project_id ?? null,
				projectPath: run?.project_path ?? null,
				state: entry.done
					? (entry.outcome ?? "resumed")
					: live?.resuming.has(entry.runId)
						? "resuming"
						: entry.error !== undefined
							? "failed"
							: "pending",
				error: entry.error ?? null,
			};
		}),
	};
}
