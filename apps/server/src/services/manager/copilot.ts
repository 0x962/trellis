import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { RuntimeListInput, RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { nativeHost, nativePreset } from "../../agents/native/harnessHost.ts";
import { SYSTEM_ACTOR } from "../../context.ts";
import { iso, rows } from "../../db/queries/support.ts";
import { stopNative } from "../agentRuns/nativeLifecycle.ts";
import { startNative } from "../agentRuns/nativeStart.ts";
import type { StoredRun } from "../agentRuns/queries.ts";
import { managerRowOf, reserve } from "../agentRuns/reserve.ts";
import { loopRuntimes } from "../loops/runtime.ts";
import { projectLaunchConfig } from "../projectLaunchConfig/projectLaunchConfig.ts";
import type { IoCtx } from "../support.ts";
import { reportLaunch } from "./reportLaunch.ts";
import { restartAllowedAt, WINDOW_MS } from "./restartBackoff.ts";
import { workerAction } from "./workerAction.ts";

const defaults = {
	start: startNative,
	stop: stopNative,
	preset: nativePreset,
	list: (home: string, input?: RuntimeListInput) => nativeHost(home).list(input),
	mkdir,
};

// The launch each copilot run last waited for. The loop log gets one line
// per launch, not one per beat.
const announced = new Map<string, string>();

const describeWait = (ms: number) => {
	const seconds = Math.round(ms / 1000);
	if (seconds < 120) return `${seconds} seconds`;
	return `${Math.round(seconds / 60)} minutes`;
};

// True while the copilot must wait before its next launch. The wait
// follows the launches of the run inside the window and the life of the
// last process, as `restartBackoff` defines them.
async function restartWaits(ctx: IoCtx, previous: StoredRun, session: RuntimeProcessStatus) {
	const now = ctx.now();
	const attempts = await ctx.newTx((tx) =>
		rows<{ id: string; createdAt: string }>(
			tx,
			sql`SELECT id, ${iso(sql`created_at`)} AS "createdAt" FROM agent_execution_attempts
			WHERE run_id = ${previous.id} AND created_at > ${new Date(now.getTime() - WINDOW_MS)}
			ORDER BY generation DESC`,
		),
	);
	const startedAt = Date.parse(session.startedAt);
	const allowedAt = restartAllowedAt({
		attemptsAt: attempts.map((attempt) => Date.parse(attempt.createdAt)),
		startedAt,
		endedAt: session.endedAt === null ? null : Date.parse(session.endedAt),
		now: now.getTime(),
	});
	if (now.getTime() >= allowedAt) return false;
	const latest = attempts[0]!.id;
	if (announced.get(previous.id) !== latest) {
		announced.set(previous.id, latest);
		const life = Math.round(
			((session.endedAt === null ? now.getTime() : Date.parse(session.endedAt)) - startedAt) / 1000,
		);
		const error = session.agent?.error ?? session.error;
		loopRuntimes
			.get(ctx.home)
			?.record(
				`Copilot for ${previous.projectPath} exited ${life} seconds after its start${error ? `: ${error}` : ""}. Next start in ${describeWait(allowedAt - now.getTime())}.`,
				"error",
			);
	}
	return true;
}

export async function reconcileCopilot(
	ctx: IoCtx,
	projectId: string,
	sessions: RuntimeProcessStatus[],
	deps = defaults,
) {
	const previous = await ctx.newTx((tx) => managerRowOf(tx, projectId, null));
	let session = sessions.find((item) => item.id === previous?.terminalId);
	if (previous?.terminalId && !session)
		session = (await deps.list(ctx.home, { ids: [previous.terminalId] })).find(
			(item) => item.id === previous.terminalId,
		);
	if (session?.status === "unknown") throw new Error(`Cannot confirm process ownership for ${previous!.id}`);
	if (session && workerAction(session, ctx.now(), { allowIdle: true }) !== "restart") return;
	if (previous && session && (await restartWaits(ctx, previous, session))) return;
	if (previous && session?.status === "running") await deps.stop(ctx, previous);
	const config = await ctx.newTx(async (tx) => {
		const base = await projectLaunchConfig(tx, { projectId });
		return {
			...base,
			directory: base.directory || join(ctx.home, "copilots", projectId),
			privateDirectory: !base.directory,
		};
	});
	if (!config.instruction) return;
	if (config.privateDirectory) await deps.mkdir(config.directory, { recursive: true });
	const resume = !!(
		session?.agent?.sessionId &&
		previous &&
		!previous.sessionLost &&
		(await deps.preset(ctx.home, session.id)) === config.harness.preset
	);
	const claim = await ctx.newTx(async (tx) => {
		await tx.execute(sql`SELECT id FROM projects WHERE id=${projectId} FOR UPDATE`);
		const current = await managerRowOf(tx, projectId, null);
		if (current?.id !== previous?.id || current?.terminalId !== previous?.terminalId) return null;
		const [lastAttempt] = current
			? await rows<{ id: string }>(
					tx,
					sql`SELECT id FROM agent_execution_attempts WHERE run_id=${current.id} ORDER BY generation DESC LIMIT 1`,
				)
			: [];
		if (current) await tx.execute(sql`UPDATE agent_runs SET closed_at=${ctx.now()} WHERE id=${current.id}`);
		return reserve(
			{ ...ctx.core, actor: SYSTEM_ACTOR, now: ctx.now() },
			tx,
			{
				project: projectId,
				newSession: !!previous && !resume,
				requestId: `copilot:${projectId}:${lastAttempt?.id ?? previous?.terminalId ?? "initial"}`,
			},
			previous?.terminalId ? [previous.terminalId] : [],
			{ config, copilot: true },
		);
	});
	if (!claim || claim.replay) return;
	loopRuntimes.get(ctx.home)?.record(`${resume ? "Resume" : "Start"} copilot for ${claim.run.projectPath}.`);
	await deps.start(ctx, { ...claim, resume });
	await ctx.newTx((tx) => reportLaunch(ctx, tx, { id: claim.run.id }));
	ctx.emit({ type: "agent-runs.changed", id: claim.run.id });
}
