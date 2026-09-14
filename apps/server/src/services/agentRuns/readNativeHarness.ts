import type { AgentRun } from "@trellis/api";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import { sql } from "drizzle-orm";
import { nativeClient } from "../../agents/native/connection.ts";
import type { ClaudeCheckpoint } from "../../agents/nativeHarness/checkpoint.ts";
import { ClaudeStream } from "../../agents/nativeHarness/claudeStream.ts";
import type { HarnessSnapshot } from "../../agents/nativeHarness/types.ts";
import { rows } from "../../db/queries/support.ts";
import type { ServiceCtx } from "../support.ts";
import { reconcileNativeObservation } from "./reconcileNativeObservation.ts";

type Reader = Pick<RuntimeClient, "list" | "output">;
const pending = new Map<string, Promise<HarnessSnapshot | null>>();
async function read(ctx: ServiceCtx, run: AgentRun, client: Reader) {
	if (run.runtime !== "native" || run.terminalId === null || run.sessionId === null) return null;
	const attemptId = run.terminalId;
	const [previous] = await ctx.newTx((tx) =>
		rows<{ snapshot: HarnessSnapshot; checkpoint: ClaudeCheckpoint | null }>(
			tx,
			sql`SELECT snapshot,checkpoint FROM agent_harness_observations WHERE attempt_id=${attemptId}`,
		),
	);
	const offset = previous?.checkpoint?.offset ?? 0;
	const parser = new ClaudeStream(
		run.sessionId,
		`initialize-${attemptId}`,
		previous?.checkpoint ? { snapshot: previous.snapshot, checkpoint: previous.checkpoint } : undefined,
	);
	let snapshot: HarnessSnapshot;
	let checkpoint = previous?.checkpoint ?? undefined;
	let receipts: string[] = [];
	try {
		const session = (await client.list()).find((session) => session.id === attemptId);
		if (session === undefined) throw new Error("The execution service has no record of this attempt");
		if (session.mode !== "stdio") return null;
		const output = await client.output(attemptId, offset);
		if (output.truncated || output.startOffset !== offset || output.nextOffset < offset)
			parser.gap("Unread harness output expired; delivery receipt is unknown");
		receipts = parser
			.feed(Buffer.from(output.data, "base64"))
			.filter((event) => event.type === "acknowledged")
			.map((event) => event.messageId);
		snapshot = parser.snapshot();
		checkpoint = { ...parser.checkpoint(output.nextOffset), processExited: session.status === "exited" };
		if (session.status === "unknown")
			snapshot = {
				...snapshot,
				state: "unknown",
				error: "The execution service cannot establish whether this attempt still owns a process",
			};
		else if (session.status === "exited" && session.exitCode !== 0)
			snapshot = {
				...snapshot,
				state: "failed",
				error: session.error ?? `The agent process exited with code ${session.exitCode}.`,
			};
		else if (session.status === "exited" && !["idle", "needs_input", "failed"].includes(snapshot.state))
			snapshot = {
				...snapshot,
				state: "failed",
				error: session.error ?? "The agent process exited without a completed turn",
			};
	} catch (error) {
		snapshot = {
			...(previous?.snapshot ?? parser.snapshot()),
			state: "unknown",
			error: error instanceof Error ? error.message : String(error),
		};
	}
	await ctx.newTx((tx) =>
		reconcileNativeObservation(ctx, tx, {
			runId: run.id,
			attemptId,
			snapshot,
			checkpoint,
			expectedOffset: offset,
			receipts,
		}),
	);
	const [saved] = await ctx.newTx((tx) =>
		rows<{ snapshot: HarnessSnapshot }>(
			tx,
			sql`SELECT o.snapshot FROM agent_harness_observations o JOIN agent_runs r ON r.terminal_id=o.attempt_id WHERE r.id=${run.id} AND o.attempt_id=${attemptId}`,
		),
	);
	return saved?.snapshot ?? null;
}
export function readNativeHarness(ctx: ServiceCtx, run: AgentRun, client: Reader = nativeClient(ctx.home)) {
	const key = `${ctx.home}:${run.terminalId}`;
	const active = pending.get(key);
	if (active) return active;
	const work = read(ctx, run, client).finally(() => pending.delete(key));
	pending.set(key, work);
	return work;
}
