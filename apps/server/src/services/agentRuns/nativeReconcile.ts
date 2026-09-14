import type { AgentRun } from "@trellis/api";
import { sql } from "drizzle-orm";
import { nativeClient } from "../../agents/native/connection.ts";
import { observeClaude } from "../../agents/nativeHarness/observeClaude.ts";
import type { HarnessSnapshot } from "../../agents/nativeHarness/types.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { resolveTicket, type ServiceCtx, writeActivity } from "../support.ts";
import { refreshNative } from "./nativeLifecycle.ts";
import { columns } from "./queries.ts";

type StoredObservation = { snapshot: HarnessSnapshot; result_key: string | null; attention_key: string | null };
export const getNativeObservation = async (tx: Tx, attemptId: string) => {
	const [row] = await rows<{ snapshot: HarnessSnapshot }>(
		tx,
		sql`SELECT snapshot FROM agent_harness_observations WHERE attempt_id=${attemptId}`,
	);
	return row?.snapshot ?? null;
};

export const reconcileNativeObservation = async (
	ctx: ServiceCtx,
	tx: Tx,
	input: { runId: string; attemptId: string; snapshot: HarnessSnapshot },
) => {
	const [run] = await rows<{ id: string; kind: string; ticket_id: string | null }>(
		tx,
		sql`SELECT id,kind,ticket_id FROM agent_runs WHERE id=${input.runId} AND terminal_id=${input.attemptId} AND runtime='native' FOR UPDATE`,
	);
	if (!run) return false;
	const [previous] = await rows<StoredObservation>(
		tx,
		sql`SELECT snapshot,result_key,attention_key FROM agent_harness_observations WHERE attempt_id=${input.attemptId}`,
	);
	const snapshot =
		input.snapshot.state === "unknown" && previous
			? {
					...previous.snapshot,
					...input.snapshot,
					transcript: input.snapshot.transcript.length > 0 ? input.snapshot.transcript : previous.snapshot.transcript,
					result: input.snapshot.result ?? previous.snapshot.result,
					resultId: input.snapshot.resultId ?? previous.snapshot.resultId,
					acknowledgedMessageIds: [
						...new Set([...previous.snapshot.acknowledgedMessageIds, ...input.snapshot.acknowledgedMessageIds]),
					],
				}
			: input.snapshot;
	const resultKey =
		snapshot.state === "idle" && snapshot.result !== null
			? JSON.stringify([snapshot.resultId ?? null, snapshot.acknowledgedMessageIds.at(-1) ?? null, snapshot.result])
			: (previous?.result_key ?? null);
	const attentionKey = ["needs_input", "failed", "unknown"].includes(snapshot.state)
		? JSON.stringify([
				snapshot.state,
				snapshot.acknowledgedMessageIds.at(-1) ?? null,
				snapshot.pendingPermissions.map((permission) => permission.requestId).sort(),
				snapshot.error,
			])
		: (previous?.attention_key ?? null);
	const changed = await rows<{ attempt_id: string }>(
		tx,
		sql`INSERT INTO agent_harness_observations (attempt_id,snapshot,result_key,attention_key,updated_at)
 VALUES (${input.attemptId},${JSON.stringify(snapshot)}::jsonb,${resultKey},${attentionKey},${ctx.now()})
 ON CONFLICT (attempt_id) DO UPDATE SET snapshot=EXCLUDED.snapshot,result_key=EXCLUDED.result_key,attention_key=EXCLUDED.attention_key,updated_at=EXCLUDED.updated_at
 WHERE agent_harness_observations.snapshot IS DISTINCT FROM EXCLUDED.snapshot
 RETURNING attempt_id`,
	);
	if (changed.length === 0) return false;
	ctx.emit({ type: "agent-runs.changed", id: run.id });
	if (run.kind === "manager" || run.ticket_id === null) return true;
	const action =
		resultKey !== null && resultKey !== previous?.result_key
			? "agent.turn.completed"
			: attentionKey !== null && attentionKey !== previous?.attention_key
				? `agent.harness.${snapshot.state}`
				: null;
	if (action !== null) {
		const ticket = await resolveTicket(tx, run.ticket_id);
		await writeActivity({ ...ctx, actor: { kind: "system", name: "trellis" } }, tx, {
			ticket,
			action,
			meta: {
				runId: run.id,
				attemptId: input.attemptId,
				state: snapshot.state,
				result: snapshot.result,
				error: snapshot.error,
			},
			at: ctx.now(),
		});
	}
	return true;
};

type Dependencies = {
	refresh: (ctx: ServiceCtx, run: AgentRun) => Promise<unknown>;
	observe: (ctx: ServiceCtx, run: AgentRun) => Promise<HarnessSnapshot | null>;
};
const dependencies: Dependencies = {
	refresh: refreshNative,
	observe: async (ctx, run) => {
		const client = nativeClient(ctx.home);
		const session = (await client.list()).find((session) => session.id === run.terminalId);
		if (session === undefined) throw new Error("The execution service has no record of this attempt");
		if (session.mode !== "stdio" || run.sessionId === null) return null;
		const snapshot = await observeClaude(client, run.terminalId!, run.sessionId, `initialize-${run.terminalId}`);
		if (session.status === "unknown")
			return {
				...snapshot,
				state: "unknown",
				error: "The execution service cannot establish whether this attempt still owns a process",
			};
		if (session.status === "exited" && session.exitCode !== 0)
			return {
				...snapshot,
				state: "failed",
				error: session.error ?? `The agent process exited with code ${session.exitCode}.`,
			};
		if (session.status === "exited" && !["idle", "needs_input", "failed"].includes(snapshot.state))
			return {
				...snapshot,
				state: "failed",
				error: session.error ?? "The agent process exited without a completed turn",
			};
		return snapshot;
	},
};
export const prepareNativeReconcile = async (
	ctx: ServiceCtx,
	_input: Record<string, never> = {},
	deps: Dependencies = dependencies,
) => {
	const runs = await ctx.newTx((tx) =>
		rows<AgentRun>(
			tx,
			sql`SELECT ${columns} FROM agent_runs WHERE runtime='native' AND terminal_id IS NOT NULL AND state IN ('running','interrupted')`,
		),
	);
	let changed = 0;
	for (const run of runs) {
		await deps.refresh(ctx, run);
		let snapshot: HarnessSnapshot | null;
		try {
			snapshot = await deps.observe(ctx, run);
		} catch (error) {
			const previous = await ctx.newTx((tx) => getNativeObservation(tx, run.terminalId!));
			snapshot = {
				...(previous ?? {
					sessionId: run.sessionId ?? "",
					acknowledgedMessageIds: [],
					pendingPermissions: [],
					result: null,
					transcript: [],
				}),
				state: "unknown",
				error: error instanceof Error ? error.message : String(error),
			};
		}
		if (
			snapshot !== null &&
			(await ctx.newTx((tx) =>
				reconcileNativeObservation(ctx, tx, { runId: run.id, attemptId: run.terminalId!, snapshot }),
			))
		)
			changed++;
	}
	return { observed: runs.length, changed };
};
