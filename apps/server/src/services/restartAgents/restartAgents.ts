import { existsSync } from "node:fs";
import { join } from "node:path";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { readRestartPlan, removeRestartPlan, writeRestartPlan } from "@trellis/runtime-protocol/restart-plan";
import type { HarnessHost } from "../../agents/harnessHost/harnessHost.ts";
import { ensureNativeRuntime } from "../../agents/native/connection.ts";
import { nativeHost } from "../../agents/native/harnessHost.ts";
import type { ServiceCtx as CoreCtx } from "../../context.ts";
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
const active = new Map<string, { id: string; task: Promise<{ resumed: number; skipped: number }> }>();
const resumePrompt =
	"Trellis performed a system restart. Everything is okay. Your session and workspace are preserved. Continue any unfinished work as usual. If your assignment is complete, remain idle. Check the result of any interrupted command before you repeat it.";
async function resume(ctx: Ctx, input: { restartId: string }, deps: Dependencies) {
	const plan = await readRestartPlan(ctx.home);
	if (plan === null) return { resumed: 0, skipped: 0 };
	if (plan.id !== input.restartId) throw new Error("The requested restart does not match the saved restart plan.");
	const host = await deps.host(ctx.home);
	let resumed = 0;
	let skipped = 0;
	for (const entry of await ctx.newTx((tx) => orderRestartSessions(tx, plan.sessions))) {
		if (entry.done) continue;
		const eligible = await ctx.newTx((tx) => reserveRestart({ ...ctx.core, now: ctx.now() }, tx, entry, false));
		if (eligible === null) {
			skipped++;
		} else {
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
				if (reservation === null) {
					skipped++;
					entry.done = true;
					await writeRestartPlan(ctx.home, plan);
					continue;
				}
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
			if (next === undefined) throw new Error(`Restart attempt ${entry.attempt.id} did not start.`);
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
			resumed++;
			ctx.emit({ type: "agent-runs.changed", id: entry.runId });
		}
		entry.done = true;
		await writeRestartPlan(ctx.home, plan);
	}
	await removeRestartPlan(ctx.home);
	return { resumed, skipped };
}
export function prepareResumeRestart(ctx: Ctx, input: { restartId: string }, deps: Dependencies = defaults) {
	if (ctx.actor.kind !== "human")
		return Promise.reject(invalidInput("actor", "A person must resume agents after a system restart."));
	const pending = active.get(ctx.home);
	if (pending) {
		if (pending.id !== input.restartId)
			return Promise.reject(new Error("The requested restart does not match the active restart plan."));
		return pending.task;
	}
	const task = resume(ctx, input, deps).finally(() => active.delete(ctx.home));
	active.set(ctx.home, { id: input.restartId, task });
	return task;
}
