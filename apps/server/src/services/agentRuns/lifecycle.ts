import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentRun } from "@trellis/api";
import { sql } from "drizzle-orm";
import { commandAde } from "../../agents/commandAde/commandAde.ts";
import { runBranch } from "../../agents/launchCommand/branch.ts";
import { managedTerminal } from "../../agents/managedTerminal/managedTerminal.ts";
import { attempt } from "../../agents/superset/attempt.ts";
import { superset } from "../../agents/superset/superset.ts";
import { invalidInput } from "../../errors.ts";
import { managerConfigOf, projectRow } from "../projectRows.ts";
import type { ServiceCtx } from "../support.ts";
import { refreshAde } from "./adeRefresh.ts";
import { assignmentMatches } from "./externalRetirement/assignmentMatches.ts";
import { retirementOf } from "./externalRetirement/retirementOf.ts";
import { refreshNative, stopNative } from "./nativeLifecycle.ts";
import { getRun } from "./queries.ts";

type Ctx = ServiceCtx & { supersetBin: string };
const recordError = (ctx: Ctx, run: AgentRun, error: string, state: string) =>
	ctx.newTx((tx) =>
		tx.execute(
			sql`UPDATE agent_runs SET state = ${state}, error = ${error}, updated_at = ${ctx.now()} WHERE ${assignmentMatches(run)}`,
		),
	);

export const prepareStop = async (ctx: Ctx, input: { id: string }) => {
	const run = await ctx.newTx((tx) => getRun(tx, input.id));
	if (run.runtime === "native") return stopNative(ctx, run);
	if (await ctx.newTx((tx) => retirementOf(tx, "persona", run.id))) return input;
	const host =
		run.runtime === "commands"
			? null
			: await ctx.newTx(async (tx) => managerConfigOf(await projectRow(tx, run.projectId!)).supersetHostId);
	if (run.state === "starting") throw invalidInput("id", "Wait for the agent to finish its startup.");
	if (run.state === "interrupted")
		throw invalidInput("id", "Refresh the status to locate the terminal before you stop this agent.");
	if (run.state === "stopped" || run.state === "exited") return input;
	if (run.workspaceId !== null && run.terminalId !== null) {
		const ade = run.runtime === "commands" ? await commandAde(ctx.home, run) : null;
		const text =
			ade !== null
				? await ade.output()
				: run.runtime === "tmux"
					? await managedTerminal(ctx.home).output(run.terminalId)
					: await superset(ctx.supersetBin, host).output(run.workspaceId, run.terminalId);
		const dir = join(ctx.home, "agents", run.id);
		await mkdir(dir, { recursive: true, mode: 0o700 });
		await writeFile(join(dir, "output.txt"), text, { mode: 0o600 });
		if (ade !== null) await ade.stop();
		else if (run.runtime === "tmux") await managedTerminal(ctx.home).stop(run.terminalId);
		else await superset(ctx.supersetBin, host).stop(run.workspaceId, run.terminalId);
	}
	await ctx.newTx((tx) =>
		tx.execute(sql`UPDATE agent_runs SET state = 'stopped', updated_at = ${ctx.now()} WHERE ${assignmentMatches(run)}`),
	);
	return input;
};

export const prepareRefresh = async (ctx: Ctx, input: { id: string }) => {
	const run = await ctx.newTx((tx) => getRun(tx, input.id));
	if (run.runtime === "native") return refreshNative(ctx, run);
	if (await ctx.newTx((tx) => retirementOf(tx, "persona", run.id))) return input;
	if (run.runtime === "commands") return refreshAde(ctx, run);
	const host = await ctx.newTx(async (tx) => managerConfigOf(await projectRow(tx, run.projectId!)).supersetHostId);
	const runner = superset(ctx.supersetBin, host);
	if (
		run.state === "interrupted" &&
		run.runtime === "superset" &&
		(run.workspaceId === null || run.terminalId === null)
	) {
		const recovered = await attempt(() => runner.recover(runBranch(run), run.name));
		if (!recovered.ok) {
			await recordError(ctx, run, `External session unavailable: ${recovered.error}`, "interrupted");
			return input;
		}
		const found = recovered.value;
		await ctx.newTx((tx) =>
			tx.execute(
				sql`UPDATE agent_runs SET workspace_id = ${found.workspaceId}, terminal_id = ${found.terminalId}, state = ${found.exited ? "exited" : "running"}, error = NULL WHERE ${assignmentMatches(run)}`,
			),
		);
		const url = await attempt(() => runner.url(found.workspaceId));
		if (url.ok)
			await ctx.newTx((tx) =>
				tx.execute(
					sql`UPDATE agent_runs SET url = ${url.value} WHERE id=${run.id} AND state IN ('running','exited') AND workspace_id=${found.workspaceId} AND terminal_id=${found.terminalId} AND session_id IS NOT DISTINCT FROM ${run.sessionId}`,
				),
			);
		return input;
	}
	if (run.state !== "running" && run.state !== "interrupted") return input;
	const exited = await attempt(() =>
		run.runtime === "tmux"
			? managedTerminal(ctx.home).exited(run.id)
			: runner.exited(run.workspaceId!, run.terminalId!),
	);
	if (!exited.ok) await recordError(ctx, run, `External session unavailable: ${exited.error}`, "interrupted");
	else
		await ctx.newTx((tx) =>
			tx.execute(
				sql`UPDATE agent_runs SET state = ${exited.value ? "exited" : "running"}, terminal_id=${run.runtime === "tmux" ? run.id : run.terminalId}, workspace_id=${run.runtime === "tmux" ? (run.workspaceId ?? join(ctx.home, "agents", run.id, "work")) : run.workspaceId}, error = NULL, updated_at = ${ctx.now()} WHERE ${assignmentMatches(run)}`,
			),
		);
	return input;
};
