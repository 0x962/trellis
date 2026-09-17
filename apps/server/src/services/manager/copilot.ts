import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { nativeHost, nativePreset } from "../../agents/native/harnessHost.ts";
import { SYSTEM_ACTOR } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import { stopNative } from "../agentRuns/nativeLifecycle.ts";
import { startNative } from "../agentRuns/nativeStart.ts";
import { managerRowOf, reserve } from "../agentRuns/reserve.ts";
import { projectLaunchConfig } from "../projectLaunchConfig/projectLaunchConfig.ts";
import { managerConfigOf } from "../projectRows.ts";
import type { IoCtx } from "../support.ts";
import { workerAction } from "./workerAction.ts";

const defaults = {
	start: startNative,
	stop: stopNative,
	preset: nativePreset,
	list: (home: string) => nativeHost(home).list(),
	mkdir,
};

export async function reconcileCopilot(
	ctx: IoCtx,
	projectId: string,
	sessions: RuntimeProcessStatus[],
	deps = defaults,
) {
	const previous = await ctx.newTx((tx) => managerRowOf(tx, projectId, null));
	let session = sessions.find((item) => item.id === previous?.terminalId);
	if (previous?.terminalId && !session)
		session = (await deps.list(ctx.home)).find((item) => item.id === previous.terminalId);
	if (session?.status === "unknown") throw new Error(`Cannot confirm process ownership for ${previous!.id}`);
	if (session && workerAction(session) !== "restart") return;
	if (previous && session?.status === "running") await deps.stop(ctx, previous);
	const config = await ctx.newTx(async (tx) => {
		const base = await projectLaunchConfig(tx, { projectId });
		const chain = await rows<{ manager_config: unknown }>(
			tx,
			sql`WITH RECURSIVE ancestors AS (
			SELECT id,parent_id,manager_config,0 AS depth FROM projects WHERE id=${projectId}
			UNION ALL SELECT p.id,p.parent_id,p.manager_config,a.depth+1 FROM projects p JOIN ancestors a ON p.id=a.parent_id
		) SELECT manager_config FROM ancestors WHERE manager_config->>'personaId' IS NOT NULL ORDER BY depth LIMIT 1`,
		);
		const selected = { ...base, personaId: chain.length ? managerConfigOf(chain[0]!).personaId : null };
		const [persona] = selected.personaId
			? [{ id: selected.personaId }]
			: await rows<{ id: string }>(
					tx,
					sql`SELECT id FROM personas WHERE kind='manager' ORDER BY created_at,id LIMIT 1`,
				);
		return {
			...selected,
			personaId: persona?.id ?? null,
			directory: base.directory || join(ctx.home, "copilots", projectId),
			privateDirectory: !base.directory,
		};
	});
	if (!config.personaId) throw new Error(`Select a copilot persona for project ${projectId}`);
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
				personaId: config.personaId!,
				newSession: !!previous && !resume,
				requestId: `copilot:${projectId}:${lastAttempt?.id ?? previous?.terminalId ?? "initial"}`,
			},
			previous?.terminalId ? [previous.terminalId] : [],
			{ config, copilot: true },
		);
	});
	if (!claim || claim.replay) return;
	await deps.start(ctx, { ...claim, resume });
	ctx.emit({ type: "agent-runs.changed", id: claim.run.id });
}
