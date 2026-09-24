import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { ORPCError } from "@orpc/server";
import { errors } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ensureNativeRuntime, nativeClient } from "../../agents/native/connection.ts";
import { nativeHost } from "../../agents/native/harnessHost.ts";
import type { ServiceCtx } from "../support.ts";
import { attemptCapturePath } from "./attemptCapture.ts";
import type { StoredRun } from "./queries.ts";

const stopFailure = (run: StoredRun, message: string) =>
	new ORPCError("RUNNER_UNAVAILABLE", {
		defined: true,
		status: errors.RUNNER_UNAVAILABLE.status,
		message: `Could not stop ${run.name}. ${message}`,
		data: { reason: "error" },
	});

export const nativeOutput = async (home: string, terminalId: string) => {
	const client = nativeHost(home, process.env, await ensureNativeRuntime(home));
	const end = (await client.output(terminalId, Number.MAX_SAFE_INTEGER)).nextOffset;
	const chunks: Buffer[] = [];
	let offset = 0;
	while (offset < end) {
		const output = await client.output(terminalId, offset);
		if (output.nextOffset === offset) break;
		chunks.push(Buffer.from(output.data, "base64").subarray(0, end - output.startOffset));
		offset = output.nextOffset;
	}
	return Buffer.concat(chunks).toString("utf8");
};

// Stops the native process of a run and keeps its terminal output on disk.
//
// `close` writes `closed_at`, which ends the assignment: `assigned` in
// `liveState.ts` is `closed_at IS NULL`. A pause passes false, so the run
// keeps its assignment. The ticket keeps its agent, and the session keeps
// its place in the session list.
//
// The UPDATE names the terminal that the caller read. A resume between that
// read and this write gives the run another terminal id, and the write then
// changes no row, so neither a stop nor a pause touches the newer attempt.
export const stopNative = async (ctx: ServiceCtx, run: StoredRun, close = true) => {
	let client = nativeClient(ctx.home);
	try {
		await client.hello();
	} catch (error) {
		if (!["ENOENT", "ECONNREFUSED"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
		client = await ensureNativeRuntime(ctx.home);
	}
	if (run.terminalId !== null) {
		const stopped = await nativeHost(ctx.home, process.env, client)
			.stop(run.terminalId)
			.catch((error: Error) => {
				throw stopFailure(run, error.message);
			});
		if (stopped.status !== "exited")
			throw stopFailure(run, stopped.error ?? "The host cannot confirm that the process stopped.");
		const capture = attemptCapturePath(ctx.home, run.id, run.terminalId);
		await mkdir(dirname(capture), { recursive: true, mode: 0o700 });
		// `prepareOutput` reads this file for the terminal of a run that
		// stopped, and `attemptStopped` reads its presence as the record of a
		// confirmed process exit.
		await writeFile(capture, await nativeOutput(ctx.home, run.terminalId), { mode: 0o600 });
	}
	await ctx.newTx((tx) =>
		close
			? tx.execute(
					sql`UPDATE agent_runs SET closed_at = ${ctx.now()}, updated_at = ${ctx.now()} WHERE id = ${run.id} AND terminal_id IS NOT DISTINCT FROM ${run.terminalId}`,
				)
			: tx.execute(
					sql`UPDATE agent_runs SET updated_at = ${ctx.now()} WHERE id = ${run.id} AND terminal_id IS NOT DISTINCT FROM ${run.terminalId}`,
				),
	);
	ctx.emit({ type: "agent-runs.changed", id: run.id });
	return { id: run.id };
};

export const refreshNative = async (
	ctx: ServiceCtx,
	run: StoredRun,
	inspect = (id: string) => nativeHost(ctx.home).status(id),
) => {
	if (run.terminalId !== null) {
		const process = await inspect(run.terminalId);
		if (process.status === "exited" && process.stopReason !== "idle")
			await ctx.newTx((tx) =>
				tx.execute(
					sql`UPDATE agent_runs SET closed_at = coalesce(closed_at, ${ctx.now()}) WHERE id = ${run.id} AND terminal_id = ${run.terminalId}
					AND kind NOT IN ('agent', 'session')`,
				),
			);
	}
	ctx.emit({ type: "agent-runs.changed", id: run.id });
	return { id: run.id };
};
