import type { ReviewDelivery, ReviewSubmission, ReviewSubmit } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { rows } from "../../db/queries/support";
import type { Tx } from "../../db/tx";
import { invalidInput } from "../../errors";
import { notFound, type ServiceCtx } from "../support";
import { assertRevision, changed, ensurePr, findPr, readThread } from "./queries";
import { add } from "./threads";

export async function deliveryRows(tx: Tx, id: string) {
	return rows<ReviewDelivery>(
		tx,
		sql`SELECT id, review_id AS "reviewId", run_id AS "runId", state, error, to_char(read_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "readAt" FROM review_deliveries WHERE review_id = ${id} ORDER BY id`,
	);
}
export async function show(_ctx: ServiceCtx, tx: Tx, input: { id: string }): Promise<ReviewSubmission> {
	const [row] = await rows<{ document: ReviewSubmission }>(
		tx,
		sql`SELECT document FROM review_submissions WHERE id = ${input.id}`,
	);
	if (!row) throw notFound("review", input.id);
	return { ...row.document, deliveries: await deliveryRows(tx, input.id) };
}
export async function submit(ctx: ServiceCtx, tx: Tx, input: ReviewSubmit): Promise<ReviewSubmission> {
	const pr = await ensurePr(tx, input.pr);
	const actor = `${ctx.actor.kind}:${ctx.actor.name}`;
	const [existing] = await rows<{ id: string }>(
		tx,
		sql`SELECT id FROM review_submissions WHERE pr_id = ${pr.id} AND actor = ${actor} AND request_id = ${input.requestId}`,
	);
	if (existing) return show(ctx, tx, existing);
	await assertRevision(tx, { prId: pr.id, revisionId: input.revisionId });
	const threads = [];
	for (const id of [...new Set(input.threadIds)]) {
		const thread = await readThread(tx, id);
		if (thread.prId !== pr.id) throw invalidInput("threadIds", "Every thread must belong to this PR.");
		threads.push(thread);
	}
	for (const draft of input.drafts)
		threads.push(
			await add(ctx, tx, {
				...draft,
				pr: input.pr,
				revisionId: draft.revisionId === undefined ? input.revisionId : draft.revisionId,
			}),
		);
	for (const id of input.recipients) {
		const [run] = await rows<{ id: string }>(tx, sql`SELECT id FROM agent_runs WHERE id = ${id}`);
		if (!run) throw invalidInput("recipients", "Select an existing agent run.");
	}
	const review: ReviewSubmission = {
		id: ulid(),
		prId: pr.id,
		url: pr.url,
		author: ctx.actor.name,
		verdict: input.verdict,
		body: input.body,
		revisionId: input.revisionId ?? null,
		threads,
		createdAt: ctx.now().toISOString(),
		deliveries: [],
	};
	await tx.execute(
		sql`INSERT INTO review_submissions (id, pr_id, request_id, actor, document, created_at) VALUES (${review.id}, ${pr.id}, ${input.requestId}, ${actor}, ${JSON.stringify(review)}::jsonb, ${review.createdAt})`,
	);
	for (const runId of [...new Set(input.recipients)])
		await tx.execute(
			sql`INSERT INTO review_deliveries (id, review_id, run_id) VALUES (${ulid()}, ${review.id}, ${runId})`,
		);
	await changed(ctx, tx, pr.id);
	return show(ctx, tx, { id: review.id });
}
export async function history(ctx: ServiceCtx, tx: Tx, input: { pr: string }) {
	const pr = await findPr(tx, input.pr);
	if (!pr) return [];
	const ids = await rows<{ id: string }>(
		tx,
		sql`SELECT id FROM review_submissions WHERE pr_id = ${pr.id} ORDER BY created_at DESC`,
	);
	const result = [];
	for (const id of ids) result.push(await show(ctx, tx, id));
	return result;
}
export async function inbox(ctx: ServiceCtx, tx: Tx, input: { runId?: string }) {
	const ids = await rows<{ id: string }>(
		tx,
		sql`SELECT DISTINCT d.review_id AS id FROM review_deliveries d JOIN agent_runs r ON r.id = d.run_id WHERE d.read_at IS NULL AND (${input.runId ?? null}::text IS NOT NULL AND d.run_id = ${input.runId ?? null} OR ${input.runId ?? null}::text IS NULL AND (r.id = ${ctx.actor.name} OR r.session_id = ${ctx.session}))`,
	);
	const result = [];
	for (const id of ids) result.push(await show(ctx, tx, id));
	return result;
}
export async function read(ctx: ServiceCtx, tx: Tx, input: { id: string; runId: string }) {
	const review = await show(ctx, tx, input);
	await tx.execute(
		sql`UPDATE review_deliveries SET read_at = ${ctx.now()} WHERE review_id = ${input.id} AND run_id = ${input.runId}`,
	);
	await changed(ctx, tx, review.prId);
	return show(ctx, tx, input);
}
