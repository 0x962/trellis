import { randomUUID } from "node:crypto";
import type { EvidenceCheck, EvidenceCheckInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ensureNativeRuntime } from "../../agents/native/connection.ts";
import { rows } from "../../db/queries/support.ts";
import { invalidInput } from "../../errors.ts";
import { assertNativeWorkEnabled } from "../agentRuns/nativeControl.ts";
import { currentCheck } from "./current.ts";
import { finishCheck } from "./finishCheck.ts";
import { reconcileCheck } from "./reconcileCheck.ts";
import { revision } from "./revision.ts";
import { target } from "./target.ts";
import type { EvidenceCtx } from "./types.ts";

export const check = async (ctx: EvidenceCtx, input: EvidenceCheckInput) => {
	const selected = await ctx.newTx((tx) => target(ctx.core, tx, { ...input, mutation: true }));
	const before = await revision(selected.workspace);
	const id = input.requestId ?? randomUUID();
	const reserved = await ctx.newTx(async (tx) => {
		await assertNativeWorkEnabled(tx);
		const [existing] = await rows<{ document: Omit<EvidenceCheck, "current"> }>(
			tx,
			sql`SELECT document FROM evidence_checks WHERE id = ${id}`,
		);
		if (existing) {
			const old = existing.document;
			if (
				old.runId !== input.runId ||
				old.command !== input.command ||
				JSON.stringify(old.args) !== JSON.stringify(input.args) ||
				old.timeoutMs !== input.timeoutMs
			)
				throw invalidInput("requestId", "This request ID belongs to a different check.");
			return { fresh: false, document: old };
		}
		const current = await target(ctx.core, tx, { ...input, mutation: true });
		if (current.attemptId !== selected.attemptId)
			throw invalidInput("runId", "The agent attempt changed before this check started.");
		const document: Omit<EvidenceCheck, "current"> = {
			id,
			runId: input.runId,
			attemptId: selected.attemptId,
			command: input.command,
			args: input.args,
			timeoutMs: input.timeoutMs,
			head: before.head,
			fingerprint: before.fingerprint,
			state: "starting",
			exitCode: null,
			output: "",
			truncated: false,
			error: null,
			finishedFingerprint: null,
			createdAt: new Date().toISOString(),
			finishedAt: null,
		};
		await tx.execute(
			sql`INSERT INTO evidence_checks (id, run_id, attempt_id, document, created_at) VALUES (${id}, ${input.runId}, ${selected.attemptId}, ${JSON.stringify(document)}::jsonb, ${document.createdAt})`,
		);
		return { fresh: true, document };
	});
	if (!reserved.fresh)
		return currentCheck(await reconcileCheck(ctx, reserved.document, selected.workspace), {
			...before,
			attemptId: selected.attemptId,
		});
	let document = reserved.document;
	try {
		const client = await ensureNativeRuntime(ctx.home);
		await ctx.newTx(async (tx) => {
			await assertNativeWorkEnabled(tx);
			const latest = await target(ctx.core, tx, { ...input, mutation: true });
			if (latest.attemptId !== selected.attemptId)
				throw invalidInput("runId", "The agent attempt changed before this check started.");
		});
		let session = await client.start({
			id,
			command: input.command,
			args: input.args,
			cwd: selected.workspace,
			mode: "stdio",
			timeoutMs: input.timeoutMs,
		});
		await ctx.newTx((tx) =>
			tx.execute(
				sql`UPDATE evidence_checks SET document = jsonb_set(document, '{state}', '"running"') WHERE id = ${id} AND finished_at IS NULL`,
			),
		);
		const deadline = Date.now() + input.timeoutMs + 5000;
		while (session.status === "running" && Date.now() < deadline) {
			await Bun.sleep(50);
			const observed = (await client.list()).find((item) => item.id === id);
			if (!observed) break;
			session = observed;
		}
		if (session.status === "running") session = await client.stop(id);
		document = await finishCheck(ctx, document, selected.workspace, session);
	} catch (cause) {
		document = await finishCheck(
			ctx,
			document,
			selected.workspace,
			null,
			cause instanceof Error ? cause.message : String(cause),
		);
	}
	const after = await revision(selected.workspace);
	const latest = await ctx.newTx((tx) => target(ctx.core, tx, input));
	return currentCheck(document, { ...after, attemptId: latest.attemptId });
};
