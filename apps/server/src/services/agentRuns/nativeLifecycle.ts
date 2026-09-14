import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentRun } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ensureNativeRuntime, nativeClient } from "../../agents/native/connection.ts";
import { renderTranscript } from "../../agents/nativeHarness/renderTranscript.ts";
import { rows } from "../../db/queries/support.ts";
import { invalidInput } from "../../errors.ts";
import { resolveTicket, type ServiceCtx, writeActivity } from "../support.ts";
import { readNativeHarness } from "./readNativeHarness.ts";

export const nativeOutput = async (home: string, terminalId: string) => {
	const output = await nativeClient(home).output(terminalId);
	return `${output.truncated ? "[Earlier terminal output expired.]\n" : ""}${Buffer.from(output.data, "base64").toString("utf8")}`;
};

export const stopNative = async (ctx: ServiceCtx, run: AgentRun) => {
	if (run.state === "stopped") return { id: run.id };
	const client = await ensureNativeRuntime(ctx.home);
	if (run.terminalId !== null) {
		const stopped = await client.stop(run.terminalId);
		if (stopped.status === "unknown")
			throw invalidInput(
				"id",
				"The execution service cannot confirm this process stopped. Inspect the process and workspace before a replacement.",
			);
		const directory = join(ctx.home, "agents", run.id);
		await mkdir(directory, { recursive: true, mode: 0o700 });
		const snapshot = await readNativeHarness(ctx, run);
		const output = snapshot ? renderTranscript(snapshot) : await nativeOutput(ctx.home, run.terminalId);
		await writeFile(join(directory, "output.txt"), output, { mode: 0o600 });
	}
	await ctx.newTx((tx) =>
		tx.execute(
			sql`UPDATE agent_runs SET state = 'stopped', error = NULL, updated_at = ${ctx.now()} WHERE id = ${run.id} AND terminal_id IS NOT DISTINCT FROM ${run.terminalId}`,
		),
	);
	return { id: run.id };
};

export const refreshNative = async (ctx: ServiceCtx, run: AgentRun) => {
	if (["stopped", "exited", "failed"].includes(run.state)) return { id: run.id };
	let state: AgentRun["state"];
	let error: string | null;
	try {
		const client = await ensureNativeRuntime(ctx.home);
		const session = (await client.list()).find((candidate) => candidate.id === run.terminalId);
		state =
			session?.status === "running"
				? "running"
				: session?.status === "exited"
					? session.exitCode === 0
						? "exited"
						: "failed"
					: "interrupted";
		error =
			session === undefined
				? "The execution service has no record of this attempt. Inspect its workspace before a new start."
				: session.error;
	} catch (cause) {
		state = "interrupted";
		error = cause instanceof Error ? cause.message : String(cause);
	}
	await ctx.newTx(async (tx) => {
		const updated = await rows<{ id: string }>(
			tx,
			sql`UPDATE agent_runs SET state = ${state}, error = ${error}, updated_at = ${ctx.now()} WHERE id = ${run.id} AND terminal_id = ${run.terminalId} AND state = ${run.state} RETURNING id`,
		);
		if (updated.length === 0) return;
		if (run.state !== state || run.error !== error) ctx.emit({ type: "agent-runs.changed", id: run.id });
		if (run.state !== state && run.ticketId !== null) {
			const ticket = await resolveTicket(tx, run.ticketId);
			await writeActivity(ctx, tx, {
				ticket,
				action: `agent.${state}`,
				meta: { runId: run.id, terminalId: run.terminalId, error },
				at: ctx.now(),
			});
		}
	});
	return { id: run.id };
};
